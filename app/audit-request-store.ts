import { completedInitialization } from './completed-initialization';
import { prepareRequestDeadlineAdjustment, requestDeadlineGuard, requestDeadlineGuardArgs } from './audit-request-deadline-store';
import { ensureCoreGrcSchemaCompatibility } from './api/grc/schema-compat';
import { canReadModule, canWriteModule, parseModuleAccess } from './module-access';
import type { Actor } from './api/auth/security';
import { ensureEvidenceHistorySchema } from './evidence/versioning';
import { ensureAssuranceNotificationSchema } from './assurance-executive-operations';
import { AuditRequestError, requestDueAt, requestNextDue, requestIdentity, validateAuditRequestFields, validateRequestTimeZone, validateRequestPreview, type AuditRequest, type AuditRequestEvidence, type AuditRequestWorkflow } from './audit-requests';

export const auditRequestSchema = [
  `CREATE TABLE IF NOT EXISTS audit_reminder_profiles(audit_id TEXT PRIMARY KEY,revision TEXT NOT NULL,data_json TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_request_workflows(audit_id TEXT PRIMARY KEY,state TEXT NOT NULL,revision TEXT NOT NULL,time_zone TEXT NOT NULL,plan_revision TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS audit_requests(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,data_json TEXT NOT NULL,revision TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_requests_parent_idx ON audit_requests(audit_id,created_at,id)`,
  `CREATE TABLE IF NOT EXISTS audit_request_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,request_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_request_events_parent_idx ON audit_request_events(audit_id,created_at,id)`,
  `CREATE TABLE IF NOT EXISTS audit_workplan_closures(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,snapshot_json TEXT NOT NULL,snapshot_sha256 TEXT NOT NULL,request_count INTEGER NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_workplan_closures_parent_idx ON audit_workplan_closures(audit_id,created_at,id)`,
  `CREATE TABLE IF NOT EXISTS audit_workplan_closure_items(closure_id TEXT NOT NULL,id TEXT NOT NULL,audit_id TEXT NOT NULL,data_json TEXT NOT NULL,revision TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(closure_id,id))`,
  `CREATE TABLE IF NOT EXISTS audit_workplan_events(id TEXT PRIMARY KEY,audit_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL,closure_id TEXT NOT NULL,revision TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_workplan_events_parent_idx ON audit_workplan_events(audit_id,created_at,id)`,
];
const initialize = completedInitialization();
export async function ensureAuditRequestSchema(db: D1Database) {
  await initialize(db, async () => { await ensureCoreGrcSchemaCompatibility(db); await db.batch(auditRequestSchema.map(sql => db.prepare(sql))); await ensureAssuranceNotificationSchema(db); });
}
type StoredRequest = { id: string; audit_id: string; data_json: string; revision: string; created_at: string; updated_at: string };
export function publicAuditRequest(row: StoredRequest): AuditRequest {
  return { ...JSON.parse(row.data_json), id: row.id, auditId: row.audit_id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}
export function auditRequestId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new AuditRequestError('id');
  return value;
}
export async function requireAuditParent(db: D1Database, auditId: string) {
  if (!await db.prepare('SELECT id FROM simple_audits WHERE id=?').bind(auditId).first()) throw new AuditRequestError('audit-missing', 404);
}
export async function auditRequestPeople(db: D1Database) {
  const rows = await db.prepare(`SELECT u.id,u.name,u.email,u.role,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor') ORDER BY u.name LIMIT 1001`).all<{ id: string; name: string; email: string; role: string; policy_json: string | null }>();
  const people = rows.results.filter(row => { const subject = { role: row.role, moduleAccess: parseModuleAccess(row.policy_json) }; return canWriteModule(subject, 'Denetim Yönetimi') && canReadModule(subject, 'Kanıtlar'); });
  return { people: people.slice(0, 1000).map(row => ({ id: row.id, name: row.name, email: requestIdentity(row.email) })), complete: rows.results.length <= 1000 };
}
export async function auditRequestActorActive(db: D1Database, email: string) {
  const row = await db.prepare(`SELECT u.role,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE lower(u.email)=? AND u.status='Active' AND u.role IN ('Admin','Editor')`).bind(requestIdentity(email)).first<{ role: string; policy_json: string | null }>();
  if (!row) return false;
  const subject = { role: row.role, moduleAccess: parseModuleAccess(row.policy_json) };
  return canWriteModule(subject, 'Denetim Yönetimi') && canReadModule(subject, 'Kanıtlar');
}
async function validateAssignees(db: D1Database, owner: string, reviewer: string) {
  if (!await auditRequestActorActive(db, owner) || !await auditRequestActorActive(db, reviewer)) throw new AuditRequestError('assignee');
}
async function requestAssigneeSnapshot(db: D1Database, requests: AuditRequest[]) {
  const emails = [...new Set(requests.flatMap(row => [row.owner, row.reviewer]))];
  const result = await db.prepare(`SELECT lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor') AND lower(u.email) IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(emails)).all<{ email: string; role: string; policy: string | null }>();
  if (result.results.length !== emails.length || result.results.some(row => {
    const subject = { role: row.role, moduleAccess: parseModuleAccess(row.policy) };
    return !canWriteModule(subject, 'Denetim Yönetimi') || !canReadModule(subject, 'Kanıtlar');
  })) throw new AuditRequestError('assignee');
  return result.results;
}
export async function readAuditRequestWorkflow(db: D1Database, auditId: string) {
  await ensureAuditRequestSchema(db); await requireAuditParent(db, auditId);
  const stored = await db.prepare('SELECT * FROM audit_request_workflows WHERE audit_id=?').bind(auditId).first<{ audit_id: string; state: 'draft' | 'active' | 'closed'; revision: string; time_zone: string; plan_revision: string }>();
  const workflow: AuditRequestWorkflow = stored ? { auditId, state: stored.state, revision: stored.revision, timeZone: stored.time_zone, planRevision: stored.plan_revision } : { auditId, state: 'draft', revision: '', timeZone: 'UTC', planRevision: '' };
  const rows = await db.prepare('SELECT * FROM audit_requests WHERE audit_id=? ORDER BY created_at,id LIMIT 501').bind(auditId).all<StoredRequest>();
  return { workflow, requests: rows.results.slice(0, 500).map(publicAuditRequest), complete: rows.results.length <= 500 };
}
export async function readAuditRequestWork(db: D1Database) {
  await ensureAuditRequestSchema(db);
  const rows = await db.prepare(`SELECT r.*,w.time_zone FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id JOIN audit_request_workflows w ON w.audit_id=r.audit_id WHERE (w.state='active' OR (w.state='closed' AND json_extract(r.data_json,'$.status') IN ('accepted','cancelled'))) AND json_extract(r.data_json,'$.status')<>'draft' AND (json_extract(r.data_json,'$.status')<>'cancelled' OR EXISTS(SELECT 1 FROM audit_request_events e WHERE e.request_id=r.id AND e.audit_id=r.audit_id AND e.action IN ('start','activate'))) ORDER BY r.updated_at DESC,r.id LIMIT 1001`).all<StoredRequest & { time_zone: string }>();
  const deadlines = new Map<string, string>();
  return { requests: rows.results.slice(0, 1000).map(raw => {
    const row = publicAuditRequest(raw), key = `${requestNextDue(row)}:${raw.time_zone}`;
    if (!deadlines.has(key)) deadlines.set(key, requestDueAt(requestNextDue(row), raw.time_zone));
    return { ...row, dueAt: deadlines.get(key)!, timeZone: raw.time_zone };
  }), complete: rows.results.length <= 1000 };
}
export async function readRequestEvidence(db: D1Database, ids?: string[]): Promise<AuditRequestEvidence[]> {
  await ensureEvidenceHistorySchema(db);
  const sql = `SELECT v.id,v.evidence_id,v.version_no,v.evidence_title,v.file_name,v.file_key,v.content_sha256,v.period FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' `;
  const statement = ids ? db.prepare(sql + `WHERE v.id IN (${ids.map(() => '?').join(',')})`).bind(...ids) : db.prepare(sql + `WHERE v.version_no=(SELECT MAX(v2.version_no) FROM evidence_versions v2 WHERE v2.evidence_id=v.evidence_id) ORDER BY v.created_at DESC LIMIT 501`);
  const rows = await statement.all<{ id: string; evidence_id: string; version_no: number; evidence_title: string; file_name: string; file_key: string; content_sha256: string; period: string }>();
  return rows.results.map(v => ({ id: v.id, evidenceId: v.evidence_id, versionNo: v.version_no, title: v.evidence_title, fileName: v.file_name, fileKey: v.file_key, contentSha256: v.content_sha256, period: v.period }));
}
type Mutation = { auditId: unknown; action: unknown; requestId?: unknown; expectedRevision: unknown; fields?: unknown; versionIds?: unknown; note?: unknown; timeZone?: unknown; expectedPlanRevision?: unknown; expectedWorkflowRevision?: unknown; expectedDrafts?: unknown; deadlineAdjustment?: unknown };
const liveParent = 'EXISTS(SELECT 1 FROM simple_audits WHERE id=?)';
const openWorkplan = "NOT EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=? AND state='closed')";
export async function mutateAuditRequest(db: D1Database, actor: Actor, input: Mutation, now = new Date()) {
  if (!canWriteModule(actor, 'Denetim Yönetimi')) throw new AuditRequestError('forbidden', 403);
  const auditId = auditRequestId(input.auditId), action = String(input.action), stamp = now.toISOString(), revision = crypto.randomUUID();
  if (input.deadlineAdjustment !== undefined && !['create', 'edit', 'return'].includes(action)) throw new AuditRequestError('deadline-adjustment');
  if (typeof input.expectedRevision !== 'string' || input.expectedRevision.length > 100) throw new AuditRequestError('revision');
  await ensureAuditRequestSchema(db); await requireAuditParent(db, auditId);
  if (action === 'start' || action === 'activate') {
    const starting = action === 'start', state = await readAuditRequestWorkflow(db, auditId);
    if (!state.complete) throw new AuditRequestError('limit', 409);
    if (state.workflow.state !== (starting ? 'draft' : 'active') || state.workflow.revision !== input.expectedRevision) throw new AuditRequestError('conflict', 409);
    const zone = starting ? validateRequestTimeZone(input.timeZone) : state.workflow.timeZone;
    const drafts = state.requests.filter(row => row.status === 'draft');
    if (!drafts.length) throw new AuditRequestError('empty');
    const preview = validateRequestPreview(input.expectedDrafts);
    if (preview.length !== drafts.length || drafts.some(row => !preview.some(p => p.id === row.id && p.revision === row.revision))) throw new AuditRequestError('preview-changed', 409);
    if (!starting && (typeof input.note !== 'string' || input.note.trim().length < 5 || input.note.length > 2000)) throw new AuditRequestError('note');
    const reason = starting ? '' : (input.note as string).trim();
    const assignees = await requestAssigneeSnapshot(db, drafts);
    const plan = await db.prepare('SELECT value FROM simple_grc_metadata WHERE key=?').bind(`audit_plan_${auditId}`).first<{ value: string }>();
    const planRevision = plan ? JSON.parse(plan.value).revision : '';
    if (typeof input.expectedPlanRevision !== 'string' || input.expectedPlanRevision !== planRevision) throw new AuditRequestError('plan-changed', 409);
    // Bind the exact preview inside the transaction. Concurrent draft additions,
    // edits or cancellations must not activate work the operator did not review.
    const guard = `${liveParent} AND COALESCE((SELECT json_extract(value,'$.revision') FROM simple_grc_metadata WHERE key=?),'')=?
      AND (SELECT COUNT(*) FROM audit_requests WHERE audit_id=? AND json_extract(data_json,'$.status')='draft')=?
      AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM audit_requests r WHERE r.audit_id=? AND r.id=json_extract(p.value,'$.id') AND r.revision=json_extract(p.value,'$.revision') AND json_extract(r.data_json,'$.status')='draft'))
      AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE lower(u.email)=json_extract(p.value,'$.email') AND u.status='Active' AND u.role=json_extract(p.value,'$.role') AND a.policy_json IS json_extract(p.value,'$.policy')))`;
    const args = [auditId, `audit_plan_${auditId}`, planRevision, auditId, preview.length, JSON.stringify(preview), auditId, JSON.stringify(assignees)];
    const claim = starting
      ? db.prepare(`INSERT INTO audit_request_workflows(audit_id,state,revision,time_zone,plan_revision) SELECT ?,'active',?,?,? WHERE ${guard} AND ?='' AND NOT EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=?) ON CONFLICT(audit_id) DO NOTHING RETURNING audit_id`).bind(auditId, revision, zone, planRevision, ...args, input.expectedRevision, auditId)
      : db.prepare(`UPDATE audit_request_workflows SET revision=?,plan_revision=? WHERE audit_id=? AND state='active' AND revision=? AND ${guard} RETURNING audit_id`).bind(revision, planRevision, auditId, input.expectedRevision, ...args);
    const results = await db.batch([
      claim,
      db.prepare(`UPDATE audit_requests SET data_json=json_set(data_json,'$.status','assigned'),revision=?,updated_at=? WHERE audit_id=? AND json_extract(data_json,'$.status')='draft' AND EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=? AND revision=?)`).bind(revision, stamp, auditId, auditId, revision),
      db.prepare(`INSERT INTO audit_request_events(id,audit_id,request_id,action,actor,snapshot_json,created_at) SELECT ?||id,audit_id,id,?,?,json_set(data_json,'$.activationReason',?,'$.planRevision',?,'$.workflowRevision',?),? FROM audit_requests WHERE audit_id=? AND revision=?`).bind(`${revision}:`, action, actor.email, reason, planRevision, revision, stamp, auditId, revision),
    ]);
    if (!results[0].results?.length) throw new AuditRequestError('conflict', 409);
    return;
  }
  if (await db.prepare("SELECT audit_id FROM audit_request_workflows WHERE audit_id=? AND state='closed'").bind(auditId).first()) throw new AuditRequestError('workplan-closed', 409);
  const requestId = auditRequestId(input.requestId);
  const raw = await db.prepare('SELECT * FROM audit_requests WHERE id=? AND audit_id=?').bind(requestId, auditId).first<StoredRequest>();
  const current = raw ? publicAuditRequest(raw) : null;
  let next: Omit<AuditRequest, 'id' | 'auditId' | 'revision' | 'createdAt' | 'updatedAt'>;
  if (action === 'create') {
    if (current || input.expectedRevision) throw new AuditRequestError('conflict', 409);
    if (input.expectedWorkflowRevision !== undefined && (typeof input.expectedWorkflowRevision !== 'string' || input.expectedWorkflowRevision.length > 100)) throw new AuditRequestError('revision');
    const fields = validateAuditRequestFields(input.fields); await validateAssignees(db, fields.owner, fields.reviewer);
    next = { ...fields, status: 'draft', evidence: [], submittedBy: '', note: '' };
  } else {
    if (!current || current.revision !== input.expectedRevision) throw new AuditRequestError('conflict', 409);
    next = { ...current };
    const email = requestIdentity(actor.email);
    if (action === 'edit') {
      if (!['draft', 'assigned', 'submitted', 'changes_requested'].includes(current.status)) throw new AuditRequestError('transition', 409);
      const fields = validateAuditRequestFields(input.fields); await validateAssignees(db, fields.owner, fields.reviewer); next = { ...next, ...fields, ...(current.status === 'submitted' ? { status: 'assigned' as const, submittedBy: '', note: 'Talep güncellendi; kanıt yeniden sunulmalı. / Request updated; resubmit evidence.' } : {}) };
    } else if (action === 'submit') {
      if (email !== current.owner || !canReadModule(actor, 'Kanıtlar')) throw new AuditRequestError('forbidden', 403);
      if (!['assigned', 'changes_requested'].includes(current.status)) throw new AuditRequestError('transition', 409);
      if (!Array.isArray(input.versionIds) || input.versionIds.length < 1 || input.versionIds.length > 10 || input.versionIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || new Set(input.versionIds).size !== input.versionIds.length) throw new AuditRequestError('evidence');
      const evidence = await readRequestEvidence(db, input.versionIds as string[]);
      if (evidence.length !== input.versionIds.length) throw new AuditRequestError('evidence');
      next = { ...next, status: 'submitted', evidence, submittedBy: email, note: '' };
    } else if (action === 'accept' || action === 'return') {
      if (email !== current.reviewer || email === current.submittedBy || !canReadModule(actor, 'Kanıtlar')) throw new AuditRequestError('forbidden', 403);
      if (current.status !== 'submitted') throw new AuditRequestError('transition', 409);
      if (typeof input.note !== 'string' || input.note.trim().length < 5 || input.note.length > 2000) throw new AuditRequestError('note');
      if (action === 'accept') {
        const versions = current.evidence.length ? await readRequestEvidence(db, current.evidence.map(v => v.id)) : [];
        if (versions.length !== current.evidence.length || !versions.length || versions.some(v => current.evidence.find(e => e.id === v.id)?.contentSha256 !== v.contentSha256)) throw new AuditRequestError('evidence');
      }
      if (action === 'return') {
        const fields = validateAuditRequestFields({ ...current, ...(input.fields as object), owner: current.owner, reviewer: current.reviewer, title: current.title, instructions: current.instructions, periodStart: current.periodStart, periodEnd: current.periodEnd });
        next.dueDate = fields.dueDate; next.reviewDueDate = fields.reviewDueDate;
      }
      next = { ...next, status: action === 'accept' ? 'accepted' : 'changes_requested', note: input.note.trim() };
    } else if (action === 'cancel') {
      if (['accepted', 'cancelled'].includes(current.status)) throw new AuditRequestError('transition', 409);
      if (typeof input.note !== 'string' || input.note.trim().length < 5 || input.note.length > 2000) throw new AuditRequestError('note');
      next = { ...next, status: 'cancelled', note: input.note.trim() };
    } else throw new AuditRequestError('action');
  }
  const evidenceGuard = ['submit', 'accept'].includes(action) ? ` AND (SELECT COUNT(*) FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' WHERE v.id IN (${next.evidence.map(() => '?').join(',')}))=?` : '';
  const evidenceArgs = ['submit', 'accept'].includes(action) ? [...next.evidence.map(v => v.id), next.evidence.length] : [];
  const adjustment = await prepareRequestDeadlineAdjustment(db, actor, auditId, input.deadlineAdjustment, input.expectedWorkflowRevision, next);
  const calendarArgs = requestDeadlineGuardArgs(auditId, adjustment);
  const payload = JSON.stringify(next), snapshot = JSON.stringify({ ...next, ...(adjustment ? { deadlineAdjustment: adjustment.snapshot } : {}) });
  const write = action === 'create'
    ? db.prepare(`INSERT INTO audit_requests(id,audit_id,data_json,revision,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${liveParent} AND ${openWorkplan} AND COALESCE((SELECT revision FROM audit_request_workflows WHERE audit_id=?),'')=? AND (SELECT COUNT(*) FROM audit_requests WHERE audit_id=?)<500 ${requestDeadlineGuard} ON CONFLICT(id) DO NOTHING RETURNING id`).bind(requestId, auditId, payload, revision, stamp, stamp, auditId, auditId, auditId, input.expectedWorkflowRevision ?? '', auditId, ...calendarArgs)
    : db.prepare(`UPDATE audit_requests SET data_json=?,revision=?,updated_at=? WHERE id=? AND audit_id=? AND revision=? AND ${liveParent} AND ${openWorkplan}${evidenceGuard} ${requestDeadlineGuard}`).bind(payload, revision, stamp, requestId, auditId, input.expectedRevision, auditId, auditId, ...evidenceArgs, ...calendarArgs);
  const results = await db.batch([
    write,
    db.prepare(`INSERT INTO audit_request_events(id,audit_id,request_id,action,actor,snapshot_json,created_at) SELECT ?,audit_id,id,?,?,?,? FROM audit_requests WHERE id=? AND audit_id=? AND revision=?`).bind(revision, action, actor.email, snapshot, stamp, requestId, auditId, revision),
    db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',closed_at=?,updated_at=? WHERE route='audit-request' AND escalation_id=? AND status='queued' AND EXISTS(SELECT 1 FROM audit_requests WHERE id=? AND revision=?)`).bind(stamp, stamp, requestId, requestId, revision),
  ]);
  if (!results[1].meta?.changes) {
    if (adjustment && !await db.prepare('SELECT audit_id FROM audit_reminder_profiles WHERE audit_id=? AND revision=? AND data_json=?').bind(auditId, adjustment.revision, adjustment.raw).first()) throw new AuditRequestError('deadline-calendar-conflict', 409);
    throw new AuditRequestError('conflict', 409);
  }
}
