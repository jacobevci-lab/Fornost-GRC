import type { Actor } from '../api/auth/security';
import { completedInitialization } from '../completed-initialization';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { isScoped, parseModuleAccess } from '../module-access';
import { validPolicyReviewDate } from './periodic-review';
import { validatePolicy, validatePolicyVersion } from './domain';
import { attestationPhrase, type AttestationRow as Row, type AttestationSource, type AttestationReceipt, type AttestationWorkspace } from './attestation';

export const attestationReceiptSchema = [
  `CREATE TABLE IF NOT EXISTS policy_attestation_receipts(id TEXT PRIMARY KEY NOT NULL,attestation_id TEXT NOT NULL UNIQUE,source_revision TEXT NOT NULL,decision TEXT NOT NULL,note TEXT NOT NULL,content_sha256 TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,actor TEXT NOT NULL,responded_at TEXT NOT NULL)`,
  `CREATE TRIGGER IF NOT EXISTS policy_attestation_receipt_no_update BEFORE UPDATE ON policy_attestation_receipts BEGIN SELECT RAISE(ABORT,'immutable-attestation-receipt'); END`,
  `CREATE TRIGGER IF NOT EXISTS policy_attestation_receipt_no_delete BEFORE DELETE ON policy_attestation_receipts BEGIN SELECT RAISE(ABORT,'immutable-attestation-receipt'); END`,
];
const initialize = completedInitialization();
async function ready(db: D1Database) { await initialize(db, async () => { for (const sql of attestationReceiptSchema) await db.prepare(sql).run(); }); }
export class PolicyAttestationError extends Error {
  constructor(public code: 'ATTESTATION_INPUT' | 'ATTESTATION_ACCESS' | 'ATTESTATION_CONFLICT', public status: number) { super(code); }
}
type ReceiptRow = { id: string; attestation_id: string; source_revision: string; decision: string; note: string; content_sha256: string; snapshot_json: string; actor_id: string; actor: string; responded_at: string };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const revision = (s: Omit<AttestationSource, 'revision' | 'contentVerified'>) => hash(JSON.stringify({ attestation: s.attestation, campaign: s.campaign, policy: s.policy, version: s.version }));
async function verified(s: Omit<AttestationSource, 'revision' | 'contentVerified'>) {
  try {
    const { attestation: a, campaign: c, policy: p, version: v } = s;
    validatePolicy({ ...p, reviewFrequencyDays: p.review_frequency_days });
    const mappings = [v.control_refs_json, v.regulation_refs_json, v.risk_refs_json].map(value => JSON.parse(String(value)));
    if (!mappings.every(value => Array.isArray(value) && value.length <= 50 && value.every(x => typeof x === 'string' && x.length > 0 && x.length <= 160))) return false;
    const valid = validatePolicyVersion({ ...v, policyId: v.policy_id, effectiveDate: v.effective_date, controlRefs: mappings[0], regulationRefs: mappings[1], riskRefs: mappings[2] });
    return valid.content === v.content && valid.summary === v.summary && valid.effectiveDate === v.effective_date && validPolicyReviewDate(c.due_date) && p.status === 'published' && ['published', 'superseded'].includes(String(v.status)) &&
      a.campaign_id === c.id && c.policy_id === p.id && c.version_id === v.id && v.policy_id === p.id &&
      ['open', 'closed'].includes(String(c.status)) && ['pending', 'attested', 'declined'].includes(String(a.status)) &&
      Number.isInteger(v.version_number) && Number(v.version_number) > 0 && Number.isFinite(Date.parse(String(a.updated_at))) && await hash(String(v.content)) === v.content_sha256;
  } catch { return false; }
}
async function liveAccount(db: D1Database, actor: Actor) {
  const live = await db.prepare('SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id).first<Row>();
  if (!live || live.role !== actor.role || !['Admin', 'Editor', 'Viewer'].includes(String(live.role)) || live.status !== 'Active' || String(live.email).toLowerCase() !== actor.email.toLowerCase() || isScoped({ role: actor.role, moduleAccess: parseModuleAccess(live.policy_json as string | null) })) throw new PolicyAttestationError('ATTESTATION_ACCESS', 403);
  return live;
}
async function source(db: D1Database, actor: Actor, id: string): Promise<AttestationSource> {
  const attestation = await db.prepare('SELECT * FROM policy_attestations WHERE id=?').bind(id).first<Row>();
  if (!attestation || String(attestation.subject_email).toLowerCase() !== actor.email.toLowerCase()) throw new PolicyAttestationError('ATTESTATION_ACCESS', 403);
  const campaign = await db.prepare('SELECT * FROM policy_attestation_campaigns WHERE id=?').bind(attestation.campaign_id).first<Row>();
  if (!campaign) throw new PolicyAttestationError('ATTESTATION_CONFLICT', 409);
  const policy = await db.prepare('SELECT * FROM policy_documents WHERE id=?').bind(campaign.policy_id).first<Row>();
  const version = await db.prepare('SELECT * FROM policy_versions WHERE id=? AND policy_id=?').bind(campaign.version_id, campaign.policy_id).first<Row>();
  if (!policy || !version) throw new PolicyAttestationError('ATTESTATION_CONFLICT', 409);
  const value = { attestation, campaign, policy, version };
  return { ...value, revision: await revision(value), contentVerified: await verified(value) };
}
async function receiptValue(row: ReceiptRow): Promise<AttestationReceipt> {
  let snapshot: AttestationSource | null = null;
  try {
    const value = JSON.parse(row.snapshot_json), s = value.source;
    if (value.schema === 1 && s.attestation.id === row.attestation_id && s.attestation.subject_email.toLowerCase() === row.actor.toLowerCase() && s.attestation.status === 'pending' && s.campaign.status === 'open' && s.version.content_sha256 === row.content_sha256 && s.revision === row.source_revision && await verified(s) && await revision(s) === row.source_revision) snapshot = s;
  } catch { /* Keep decision metadata and label unavailable context explicitly. */ }
  return { id: row.id, actor: row.actor, respondedAt: row.responded_at, decision: row.decision, note: row.note, contentSha256: row.content_sha256, snapshot };
}
export async function readPolicyAttestation(db: D1Database, actor: Actor, params: URLSearchParams): Promise<AttestationWorkspace> {
  const id = params.get('attestationId');
  if (!validId(id) || params.getAll('attestationId').length !== 1) throw new PolicyAttestationError('ATTESTATION_INPUT', 400);
  await liveAccount(db, actor); await ready(db);
  const current = await source(db, actor, id);
  const row = await db.prepare('SELECT * FROM policy_attestation_receipts WHERE attestation_id=? AND actor_id=?').bind(id, actor.id).first<ReceiptRow>();
  return { ...current, canRespond: current.contentVerified && current.attestation.status === 'pending' && current.campaign.status === 'open', previousVersion: current.policy.current_version_id !== current.version.id, receipt: row ? await receiptValue(row) : null };
}
// Optional reviewed mode preserves existing integrations; the application always uses this mode.
export async function respondToPolicy(db: D1Database, actor: Actor, input: Record<string, unknown>) {
  const { attestationId, requestId, expectedRevision, decision } = input;
  if (!validId(attestationId) || typeof requestId !== 'string' || !/^PAR-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId) || typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision) || !['attested', 'declined'].includes(String(decision)) || typeof input.note !== 'string' || input.note.trim().length < 3 || input.note.length > 1000 || /\u0000/.test(input.note) || input.confirmation !== attestationPhrase(String(decision))) throw new PolicyAttestationError('ATTESTATION_INPUT', 400);
  const note = input.note.trim(), live = await liveAccount(db, actor); await ready(db);
  const existing = await db.prepare('SELECT * FROM policy_attestation_receipts WHERE id=?').bind(requestId).first<ReceiptRow>();
  if (existing) {
    if (existing.attestation_id !== attestationId || existing.actor_id !== actor.id || existing.actor !== actor.email || existing.source_revision !== expectedRevision || existing.decision !== decision || existing.note !== note) throw new PolicyAttestationError('ATTESTATION_CONFLICT', 409);
    return { id: existing.id, decision: existing.decision, replay: true };
  }
  const current = await source(db, actor, attestationId), { attestation, campaign, policy, version } = current;
  if (current.revision !== expectedRevision || !current.contentVerified || attestation.status !== 'pending' || campaign.status !== 'open') throw new PolicyAttestationError('ATTESTATION_CONFLICT', 409);
  const rows = [['policy_attestation_campaigns', campaign], ['policy_documents', policy], ['policy_versions', version]] as const;
  if (rows.some(([, row]) => Object.keys(row).some(key => !/^[a-z_][a-z0-9_]*$/.test(key)))) throw new PolicyAttestationError('ATTESTATION_CONFLICT', 409);
  const guard = { sql: rows.map(([table, row]) => `EXISTS (SELECT 1 FROM ${table} s WHERE ${Object.keys(row).map(key => `s.${key} IS ?`).join(' AND ')})`).join(' AND ') + ` AND EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)`, values: [...rows.flatMap(([, row]) => Object.values(row)), live.id, live.email, live.role, live.policy_json] };
  const stamp = nextLifecycleStamp(attestation.updated_at);
  await commitLifecycle(db, lifecycleClaim(db, 'policy_attestations', 'status=?,note=?,content_sha256=?,attested_at=?,updated_at=?', [decision, note, version.content_sha256, stamp, stamp], attestation, guard), [
    lifecycleInsert(db, 'policy_attestation_receipts', { id: requestId, attestation_id: attestationId, source_revision: expectedRevision, decision: String(decision), note, content_sha256: String(version.content_sha256), snapshot_json: JSON.stringify({ schema: 1, source: current }), actor_id: actor.id, actor: actor.email, responded_at: stamp }),
    lifecycleInsert(db, 'policy_events', { id: crypto.randomUUID(), policy_id: String(policy.id), version_id: String(version.id), campaign_id: String(campaign.id), exception_id: null, action: `attestation-${decision}`, detail: JSON.stringify({ receiptId: requestId, attestationId, contentSha256: version.content_sha256 }), actor: actor.email, created_at: stamp }),
  ]);
  return { id: requestId, decision, replay: false };
}
