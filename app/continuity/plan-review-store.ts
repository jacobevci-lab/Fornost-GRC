import type { Actor } from '../api/auth/security';
import { completedInitialization } from '../completed-initialization';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { validateContinuityPlan } from './domain';
import { publicContinuityPlan, independentPlanReviewer, validPlanReviewDate, type ContinuityPlan, type ContinuityPlanReview } from './plan';

export const planReviewSchema = [
  `CREATE TABLE IF NOT EXISTS enterprise_continuity_plan_reviews(id TEXT PRIMARY KEY NOT NULL,plan_id TEXT NOT NULL,source_revision TEXT NOT NULL,previous_date TEXT NOT NULL,next_date TEXT NOT NULL,note TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor_id TEXT NOT NULL,actor TEXT NOT NULL,reviewed_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS enterprise_continuity_plan_reviews_parent_idx ON enterprise_continuity_plan_reviews(plan_id,reviewed_at,id)`,
  `CREATE TRIGGER IF NOT EXISTS continuity_plan_review_no_update BEFORE UPDATE ON enterprise_continuity_plan_reviews BEGIN SELECT RAISE(ABORT,'immutable-plan-review'); END`,
  `CREATE TRIGGER IF NOT EXISTS continuity_plan_review_no_delete BEFORE DELETE ON enterprise_continuity_plan_reviews BEGIN SELECT RAISE(ABORT,'immutable-plan-review'); END`,
];
const initialize = completedInitialization();
export async function ensurePlanReviewSchema(db: D1Database) {
  await initialize(db, async () => { for (const sql of planReviewSchema) await db.prepare(sql).run(); });
}
export class PlanReviewError extends Error {
  constructor(public code: 'REVIEW_INPUT' | 'REVIEW_ACCESS' | 'REVIEW_CONFLICT' | 'REVIEW_MISSING', public status: number) { super(code); }
}
type Row = Record<string, string | number | null>;
type ReviewRow = { id: string; plan_id: string; source_revision: string; previous_date: string; next_date: string; note: string; snapshot_json: string; actor_id: string; actor: string; reviewed_at: string };
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
function readSnapshot(value: string): ContinuityPlan | null {
  try {
    const item = JSON.parse(value);
    if (item?.schema !== 1 || !item.plan || item.plan.status !== 'active' || !Number.isInteger(item.plan.version) || item.plan.version < 1 || !idValid(item.plan.id) || typeof item.plan.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.plan.updatedAt)) || typeof item.plan.createdBy !== 'string') return null;
    validateContinuityPlan(item.plan);
    return item.plan as ContinuityPlan;
  } catch { return null; }
}
const publicReview = (r: ReviewRow): ContinuityPlanReview => ({ id: r.id, planId: r.plan_id, previousDate: r.previous_date, nextDate: r.next_date, note: r.note, actor: r.actor, reviewedAt: r.reviewed_at, snapshot: readSnapshot(r.snapshot_json) });

export async function readPlanReviews(db: D1Database, actor: Actor, params: URLSearchParams) {
  const id = params.get('planId');
  if (!idValid(id) || params.getAll('planId').length !== 1) throw new PlanReviewError('REVIEW_INPUT', 400);
  await ensurePlanReviewSchema(db);
  const row = await db.prepare('SELECT * FROM enterprise_continuity_plans WHERE id=?').bind(id).first<Row>();
  if (!row) throw new PlanReviewError('REVIEW_MISSING', 404);
  const plan = publicContinuityPlan(row);
  const records = await db.prepare('SELECT * FROM enterprise_continuity_plan_reviews WHERE plan_id=? ORDER BY reviewed_at DESC,id DESC LIMIT 21').bind(id).all<ReviewRow>();
  const reviews = records.results.slice(0, 20).map(publicReview);
  return { plan, canReview: plan.status === 'active' && independentPlanReviewer(plan, actor), reviews, hasMore: records.results.length > 20, historyVerified: reviews.every(review => review.snapshot !== null) };
}

