import { reportCanonical } from './audit-status-report';
import { ensureEvidenceHistorySchema } from './evidence/versioning';
import type { Actor } from './api/auth/security';
import { canReadModule, canWriteModule, parseModuleAccess } from './module-access';
import { AuditRequestError } from './audit-requests';
import { auditRequestId, readRequestEvidence, requireAuditParent } from './audit-request-store';
import { ensureAuditClosureSchema } from './audit-closure-schema';
import { requireWorkpaperComplete, validateWorkpaper, workpaperDueAt, type AuditWorkpaper } from './audit-workpapers';
type Stored = { id: string; audit_id: string; revision: string; data_json: string; created_at: string; updated_at: string };
export function publicWorkpaper(row: Stored): AuditWorkpaper { return { ...JSON.parse(row.data_json), id: row.id, auditId: row.audit_id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at }; }
export async function readWorkpapers(db: D1Database, auditId: string) {
  auditRequestId(auditId); await ensureAuditClosureSchema(db); await requireAuditParent(db, auditId);
  const rows = await db.prepare('SELECT * FROM audit_workpapers WHERE audit_id=? ORDER BY updated_at DESC,id LIMIT 101').bind(auditId).all<Stored>();
  return { papers: rows.results.slice(0, 100).map(publicWorkpaper), complete: rows.results.length <= 100 };
}
/** Minimal inbox projection; sample details and evidence identifiers never leave this query. */
export async function readWorkpaperWork(db: D1Database, actor: Actor) {
  if (!canReadModule(actor, 'Denetim Yönetimi') || !canReadModule(actor, 'Kanıtlar')) return { workpapers: [], complete: true };
  await ensureAuditClosureSchema(db);
  const rows = await db.prepare(`SELECT p.id,p.audit_id AS auditId,
    json_extract(p.data_json,'$.title') AS title,json_extract(p.data_json,'$.status') AS status,
    json_extract(p.data_json,'$.owner') AS owner,json_extract(p.data_json,'$.reviewer') AS reviewer,
    json_extract(p.data_json,'$.dueDate') AS dueDate,json_extract(p.data_json,'$.reviewDueDate') AS reviewDueDate,
    json_extract(p.data_json,'$.timeZone') AS timeZone,
    p.created_at AS createdAt,p.updated_at AS updatedAt
    FROM audit_workpapers p JOIN simple_audits a ON a.id=p.audit_id
    ORDER BY p.updated_at DESC,p.id LIMIT 1001`).all<Record<string, unknown> & { status: string; dueDate: string | null; reviewDueDate: string | null; timeZone: string | null }>();
  return { workpapers: rows.results.slice(0, 1000).map(row => ({ ...row, dueAt: workpaperDueAt({ ...row, dueDate: row.dueDate ?? '', reviewDueDate: row.reviewDueDate ?? '', timeZone: row.timeZone ?? 'UTC' }) })), complete: rows.results.length <= 1000 };
}
export async function mutateWorkpaper(db: D1Database, actor: Actor, input: Record<string, unknown>, now = new Date()) {
  if (!canWriteModule(actor, 'Denetim Yönetimi') || !canReadModule(actor, 'Kanıtlar')) throw new AuditRequestError('forbidden', 403);
  const auditId = auditRequestId(input.auditId), id = auditRequestId(input.id), action = String(input.action);
  if (!['save', 'submit', 'approve', 'return', 'reopen', 'cancel', 'withdraw'].includes(action) || typeof input.expectedRevision !== 'string' || input.expectedRevision.length > 100) throw new AuditRequestError('fields');
  await ensureAuditClosureSchema(db); await requireAuditParent(db, auditId);
  const raw = await db.prepare('SELECT * FROM audit_workpapers WHERE id=? AND audit_id=?').bind(id, auditId).first<Stored>();
  const current = raw ? publicWorkpaper(raw) : null;
  if ((current?.revision || '') !== input.expectedRevision) throw new AuditRequestError('conflict', 409);
  const email = actor.email.toLowerCase();
  let fields, status: AuditWorkpaper['status'];
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 2000 || (action !== 'save' && note.length < 3)) throw new AuditRequestError('note');
  if (action === 'save') {
    if (current && current.status !== 'draft') throw new AuditRequestError('transition', 409);
    if (current && email !== current.owner && actor.role !== 'Admin') throw new AuditRequestError('owner', 403);
    // Older clients omit scheduling fields; they must not silently remove existing deadlines.
    const supplied = input.fields;
    fields = validateWorkpaper(supplied && typeof supplied === 'object' && !Array.isArray(supplied) ? { dueDate: current?.dueDate, reviewDueDate: current?.reviewDueDate, timeZone: current?.timeZone, ...supplied } : supplied); status = 'draft';
    if (actor.role !== 'Admin' && fields.owner !== email) throw new AuditRequestError('owner', 403);
  } else {
    if (!current) throw new AuditRequestError('missing', 404);
    fields = validateWorkpaper(current); status = current.status;
    if (action === 'submit') { if (status !== 'draft') throw new AuditRequestError('transition', 409); if (email !== current.owner) throw new AuditRequestError('owner', 403); requireWorkpaperComplete(fields); status = 'submitted'; }
    if (action === 'approve' || action === 'return') { if (status !== 'submitted') throw new AuditRequestError('transition', 409); if (email !== current.reviewer || email === current.owner) throw new AuditRequestError('independent-review', 403); status = action === 'approve' ? 'approved' : 'draft'; }
    if (action === 'withdraw') { if (status !== 'submitted') throw new AuditRequestError('transition', 409); if (email !== current.owner && actor.role !== 'Admin') throw new AuditRequestError('owner', 403); status = 'draft'; }
    if (action === 'reopen') { if (status !== 'approved') throw new AuditRequestError('transition', 409); if (email !== current.owner && actor.role !== 'Admin') throw new AuditRequestError('owner', 403); status = 'draft'; }
    if (action === 'cancel') { if (status !== 'draft') throw new AuditRequestError('transition', 409); if (email !== current.owner && actor.role !== 'Admin') throw new AuditRequestError('owner', 403); status = 'cancelled'; }
  }
  // Reviewers must never approve content they themselves saved on behalf of its owner.
  if (action === 'save' && email === fields.reviewer) throw new AuditRequestError('independent-review', 403);
  const recovery = ['return', 'withdraw', 'reopen', 'cancel'].includes(action);
  const emails = [...new Set(recovery ? [email] : [email, fields.owner, fields.reviewer])];
  const people = await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND lower(u.email) IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(emails)).all<{ id: string; email: string; role: string; policy: string | null }>();
  if (people.results.length !== emails.length || !people.results.some(p => p.id === actor.id && p.email === email && p.role === actor.role) || people.results.some(p => !canWriteModule({ role: p.role, moduleAccess: parseModuleAccess(p.policy) }, 'Denetim Yönetimi') || !canReadModule({ role: p.role, moduleAccess: parseModuleAccess(p.policy) }, 'Kanıtlar'))) throw new AuditRequestError('assignee', 403);
  if (action === 'approve' && await db.prepare("SELECT id FROM audit_workpaper_events WHERE audit_id=? AND workpaper_id=? AND actor=? AND action='save' LIMIT 1").bind(auditId, id, email).first()) throw new AuditRequestError('independent-review', 403);
  await ensureEvidenceHistorySchema(db);
  const ids = [...new Set(fields.samples.map(s => s.versionId).filter(Boolean))];
  // Limit is 100 samples; split explicit lookups below the D1 100-binding ceiling.
  const evidence = recovery && current ? current.evidence : []; for (let offset = 0; !recovery && offset < ids.length; offset += 50) evidence.push(...await readRequestEvidence(db, ids.slice(offset, offset + 50)));
  if (evidence.length !== ids.length) throw new AuditRequestError('evidence');
  if (current && ['submit', 'approve'].includes(action) && reportCanonical([...current.evidence].sort((a,b) => a.id.localeCompare(b.id))) !== reportCanonical([...evidence].sort((a,b) => a.id.localeCompare(b.id)))) throw new AuditRequestError('evidence');
  const revision = crypto.randomUUID(), stamp = now.toISOString();
  const next: AuditWorkpaper = { ...fields, id, auditId, status, revision, note, evidence, createdAt: current?.createdAt || stamp, updatedAt: stamp };
  const evidenceGuard = (recovery ? [] : evidence).map(e => ({ id: e.id, evidenceId: e.evidenceId, versionNo: e.versionNo, title: e.title, fileName: e.fileName, fileKey: e.fileKey, hash: e.contentSha256, period: e.period }));
  const result = await db.batch([
    db.prepare(`INSERT INTO audit_workpapers(id,audit_id,revision,data_json,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?)
      AND COALESCE((SELECT revision FROM audit_workpapers WHERE id=? AND audit_id=?),'')=?
      AND (EXISTS(SELECT 1 FROM audit_workpapers WHERE id=? AND audit_id=?) OR (SELECT count(*) FROM audit_workpapers WHERE audit_id=?)<100)
      AND NOT EXISTS(SELECT 1 FROM audit_workpapers WHERE id=? AND audit_id<>?)
      AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(p.value,'$.id') AND lower(u.email)=json_extract(p.value,'$.email') AND u.role=json_extract(p.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(p.value,'$.policy')))
      AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' WHERE v.id=json_extract(e.value,'$.id') AND v.evidence_id=json_extract(e.value,'$.evidenceId') AND v.version_no=json_extract(e.value,'$.versionNo') AND v.evidence_title=json_extract(e.value,'$.title') AND v.file_name=json_extract(e.value,'$.fileName') AND v.file_key=json_extract(e.value,'$.fileKey') AND v.content_sha256=json_extract(e.value,'$.hash') AND v.period IS json_extract(e.value,'$.period')))
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at RETURNING id`).bind(id, auditId, revision, JSON.stringify(next), next.createdAt, stamp, auditId, id, auditId, input.expectedRevision, id, auditId, auditId, id, auditId, JSON.stringify(people.results), JSON.stringify(evidenceGuard)),
    db.prepare(`INSERT INTO audit_workpaper_events(id,audit_id,workpaper_id,actor,action,note,snapshot_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_workpapers WHERE id=? AND audit_id=? AND revision=?)`).bind(revision, auditId, id, email, action, note, JSON.stringify(next), stamp, id, auditId, revision),
  ]);
  if (!result[0].results.length) throw new AuditRequestError('conflict', 409);
  return { id, revision };
}
