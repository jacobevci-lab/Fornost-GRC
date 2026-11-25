import type { Actor } from './api/auth/security';
import { canReadModule, canWriteModule } from './module-access';
import { emptyAuditPlan } from './audit-plan';
import { AuditRequestError, validateRequestPreview, type AuditRequestWorkflow } from './audit-requests';
import { auditRequestId, ensureAuditRequestSchema, publicAuditRequest, requireAuditParent } from './audit-request-store';
import { workplanResolved, type WorkplanClosureDetail, type WorkplanEvent, type WorkplanPlan, type WorkplanSnapshot } from './audit-workplan';

type StoredRequest = Parameters<typeof publicAuditRequest>[0];
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
async function digest(snapshot: WorkplanSnapshot) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(snapshot)));
  return Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('');
}
async function ready(db: D1Database, auditId: string) { await ensureAuditRequestSchema(db); await requireAuditParent(db, auditId); }

export async function readWorkplanPreview(db: D1Database, auditId: string) {
  await ready(db, auditId);
  const result = await db.batch([
    db.prepare('SELECT * FROM audit_request_workflows WHERE audit_id=?').bind(auditId),
    db.prepare('SELECT value FROM simple_grc_metadata WHERE key=?').bind(`audit_plan_${auditId}`),
    db.prepare('SELECT * FROM audit_requests WHERE audit_id=? ORDER BY id LIMIT 501').bind(auditId),
    db.prepare('SELECT * FROM simple_audits WHERE id=?').bind(auditId),
  ]);
  const audit = result[3].results[0] as { id: string; name?: string } | undefined;
  if (!audit) throw new AuditRequestError('audit-missing', 404);
  const stored = result[0].results[0] as { state: AuditRequestWorkflow['state']; revision: string; time_zone: string; plan_revision: string } | undefined;
  const workflow: AuditRequestWorkflow = stored ? { auditId, state: stored.state, revision: stored.revision, timeZone: stored.time_zone, planRevision: stored.plan_revision } : { auditId, state: 'draft', revision: '', timeZone: 'UTC', planRevision: '' };
  const planRaw = (result[1].results[0] as { value: string } | undefined)?.value || '';
  const plan: WorkplanPlan = planRaw ? JSON.parse(planRaw) : { plan: emptyAuditPlan, revision: '', updatedAt: null, updatedBy: null };
  return { auditName: audit.name || audit.id, workflow, plan, planRaw, requests: (result[2].results as unknown as StoredRequest[]).slice(0, 500).map(publicAuditRequest), complete: result[2].results.length <= 500 };
}

export async function readWorkplanHistory(db: D1Database, auditId: string) {
  await ready(db, auditId);
  const rows = await db.prepare('SELECT * FROM audit_workplan_events WHERE audit_id=? ORDER BY created_at DESC,rowid DESC LIMIT 21').bind(auditId).all<WorkplanEvent>();
  return { events: rows.results.slice(0, 20), complete: rows.results.length <= 20 };
}

export async function readWorkplanClosure(db: D1Database, auditId: string, closureId: string, evidenceAccess: boolean): Promise<WorkplanClosureDetail> {
  await ready(db, auditId);
  const result = await db.batch([
    db.prepare('SELECT snapshot_json,snapshot_sha256,request_count FROM audit_workplan_closures WHERE audit_id=? AND id=? AND EXISTS(SELECT 1 FROM simple_audits WHERE id=?)').bind(auditId, closureId, auditId),
    db.prepare('SELECT * FROM audit_workplan_closure_items WHERE audit_id=? AND closure_id=? ORDER BY id LIMIT 501').bind(auditId, closureId),
  ]);
  const header = result[0].results[0] as { snapshot_json: string; snapshot_sha256: string; request_count: number } | undefined;
  if (!header) throw new AuditRequestError('closure-missing', 404);
  const snapshot: WorkplanSnapshot = { ...JSON.parse(header.snapshot_json), requests: (result[1].results as unknown as StoredRequest[]).slice(0, 500).map(publicAuditRequest) };
  const complete = result[1].results.length <= 500 && snapshot.requests.length === header.request_count;
  const integrity = !complete ? 'unavailable' : await digest(snapshot) === header.snapshot_sha256 ? 'verified' : 'broken';
  return { snapshot: evidenceAccess ? snapshot : { ...snapshot, requests: snapshot.requests.map(row => ({ ...row, evidence: [] })) }, sha256: header.snapshot_sha256, integrity, evidenceAccess };
}