export async function recordPlanReview(db: D1Database, actor: Actor, input: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const { planId, requestId, expectedRevision, nextReviewDate } = input;
  if (!idValid(planId) || typeof requestId !== 'string' || !/^BPR-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId) ||
      typeof expectedRevision !== 'string' || expectedRevision.length > 40 || !Number.isFinite(Date.parse(expectedRevision)) || !validPlanReviewDate(nextReviewDate) ||
      typeof input.note !== 'string' || input.note.trim().length < 20 || input.note.length > 2000 || /\u0000/.test(input.note) || input.confirmation !== 'PLAN REVIEWED') throw new PlanReviewError('REVIEW_INPUT', 400);
  const note = input.note.trim();
  if (actor.role !== 'Admin' || !actor.id) throw new PlanReviewError('REVIEW_ACCESS', 403);
  await ensurePlanReviewSchema(db);
  const row = await db.prepare('SELECT * FROM enterprise_continuity_plans WHERE id=?').bind(planId).first<Row>();
  if (!row) throw new PlanReviewError('REVIEW_MISSING', 404);
  const plan = publicContinuityPlan(row);
  if (!independentPlanReviewer(plan, actor)) throw new PlanReviewError('REVIEW_ACCESS', 403);
  const live = await db.prepare("SELECT u.id,u.email,u.role,u.status,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=?").bind(actor.id).first<{ id: string; email: string; role: string; status: string; policy_json: string | null }>();
  if (!live || live.role !== 'Admin' || live.status !== 'Active' || live.email.toLowerCase() !== actor.email.toLowerCase()) throw new PlanReviewError('REVIEW_ACCESS', 403);
  const existing = await db.prepare('SELECT * FROM enterprise_continuity_plan_reviews WHERE id=?').bind(requestId).first<ReviewRow>();
  if (existing) {
    if (existing.plan_id !== planId || existing.actor_id !== actor.id || existing.actor !== actor.email || existing.source_revision !== expectedRevision || existing.next_date !== nextReviewDate || existing.note !== note) throw new PlanReviewError('REVIEW_CONFLICT', 409);
    return { id: existing.id, nextReviewDate: existing.next_date, replay: true };
  }
  if (plan.status !== 'active' || row.updated_at !== expectedRevision) throw new PlanReviewError('REVIEW_CONFLICT', 409);
  try { validateContinuityPlan(plan); } catch { throw new PlanReviewError('REVIEW_CONFLICT', 409); }
  if (nextReviewDate <= today || nextReviewDate <= plan.reviewDate) throw new PlanReviewError('REVIEW_INPUT', 400);
  const stamp = nextLifecycleStamp(row.updated_at);
  const guard = { sql: "EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.email=? AND u.role='Admin' AND u.status='Active' AND a.policy_json IS ?)", values: [live.id, live.email, live.policy_json] };
  await commitLifecycle(db, lifecycleClaim(db, 'enterprise_continuity_plans', 'review_date=?,updated_by=?,updated_at=?', [nextReviewDate, actor.email, stamp], row, guard), [
    lifecycleInsert(db, 'enterprise_continuity_plan_reviews', { id: requestId, plan_id: planId, source_revision: expectedRevision, previous_date: plan.reviewDate, next_date: nextReviewDate, note, snapshot_json: JSON.stringify({ schema: 1, plan }), actor_id: actor.id, actor: actor.email, reviewed_at: stamp }),
    lifecycleInsert(db, 'enterprise_continuity_events', { id: crypto.randomUUID(), entity_type: 'plan', entity_id: planId, action: 'periodic-review', detail: `${requestId}; ${plan.reviewDate} -> ${nextReviewDate}; ${note}`, actor: actor.email, created_at: stamp }),
  ]);
  return { id: requestId, nextReviewDate, replay: false };
}
