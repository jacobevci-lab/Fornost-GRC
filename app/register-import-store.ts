import type { Actor } from './api/auth/security';
import { canWriteModule, parseModuleAccess } from './module-access';
import { coreReferenceGuard, newCoreReferences, insertCoreRecords, CoreImportConflict, type NewCoreRecord } from './core-reference-write';
import { RegisterImportError, validateImportRows } from './register-import';
import { validModule, type ModuleName } from './core-record-validation';

type Identity = { id: string; email: string; role: string; policy: string | null };
const liveSql = `EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)`;
const liveValues = (who: Identity) => [who.id, who.email, who.role, who.policy];
async function identity(db: D1Database, actor: Actor, module: string) {
  const who = await db.prepare("SELECT u.id,lower(u.email) email,u.role,a.policy_json policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.status='Active'").bind(actor.id, actor.email.toLowerCase()).first<Identity>();
  if (!who || who.role !== actor.role || !canWriteModule({ role: who.role, moduleAccess: parseModuleAccess(who.policy) }, module)) throw new RegisterImportError('forbidden', [], 403);
  return who;
}
async function references(db: D1Database, module: string, rows: Record<string, unknown>[], who: Identity) {
  const guard = coreReferenceGuard(rows.flatMap((row, i) => newCoreReferences(`preview:${i}`, module, row)));
  if (!await db.prepare(`SELECT 1 ready WHERE ${liveSql} AND ${guard.sql}`).bind(...liveValues(who), ...guard.values).first()) throw new RegisterImportError('reference-unavailable', [], 422);
  if (module === 'Denetim Yönetimi' && await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_closure_state'").first()) {
    const closed = await db.prepare("SELECT 1 closed FROM simple_audits a JOIN audit_closure_state c ON c.audit_id=a.id AND c.state='closed' WHERE a.name IN (SELECT json_extract(value,'$.auditName') FROM json_each(?)) LIMIT 1").bind(JSON.stringify(rows)).first();
    if (closed) throw new RegisterImportError('audit-closed', [], 409);
  }
}
export async function previewRegisterImport(db: D1Database, actor: Actor, module: unknown, input: unknown) {
  if (!validModule(module)) throw new RegisterImportError('mapping');
  const who = await identity(db, actor, module), checked = validateImportRows(module, input);
  if (checked.issues.length) throw new RegisterImportError('validation', checked.issues);
  await references(db, module, checked.rows, who);
  return { rows: checked.rows, count: checked.rows.length };
}
async function digest(module: string, rows: Record<string, unknown>[]) {
  const ordered = rows.map(row => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ module, rows: ordered }))))].map(x => x.toString(16).padStart(2, '0')).join('');
}
type Receipt = { version: 1; actorId: string; module: string; digest: string; imported: number };
async function receipt(db: D1Database, key: string, expected: Receipt, who: Identity) {
  const stored = await db.prepare(`SELECT value FROM simple_grc_metadata WHERE key=? AND ${liveSql}`).bind(key, ...liveValues(who)).first<{ value: string }>();
  if (!stored) return null;
  const value = JSON.parse(stored.value) as Receipt;
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new RegisterImportError('import-conflict', [], 409);
  return { imported: value.imported, replayed: true };
}
/** The receipt and rows commit together; a lost response can be retried with the same actor/token/content. */
export async function commitRegisterImport(db: D1Database, actor: Actor, module: unknown, input: unknown, token: unknown,
  allocate: (module: ModuleName, rows: Record<string, unknown>[]) => Promise<NewCoreRecord[]>, now = new Date()) {
  if (!validModule(module)) throw new RegisterImportError('mapping');
  if (typeof token !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(token)) throw new RegisterImportError('import-token');
  const who = await identity(db, actor, module), checked = validateImportRows(module, input);
  if (checked.issues.length) throw new RegisterImportError('validation', checked.issues);
  const key = `core-import:${encodeURIComponent(actor.id)}:${token}`;
  const expected: Receipt = { version: 1, actorId: actor.id, module, digest: await digest(module, checked.rows), imported: checked.rows.length };
  const prior = await receipt(db, key, expected, who);
  if (prior) return prior;
  await references(db, module, checked.rows, who);
  const records = await allocate(module, checked.rows);
  try {
    await insertCoreRecords(db, module, records, now.toISOString(), { key, value: JSON.stringify(expected), guard: { sql: liveSql, values: liveValues(who) } });
  } catch (error) {
    if (!(error instanceof CoreImportConflict)) throw error;
    const live = await identity(db, actor, module), recovered = await receipt(db, key, expected, live);
    if (recovered) return recovered;
    await references(db, module, checked.rows, live);
    throw new RegisterImportError('import-conflict-live', [], 409);
  }
  return { imported: records.length, replayed: false };
}
