import { ensureAuditRequestSchema, auditRequestActorActive, publicAuditRequest } from './audit-request-store';
import { requestNextActor, requestNextDue, type AuditRequest } from './audit-requests';
import { defaultAuditReminderProfile, reminderLocalDate, reminderMilestones, reminderWorkingDay, validateAuditReminderProfile, type SavedAuditReminderProfile } from './audit-reminder-profile';
import type { AssuranceDeliveryOutbox } from './assurance-notification-delivery';

export function auditRequestNotifications(row: AuditRequest, timeZone: string, now: Date, saved: SavedAuditReminderProfile = { revision: '', profile: defaultAuditReminderProfile }) {
  const recipient = requestNextActor(row); if (!recipient) return [];
  const p = saved.profile, today = reminderLocalDate(now, timeZone), due = requestNextDue(row);
  if (!reminderWorkingDay(today, p)) return [];
  const dates = reminderMilestones(due, p);
  const milestone = today >= dates.overdue ? 'overdue' : today >= dates.due ? 'due' : p.beforeDays && today >= dates.before ? 'due-soon' : 'assignment';
  const notice = (target: string, phase: string) => {
    const suffix = saved.revision ? `:${saved.revision}` : '';
    return { recipient: target, due, milestone: phase, fingerprint: `audit-request:${row.id}:${row.revision}:${phase}${suffix}`, id: `ARN-${row.id}-${row.revision}-${phase}${suffix}` };
  };
  const notices = [notice(recipient, milestone)];
  if (dates.escalation && today >= dates.escalation && p.escalationRecipient !== recipient) notices.push(notice(p.escalationRecipient, 'escalation'));
  return notices;
}
export function auditRequestNotification(row: AuditRequest, timeZone: string, now: Date) { return auditRequestNotifications(row, timeZone, now)[0] || null; }
type LiveRow = { id: string; audit_id: string; data_json: string; revision: string; created_at: string; updated_at: string; time_zone: string; profile_revision: string | null; profile_json: string | null };
const profileOf = (raw: LiveRow): SavedAuditReminderProfile => ({ revision: raw.profile_revision || '', profile: raw.profile_json ? validateAuditReminderProfile(JSON.parse(raw.profile_json)) : defaultAuditReminderProfile });
export async function syncAuditRequestNotifications(db: D1Database, now = new Date(), auditId?: string) {
  await ensureAuditRequestSchema(db);
  const query = `SELECT r.*,w.time_zone,p.revision AS profile_revision,p.data_json AS profile_json FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id JOIN audit_request_workflows w ON w.audit_id=r.audit_id AND w.state='active' LEFT JOIN audit_reminder_profiles p ON p.audit_id=r.audit_id WHERE json_extract(r.data_json,'$.status') IN ('assigned','submitted','changes_requested')${auditId ? ' AND r.audit_id=?' : ''} ORDER BY r.updated_at DESC,r.id LIMIT 5001`;
  const statement = db.prepare(query), rows = await (auditId ? statement.bind(auditId) : statement).all<LiveRow>();
  if (rows.results.length > 5000) throw new Error('Audit request reminder source exceeds its processing limit.');
  const stamp = now.toISOString();
  for (const raw of rows.results) {
    const row = publicAuditRequest(raw), saved = profileOf(raw), notices = auditRequestNotifications(row, raw.time_zone, now, saved);
    const allowed = [];
    for (const notice of notices) if (await auditRequestActorActive(db, notice.recipient)) allowed.push(notice);
    await db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE route='audit-request' AND escalation_id=? AND status='queued' AND fingerprint NOT IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM audit_requests r WHERE r.id=? AND r.revision=? AND COALESCE((SELECT revision FROM audit_reminder_profiles WHERE audit_id=r.audit_id),'')=?)`).bind(stamp, stamp, row.id, JSON.stringify(allowed.map(n => n.fingerprint)), row.id, row.revision, saved.revision).run();
    for (const notice of allowed) {
    // Deliberately omit request title, evidence and instructions from email content.
    await db.prepare(`INSERT INTO continuous_assurance_notification_outbox(id,fingerprint,escalation_id,recipient,route,subject,body,severity,status,reason,created_at,updated_at,last_routed_at,closed_at,source_json)
      SELECT ?,?,?,?,'audit-request',?,?,'medium','queued',?,?,?,?,NULL,? WHERE EXISTS(SELECT 1 FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id WHERE r.id=? AND r.revision=? AND EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=r.audit_id AND state='active') AND COALESCE((SELECT revision FROM audit_reminder_profiles WHERE audit_id=r.audit_id),'')=?)
      ON CONFLICT(fingerprint) DO UPDATE SET status='queued',closed_at=NULL,updated_at=excluded.updated_at WHERE continuous_assurance_notification_outbox.status='cancelled'`).bind(notice.id, notice.fingerprint, row.id, notice.recipient,
      notice.milestone === 'escalation' ? 'Geciken denetim görevi / Overdue audit task escalation' : 'Denetim görevi / Audit task', `Denetim / Audit: ${row.auditId}\nGörev / Task: ${row.id}\nTermin / Due: ${notice.due} (${raw.time_zone})\n${notice.milestone === 'escalation' ? 'Fornost > Denetim Yönetimi / Audit Management > Talepler ve inceleme / Requests and review' : 'Fornost > My Work / İşlerim > Denetim talebi / Audit request'}`, notice.milestone, stamp, stamp, stamp,
      JSON.stringify({ kind: 'audit-request', auditId: row.auditId, requestId: row.id, revision: row.revision, milestone: notice.milestone, profileRevision: saved.revision }), row.id, row.revision, saved.revision).run();
    }
  }
  // Deleted audits and terminal requests cannot keep live reminders. Other publishers are untouched.
  await db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE route='audit-request' AND status='queued' AND NOT EXISTS(SELECT 1 FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id WHERE r.id=continuous_assurance_notification_outbox.escalation_id AND r.revision=json_extract(continuous_assurance_notification_outbox.source_json,'$.revision') AND json_extract(r.data_json,'$.status') IN ('assigned','submitted','changes_requested'))`).bind(stamp, stamp).run();
}
export async function auditRequestNotificationCurrent(db: D1Database, item: AssuranceDeliveryOutbox, now = new Date()) {
  if (item.route !== 'audit-request') return true;
  await ensureAuditRequestSchema(db);
  const raw = await db.prepare(`SELECT r.*,w.time_zone,p.revision AS profile_revision,p.data_json AS profile_json FROM audit_requests r JOIN simple_audits a ON a.id=r.audit_id JOIN audit_request_workflows w ON w.audit_id=r.audit_id AND w.state='active' LEFT JOIN audit_reminder_profiles p ON p.audit_id=r.audit_id WHERE r.id=?`).bind(item.escalation_id).first<LiveRow>();
  if (!raw) return false;
  const expected = auditRequestNotifications(publicAuditRequest(raw), raw.time_zone, now, profileOf(raw)).find(n => n.id === item.id);
  return !!expected && expected.id === item.id && expected.recipient === item.recipient && await auditRequestActorActive(db, expected.recipient);
}
