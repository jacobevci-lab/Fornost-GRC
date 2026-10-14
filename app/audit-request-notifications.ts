import { ensureAuditRequestSchema, auditRequestActorActive, publicAuditRequest } from './audit-request-store';
import { requestNextActor, requestNextDue, type AuditRequest } from './audit-requests';
import type { AssuranceDeliveryOutbox } from './assurance-notification-delivery';

export function auditRequestNotification(row: AuditRequest, timeZone: string, now: Date) {
  const recipient = requestNextActor(row); if (!recipient) return null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const due = requestNextDue(row), days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(days)) return null;
  // Only the latest due milestone is queued after downtime, never a backlog of old reminders.
  const milestone = days <= -3 ? 'overdue' : days <= 0 ? 'due' : days <= 1 ? 'due-soon' : 'assignment';
  const fingerprint = `audit-request:${row.id}:${row.revision}:${milestone}`;
  return { recipient, due, milestone, fingerprint, id: `ARN-${row.id}-${row.revision}-${milestone}` };
}
type LiveRow = { id: string; audit_id: string; data_json: string; revision: string; created_at: string; updated_at: string; time_zone: string };
export async function syncAuditRequestNotifications(db: D1Database, now = new Date(), auditId?: string) {
  await ensureAuditRequestSchema(db);
  const query = `SELECT r.*,w.time_zone FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id JOIN audit_request_workflows w ON w.audit_id=r.audit_id AND w.state='active' WHERE json_extract(r.data_json,'$.status') IN ('assigned','submitted','changes_requested')${auditId ? ' AND r.audit_id=?' : ''} ORDER BY r.updated_at DESC,r.id LIMIT 5001`;
  const statement = db.prepare(query), rows = await (auditId ? statement.bind(auditId) : statement).all<LiveRow>();
  if (rows.results.length > 5000) throw new Error('Audit request reminder source exceeds its processing limit.');
  const stamp = now.toISOString();
  for (const raw of rows.results) {
    const row = publicAuditRequest(raw), notice = auditRequestNotification(row, raw.time_zone, now);
    if (!notice) continue;
    const allowed = await auditRequestActorActive(db, notice.recipient);
    await db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE route='audit-request' AND escalation_id=? AND status='queued' AND (fingerprint<>? OR ?=0)`).bind(stamp, stamp, row.id, notice.fingerprint, allowed ? 1 : 0).run();
    if (!allowed) continue;
    // Deliberately omit request title, evidence and instructions from email content.
    await db.prepare(`INSERT INTO continuous_assurance_notification_outbox(id,fingerprint,escalation_id,recipient,route,subject,body,severity,status,reason,created_at,updated_at,last_routed_at,closed_at,source_json)
      SELECT ?,?,?,?,'audit-request',?,?,'medium','queued',?,?,?,?,NULL,? WHERE EXISTS(SELECT 1 FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id WHERE r.id=? AND r.revision=?)
      ON CONFLICT(fingerprint) DO UPDATE SET status='queued',closed_at=NULL,updated_at=excluded.updated_at WHERE continuous_assurance_notification_outbox.status='cancelled'`).bind(notice.id, notice.fingerprint, row.id, notice.recipient,
      'Denetim görevi / Audit task', `Denetim / Audit: ${row.auditId}\nGörev / Task: ${row.id}\nTermin / Due: ${notice.due} (${raw.time_zone})\nFornost > My Work / İşlerim > Denetim talebi / Audit request`, notice.milestone, stamp, stamp, stamp,
      JSON.stringify({ kind: 'audit-request', auditId: row.auditId, requestId: row.id, revision: row.revision, milestone: notice.milestone }), row.id, row.revision).run();
  }
  // Deleted audits and terminal requests cannot keep live reminders. Other publishers are untouched.
  await db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE route='audit-request' AND status='queued' AND NOT EXISTS(SELECT 1 FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id WHERE r.id=continuous_assurance_notification_outbox.escalation_id AND r.revision=json_extract(continuous_assurance_notification_outbox.source_json,'$.revision') AND json_extract(r.data_json,'$.status') IN ('assigned','submitted','changes_requested'))`).bind(stamp, stamp).run();
}
export async function auditRequestNotificationCurrent(db: D1Database, item: AssuranceDeliveryOutbox, now = new Date()) {
  if (item.route !== 'audit-request') return true;
  const raw = await db.prepare(`SELECT r.*,w.time_zone FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id JOIN audit_request_workflows w ON w.audit_id=r.audit_id AND w.state='active' WHERE r.id=?`).bind(item.escalation_id).first<LiveRow>();
  if (!raw) return false;
  const expected = auditRequestNotification(publicAuditRequest(raw), raw.time_zone, now);
  return !!expected && expected.id === item.id && expected.recipient === item.recipient && await auditRequestActorActive(db, expected.recipient);
}
