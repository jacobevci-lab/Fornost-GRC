import type { Actor } from './api/auth/security';
import { auditRequestId } from './audit-request-store';
import { AuditReportError, auditReportHash, auditReportSummary, type AuditStatusReport } from './audit-status-report';
import { auditReportInsertStatements, readAuditReportSource, readAuditStatusReport, requireAuditReportAccess } from './audit-status-report-store';
import { ensureAuditClosureSchema } from './audit-closure-schema';
import { auditClosureBlockers, emptyAuditClosure, type AuditClosureAction, type AuditClosureEvent, type AuditClosureHistory, type AuditClosureState } from './audit-closure';

type StoredEvent = { payload_json: string; snapshot_sha256: string; input_sha256: string };
const stateSql = 'SELECT state,revision,submission_id AS submissionId,report_id AS reportId FROM audit_closure_state WHERE audit_id=?';
const activeAdmin = `EXISTS(SELECT 1 FROM local_users WHERE id=? AND lower(email)=lower(?) AND role='Admin' AND status='Active')`;
const text = (value: unknown, min: number, max = 4000) => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new AuditReportError('fields');
  return value.trim();
};
async function eventData(row: StoredEvent) {
  let event: AuditClosureEvent;
  try { event = JSON.parse(row.payload_json); } catch { throw new AuditReportError('integrity', 409); }
  if (!event || await auditReportHash(event) !== row.snapshot_sha256) throw new AuditReportError('integrity', 409);
  return event;
}
async function existingEvent(db: D1Database, id: string) {
  return db.prepare('SELECT payload_json,snapshot_sha256,input_sha256 FROM audit_closure_events WHERE id=?').bind(id).first<StoredEvent>();
}
async function parent(db: D1Database, auditId: string) {
  if (!await db.prepare('SELECT id FROM simple_audits WHERE id=?').bind(auditId).first()) throw new AuditReportError('audit-missing', 404);
}
export async function readAuditClosureHistory(db: D1Database, actor: Actor, auditId: string): Promise<AuditClosureHistory> {
  requireAuditReportAccess(actor); auditRequestId(auditId); await ensureAuditClosureSchema(db);
  const results = await db.batch([
    db.prepare('SELECT id FROM simple_audits WHERE id=?').bind(auditId),
    db.prepare(stateSql).bind(auditId),
    db.prepare('SELECT payload_json,snapshot_sha256,input_sha256 FROM audit_closure_events WHERE audit_id=? ORDER BY created_at DESC,rowid DESC LIMIT 21').bind(auditId),
  ]);
  if (!results[0].results.length) throw new AuditReportError('audit-missing', 404);
  return { state: (results[1].results[0] as AuditClosureState) || { ...emptyAuditClosure }, events: await Promise.all((results[2].results as StoredEvent[]).slice(0, 20).map(eventData)), complete: results[2].results.length <= 20, actorId: actor.id };
}
export async function readAuditClosurePreview(db: D1Database, actor: Actor, auditId: string) {
  requireAuditReportAccess(actor); await ensureAuditClosureSchema(db);
  const source = await readAuditReportSource(db, actor, auditId);
  const people = await db.prepare(`SELECT id,name,email FROM local_users WHERE role='Admin' AND status='Active' AND id<>? AND lower(email)<>lower(?) ORDER BY name,id LIMIT 1001`).bind(actor.id, actor.email).all<{ id: string; name: string; email: string }>();
  return { source, blockers: auditClosureBlockers(source), reviewers: people.results.slice(0, 1000), reviewersComplete: people.results.length <= 1000 };
}
/** Minimal task metadata only; full packages keep the Admin-only detail boundary. */
export async function readPendingAuditClosures(db: D1Database, actor: Actor) {
  if (actor.role !== 'Admin') return { closures: [], complete: true };
  await ensureAuditClosureSchema(db);
  const rows = await db.prepare(`SELECT e.payload_json,e.snapshot_sha256,e.input_sha256,a.name FROM audit_closure_state c JOIN audit_closure_events e ON e.id=c.submission_id AND e.audit_id=c.audit_id JOIN simple_audits a ON a.id=c.audit_id WHERE c.state='pending' ORDER BY e.created_at,e.id LIMIT 1001`).all<StoredEvent & { name: string }>();
  const closures = await Promise.all(rows.results.slice(0, 1000).map(async row => {
    const event = await eventData(row);
    return { id: event.id, auditId: event.auditId, title: row.name, owner: event.preparerEmail, reviewer: event.reviewerEmail, status: 'submitted', createdAt: event.createdAt, updatedAt: event.createdAt };
  }));
  return { closures, complete: rows.results.length <= 1000 };
}
export async function readAuditClosureDetail(db: D1Database, actor: Actor, auditId: string, eventId: string) {
  requireAuditReportAccess(actor); auditRequestId(auditId); auditRequestId(eventId); await ensureAuditClosureSchema(db); await parent(db, auditId);
  const row = await existingEvent(db, eventId);
  if (!row) throw new AuditReportError('closure-missing', 404);
  const event = await eventData(row);
  if (event.auditId !== auditId) throw new AuditReportError('closure-missing', 404);
  const report = await readAuditStatusReport(db, actor, auditId, event.reportId);
  if (report.integrity !== 'verified' || report.sha256 !== event.reportSha256) throw new AuditReportError('integrity', 409);
  return { event, sha256: row.snapshot_sha256, report };
}