export async function mutateWorkplan(db: D1Database, actor: Actor, input: Record<string, unknown>, now = new Date()) {
  if (!canWriteModule(actor, 'Denetim Yönetimi') || !canReadModule(actor, 'Kanıtlar')) throw new AuditRequestError('forbidden', 403);
  const auditId = auditRequestId(input.auditId), action = input.action;
  if (action !== 'close' && action !== 'reopen') throw new AuditRequestError('action');
  if (typeof input.expectedRevision !== 'string' || !input.expectedRevision || input.expectedRevision.length > 100) throw new AuditRequestError('revision');
  if (typeof input.note !== 'string' || input.note.trim().length < 5 || input.note.length > 2000) throw new AuditRequestError('note');
  const note = input.note.trim(), stamp = now.toISOString(), revision = `AWC-${crypto.randomUUID()}`;
  const state = await readWorkplanPreview(db, auditId);
  if (state.workflow.revision !== input.expectedRevision || state.workflow.state !== (action === 'close' ? 'active' : 'closed')) throw new AuditRequestError('conflict', 409);
  const event = (closureId: string, nextState: string) => db.prepare(`INSERT INTO audit_workplan_events(id,audit_id,action,actor,note,closure_id,revision,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=? AND state=? AND revision=?)`).bind(revision, auditId, action, actor.email, note, closureId, revision, stamp, auditId, nextState, revision);
  if (action === 'reopen') {
    const result = await db.batch([
      db.prepare(`UPDATE audit_request_workflows SET state='active',revision=? WHERE audit_id=? AND state='closed' AND revision=? AND EXISTS(SELECT 1 FROM simple_audits WHERE id=?) AND EXISTS(SELECT 1 FROM audit_workplan_closures WHERE id=? AND audit_id=?) RETURNING audit_id`).bind(revision, auditId, input.expectedRevision, auditId, input.expectedRevision, auditId),
      event(input.expectedRevision, 'active'),
    ]);
    if (!result[0].results.length) throw new AuditRequestError('conflict', 409);
    return { revision };
  }
  if (!state.complete) throw new AuditRequestError('limit', 409);
  if (!workplanResolved(state.requests, state.complete)) throw new AuditRequestError('outstanding', 409);
  const preview = validateRequestPreview(input.expectedRequests);
  if (preview.length !== state.requests.length || state.requests.some(row => !preview.some(p => p.id === row.id && p.revision === row.revision))) throw new AuditRequestError('closure-changed', 409);
  if (input.expectedPlanRevision !== state.plan.revision) throw new AuditRequestError('plan-changed', 409);
  const { requests, ...header } = { schemaVersion: 1 as const, id: revision, auditId, auditName: state.auditName, closedAt: stamp, closedBy: actor.email, note, timeZone: state.workflow.timeZone, workflowRevision: state.workflow.revision, plan: state.plan, requests: state.requests };
  const hash = await digest({ ...header, requests });
  const result = await db.batch([
    db.prepare(`UPDATE audit_request_workflows SET state='closed',revision=?,plan_revision=? WHERE audit_id=? AND state='active' AND revision=?
      AND EXISTS(SELECT 1 FROM simple_audits WHERE id=?) AND COALESCE((SELECT value FROM simple_grc_metadata WHERE key=?),'')=?
      AND (SELECT COUNT(*) FROM audit_requests WHERE audit_id=?)=?
      AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM audit_requests r WHERE r.audit_id=? AND r.id=json_extract(p.value,'$.id') AND r.revision=json_extract(p.value,'$.revision') AND json_extract(r.data_json,'$.status') IN ('accepted','cancelled'))) RETURNING audit_id`)
      .bind(revision, state.plan.revision, auditId, input.expectedRevision, auditId, `audit_plan_${auditId}`, state.planRaw, auditId, preview.length, JSON.stringify(preview), auditId),
    db.prepare(`INSERT INTO audit_workplan_closures(id,audit_id,snapshot_json,snapshot_sha256,request_count,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=? AND state='closed' AND revision=?)`).bind(revision, auditId, JSON.stringify(header), hash, requests.length, stamp, auditId, revision),
    db.prepare(`INSERT INTO audit_workplan_closure_items(closure_id,id,audit_id,data_json,revision,created_at,updated_at) SELECT ?,id,audit_id,data_json,revision,created_at,updated_at FROM audit_requests WHERE audit_id=? AND EXISTS(SELECT 1 FROM audit_workplan_closures WHERE id=? AND audit_id=?)`).bind(revision, auditId, revision, auditId),
    event(revision, 'closed'),
    db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',closed_at=?,updated_at=? WHERE route='audit-request' AND status='queued' AND escalation_id IN (SELECT id FROM audit_requests WHERE audit_id=?) AND EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=? AND state='closed' AND revision=?)`).bind(stamp, stamp, auditId, auditId, revision),
  ]);
  if (!result[0].results.length) throw new AuditRequestError('conflict', 409);
  return { revision };
}
