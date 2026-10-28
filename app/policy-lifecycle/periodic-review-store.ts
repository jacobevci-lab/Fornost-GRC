import type { Actor } from '../api/auth/security';
import { completedInitialization } from '../completed-initialization';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { readPolicyDecision } from './decision-store';
import { validatePolicy, validatePolicyVersion } from './domain';
import { independentPolicyReviewer, validPolicyReviewDate, policyReviewWindow, type PolicyReviewRow, type PolicyReviewSource, type PolicyReview } from './periodic-review';

export const policyReviewSchema = [
  `CREATE TABLE IF NOT EXISTS policy_periodic_reviews(id TEXT PRIMARY KEY NOT NULL,policy_id TEXT NOT NULL,version_id TEXT NOT NULL,source_revision TEXT NOT NULL,previous_date TEXT NOT NULL,next_date TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,actor TEXT NOT NULL,reviewed_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS policy_periodic_reviews_parent_idx ON policy_periodic_reviews(policy_id,reviewed_at,id)`,
  `CREATE TRIGGER IF NOT EXISTS policy_periodic_review_no_update BEFORE UPDATE ON policy_periodic_reviews BEGIN SELECT RAISE(ABORT,'immutable-policy-review'); END`,
  `CREATE TRIGGER IF NOT EXISTS policy_periodic_review_no_delete BEFORE DELETE ON policy_periodic_reviews BEGIN SELECT RAISE(ABORT,'immutable-policy-review'); END`,
];
const initialize = completedInitialization();
export async function ensurePolicyReviewSchema(db: D1Database) { await initialize(db, async () => { for (const sql of policyReviewSchema) await db.prepare(sql).run(); }); }
export class PolicyReviewError extends Error {
  constructor(public code: 'POLICY_REVIEW_INPUT' | 'POLICY_REVIEW_ACCESS' | 'POLICY_REVIEW_CONFLICT', public status: number) { super(code); }
}
type ReviewRow = { id: string; policy_id: string; version_id: string; source_revision: string; previous_date: string; next_date: string; note: string; snapshot_json: string; actor_id: string; actor: string; reviewed_at: string };
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
async function contentVerified(policy: PolicyReviewRow, version: PolicyReviewRow) {
  try {
    validatePolicy({ ...policy, reviewFrequencyDays: policy.review_frequency_days });
    validatePolicyVersion({ ...version, policyId: version.policy_id, effectiveDate: version.effective_date, controlRefs: JSON.parse(String(version.control_refs_json)), regulationRefs: JSON.parse(String(version.regulation_refs_json)), riskRefs: JSON.parse(String(version.risk_refs_json)) });
    return policy.status === 'published' && version.status === 'published' && policy.current_version_id === version.id && version.policy_id === policy.id && validPolicyReviewDate(policy.next_review) && Number.isFinite(Date.parse(String(policy.updated_at))) && Number.isInteger(version.version_number) && Number(version.version_number) > 0 && await hash(String(version.content)) === version.content_sha256;
  } catch { return false; }
}
async function source(db: D1Database, id: string): Promise<PolicyReviewSource> {
  const { policy, version } = await readPolicyDecision(db, 'retire', id);
  const pendingRevision = !!await db.prepare("SELECT id FROM policy_versions WHERE policy_id=? AND id<>? AND status IN ('draft','review','approved') LIMIT 1").bind(id, version.id).first();
  return { policy, version, pendingRevision, contentVerified: await contentVerified(policy, version), revision: await hash(JSON.stringify({ policy, version, pendingRevision })) };
}
async function publicReview(row: ReviewRow): Promise<PolicyReview> {
  let snapshot: PolicyReviewSource | null = null;
  try {
    const value = JSON.parse(row.snapshot_json);
    if (value.schema === 1 && value.source?.policy?.id === row.policy_id && value.source?.version?.id === row.version_id && value.source.revision === row.source_revision && value.source.policy.next_review === row.previous_date && !value.source.pendingRevision && await contentVerified(value.source.policy, value.source.version) && await hash(JSON.stringify({ policy: value.source.policy, version: value.source.version, pendingRevision: false })) === row.source_revision) snapshot = value.source;
  } catch { /* Retain the decision metadata and explicitly mark unreadable context. */ }
  return { id: row.id, actor: row.actor, reviewedAt: row.reviewed_at, previousDate: row.previous_date, nextDate: row.next_date, note: row.note, snapshot };
}
export async function readPolicyReviews(db: D1Database, actor: Actor, params: URLSearchParams) {
  const id = params.get('policyId');
  if (!idValid(id) || params.getAll('policyId').length !== 1) throw new PolicyReviewError('POLICY_REVIEW_INPUT', 400);
  await ensurePolicyReviewSchema(db);
  const current = await source(db, id);
  const rows = await db.prepare('SELECT * FROM policy_periodic_reviews WHERE policy_id=? ORDER BY reviewed_at DESC,id DESC LIMIT 21').bind(id).all<ReviewRow>();
  const reviews = await Promise.all(rows.results.slice(0, 20).map(publicReview));
  const window = current.contentVerified ? policyReviewWindow(String(current.policy.next_review), Number(current.policy.review_frequency_days)) : { minimumDate: '', maximumDate: '' };
  return { ...current, ...window, canReview: current.contentVerified && !current.pendingRevision && independentPolicyReviewer(current, actor) && window.minimumDate <= window.maximumDate, reviews, hasMore: rows.results.length > 20, historyVerified: reviews.every(r => r.snapshot !== null) };
}
export async function recordPolicyReview(db: D1Database, actor: Actor, input: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const { policyId, requestId, expectedRevision, nextReviewDate } = input;
  if (!idValid(policyId) || typeof requestId !== 'string' || !/^PPR-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId) || typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision) || !validPolicyReviewDate(nextReviewDate) || typeof input.note !== 'string' || input.note.trim().length < 20 || input.note.length > 2000 || /\u0000/.test(input.note) || input.confirmation !== 'POLICY REVIEWED') throw new PolicyReviewError('POLICY_REVIEW_INPUT', 400);
  const note = input.note.trim();
  if (actor.role !== 'Admin' || !actor.id) throw new PolicyReviewError('POLICY_REVIEW_ACCESS', 403);
  await ensurePolicyReviewSchema(db);
  const live = await db.prepare('SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?').bind(actor.id).first<PolicyReviewRow>();
  if (!live || live.role !== 'Admin' || live.status !== 'Active' || String(live.email).toLowerCase() !== actor.email.toLowerCase()) throw new PolicyReviewError('POLICY_REVIEW_ACCESS', 403);
  const existing = await db.prepare('SELECT * FROM policy_periodic_reviews WHERE id=?').bind(requestId).first<ReviewRow>();
  if (existing) {
    if (existing.policy_id !== policyId || existing.actor_id !== actor.id || existing.actor !== actor.email || existing.source_revision !== expectedRevision || existing.next_date !== nextReviewDate || existing.note !== note) throw new PolicyReviewError('POLICY_REVIEW_CONFLICT', 409);
    return { id: existing.id, nextReviewDate: existing.next_date, replay: true };
  }
  const current = await source(db, policyId), { policy, version } = current;
  if (!independentPolicyReviewer(current, actor)) throw new PolicyReviewError('POLICY_REVIEW_ACCESS', 403);
  if (current.revision !== expectedRevision || !current.contentVerified || current.pendingRevision) throw new PolicyReviewError('POLICY_REVIEW_CONFLICT', 409);
  const window = policyReviewWindow(String(policy.next_review), Number(policy.review_frequency_days), today);
  if (nextReviewDate <= today || nextReviewDate <= String(policy.next_review) || nextReviewDate < window.minimumDate || nextReviewDate > window.maximumDate) throw new PolicyReviewError('POLICY_REVIEW_INPUT', 400);
  const keys = Object.keys(version);
  if (keys.some(key => !/^[a-z_][a-z0-9_]*$/.test(key))) throw new PolicyReviewError('POLICY_REVIEW_CONFLICT', 409);
  const guard = { sql: `EXISTS (SELECT 1 FROM policy_versions v WHERE ${keys.map(key => `v.${key} IS ?`).join(' AND ')}) AND NOT EXISTS (SELECT 1 FROM policy_versions v WHERE v.policy_id=? AND v.id<>? AND v.status IN ('draft','review','approved')) AND EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role='Admin' AND u.status='Active' AND a.policy_json IS ?)`, values: [...Object.values(version), policyId, version.id, live.id, live.email, live.policy_json] };
  const stamp = nextLifecycleStamp(policy.updated_at);
  await commitLifecycle(db, lifecycleClaim(db, 'policy_documents', 'next_review=?,updated_by=?,updated_at=?', [nextReviewDate, actor.email, stamp], policy, guard), [
    lifecycleInsert(db, 'policy_periodic_reviews', { id: requestId, policy_id: policyId, version_id: String(version.id), source_revision: expectedRevision, previous_date: String(policy.next_review), next_date: nextReviewDate, note, snapshot_json: JSON.stringify({ schema: 1, source: current }), actor_id: actor.id, actor: actor.email, reviewed_at: stamp }),
    lifecycleInsert(db, 'policy_events', { id: crypto.randomUUID(), policy_id: policyId, version_id: String(version.id), campaign_id: null, exception_id: null, action: 'periodic-review', detail: JSON.stringify({ reviewId: requestId, previousDate: policy.next_review, nextDate: nextReviewDate }), actor: actor.email, created_at: stamp }),
  ]);
  return { id: requestId, nextReviewDate, replay: false };
}