export async function mutateAuditClosure(db: D1Database, actor: Actor, input: Record<string, unknown>, now = new Date()) {
  requireAuditReportAccess(actor);
  const auditId = auditRequestId(input.auditId), id = auditRequestId(input.eventId), action = input.action as AuditClosureAction;
  if (!/^ACL-[a-f0-9-]{36}$/.test(id) || !['submit', 'approve', 'return', 'withdraw', 'reopen'].includes(action)) throw new AuditReportError('fields');
  const expectedRevision = text(input.expectedRevision, 0, 100), note = text(input.note, 10);
  const normalized = action === 'submit' ? { reviewerId: auditRequestId(input.reviewerId), expectedSourceRevision: text(input.expectedSourceRevision, 32, 32), followUp: text(input.followUp, 0), limitations: text(input.limitations, 0) } : null;
  const fingerprint = await auditReportHash({ auditId, actorId: actor.id, actorEmail: actor.email.toLowerCase(), action, expectedRevision, note, ...normalized });
  await ensureAuditClosureSchema(db); await parent(db, auditId);
  if (!await db.prepare(`SELECT 1 WHERE ${activeAdmin}`).bind(actor.id, actor.email).first()) throw new AuditReportError('forbidden', 403);
  const retry = async () => {
    const row = await existingEvent(db, id); if (!row) return null;
    const event = await eventData(row);
    if (row.input_sha256 !== fingerprint || event.auditId !== auditId) throw new AuditReportError('id-conflict', 409);
    return { id, state: event.state };
  };
  const prior = await retry(); if (prior) return prior;
  const state = await db.prepare(stateSql).bind(auditId).first<AuditClosureState>() || { ...emptyAuditClosure };
  if (state.revision !== expectedRevision) throw new AuditReportError('changed', 409);
  let snapshot: AuditStatusReport | null = null, submission: AuditClosureEvent | null = null;
  let sourceGuard = '1', sourceValues: string[] = [], reviewerId = '', reviewerEmail = '', reportSha256 = '';
  if (action === 'submit' && normalized) {
    if (state.state !== 'open') throw new AuditReportError('state', 409);
    if (normalized.reviewerId === actor.id) throw new AuditReportError('independent-review', 403);
    const reviewer = await db.prepare(`SELECT id,email FROM local_users WHERE id=? AND role='Admin' AND status='Active'`).bind(normalized.reviewerId).first<{ id: string; email: string }>();
    if (!reviewer || reviewer.email.toLowerCase() === actor.email.toLowerCase()) throw new AuditReportError('reviewer', 409);
    reviewerId = reviewer.id; reviewerEmail = reviewer.email;
    const source = await readAuditReportSource(db, actor, auditId);
    if (source.sourceRevision !== normalized.expectedSourceRevision) throw new AuditReportError('changed', 409);
    if (auditClosureBlockers(source).length) throw new AuditReportError('blockers', 409);
    if (auditReportSummary(source.items).unresolvedFindings && normalized.followUp.length < 10) throw new AuditReportError('follow-up');
    snapshot = { ...source, schemaVersion: 1, id: `ARP-${id.slice(4)}`, title: `${source.audit.name} · Kapanış / Closure`.slice(0, 200), summary: note, limitations: normalized.limitations, createdAt: now.toISOString(), createdBy: actor.email };
    reportSha256 = await auditReportHash(snapshot);
    sourceGuard = `EXISTS(SELECT 1 FROM audit_report_source_revision WHERE id=1 AND revision=?) AND ${activeAdmin} AND NOT EXISTS(SELECT 1 FROM audit_status_reports WHERE id=?)`;
    sourceValues = [source.sourceRevision, reviewerId, reviewerEmail, snapshot.id];
  } else {
    if (!state.submissionId || (action === 'reopen' ? state.state !== 'closed' : state.state !== 'pending')) throw new AuditReportError('state', 409);
    const row = await existingEvent(db, state.submissionId);
    if (!row) throw new AuditReportError('integrity', 409);
    submission = await eventData(row);
    if (submission.auditId !== auditId || submission.reportId !== state.reportId) throw new AuditReportError('integrity', 409);
    reviewerId = submission.reviewerId; reviewerEmail = submission.reviewerEmail; reportSha256 = submission.reportSha256;
    if (['approve', 'return'].includes(action) && (actor.id !== reviewerId || actor.id === submission.preparerId || actor.email.toLowerCase() === submission.preparerEmail.toLowerCase())) throw new AuditReportError('independent-review', 403);
    if (action === 'withdraw' && actor.id !== submission.preparerId) throw new AuditReportError('preparer', 403);
    if (action === 'approve') {
      const detail = await readAuditClosureDetail(db, actor, auditId, state.submissionId);
      // The immutable package is reviewed, then its original source token is checked
      // in the commit. Any source edit since submission requires a new package.
      sourceGuard = `EXISTS(SELECT 1 FROM audit_report_source_revision WHERE id=1 AND revision=?) AND EXISTS(SELECT 1 FROM audit_status_reports WHERE id=? AND snapshot_sha256=? AND item_count=?)`;
      sourceValues = [submission.sourceRevision, submission.reportId, detail.report.sha256, String(detail.report.snapshot.items.length)];
    }
  }
  const target: AuditClosureState['state'] = action === 'submit' ? 'pending' : action === 'approve' ? 'closed' : 'open';
  const event: AuditClosureEvent = {
    schemaVersion: 1, id, auditId, action, state: target, previousRevision: expectedRevision, actorId: actor.id, actorEmail: actor.email, note, createdAt: now.toISOString(),
    submissionId: snapshot ? id : state.submissionId, reportId: snapshot?.id || state.reportId, reportSha256,
    sourceRevision: snapshot?.sourceRevision || submission!.sourceRevision,
    preparerId: snapshot ? actor.id : submission!.preparerId, preparerEmail: snapshot ? actor.email : submission!.preparerEmail,
    reviewerId, reviewerEmail, followUp: normalized?.followUp || submission?.followUp || '',
  };
  const claim = crypto.randomUUID(), eventHash = await auditReportHash(event);
  const claimGuard = { sql: 'EXISTS(SELECT 1 FROM audit_closure_events WHERE id=? AND write_token=?)', values: [id, claim] };
  const results = await db.batch([
    db.prepare(`INSERT INTO audit_closure_events(id,audit_id,payload_json,snapshot_sha256,input_sha256,write_token,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?) AND COALESCE((SELECT revision FROM audit_closure_state WHERE audit_id=?),'')=? AND ${activeAdmin} AND ${sourceGuard} ON CONFLICT(id) DO NOTHING RETURNING id`)
      .bind(id, auditId, JSON.stringify(event), eventHash, fingerprint, claim, event.createdAt, auditId, auditId, expectedRevision, actor.id, actor.email, ...sourceValues),
    ...(snapshot ? await auditReportInsertStatements(db, snapshot, fingerprint, claim, claimGuard) : []),
    db.prepare(`INSERT INTO audit_closure_state(audit_id,state,revision,submission_id,report_id) SELECT ?,?,?,?,? WHERE ${claimGuard.sql} ON CONFLICT(audit_id) DO UPDATE SET state=excluded.state,revision=excluded.revision,submission_id=excluded.submission_id,report_id=excluded.report_id`)
      .bind(auditId, target, id, event.submissionId, event.reportId, ...claimGuard.values),
  ]);
  if (!results[0].results.length) { const saved = await retry(); if (saved) return saved; throw new AuditReportError('changed', 409); }
  return { id, state: target };
}
