import type { Actor } from './api/auth/security';
import { canWriteModule, parseModuleAccess } from './module-access';
import { AuditRequestError } from './audit-requests';
import { auditRequestActorActive, auditRequestId, ensureAuditRequestSchema, requireAuditParent } from './audit-request-store';
import { defaultAuditReminderProfile, validateAuditReminderProfile, type SavedAuditReminderProfile } from './audit-reminder-profile';
import { ensureAuditClosureSchema } from './audit-closure-schema';

export async function readAuditReminderProfile(db: D1Database, auditId: string): Promise<SavedAuditReminderProfile> {
  await ensureAuditRequestSchema(db); await requireAuditParent(db, auditId);
  const row = await db.prepare('SELECT revision,data_json FROM audit_reminder_profiles WHERE audit_id=?').bind(auditId).first<{ revision: string; data_json: string }>();
  return row ? { revision: row.revision, profile: validateAuditReminderProfile(JSON.parse(row.data_json)) } : { revision: '', profile: { ...defaultAuditReminderProfile } };
}
export async function saveAuditReminderProfile(db: D1Database, actor: Actor, input: { auditId: unknown; expectedRevision?: unknown; expectedWorkflowRevision?: unknown; profile?: unknown }, now = new Date()) {
  if (!canWriteModule(actor, 'Denetim Yönetimi')) throw new AuditRequestError('forbidden', 403);
  const auditId = auditRequestId(input.auditId), profile = validateAuditReminderProfile(input.profile);
  if (typeof input.expectedRevision !== 'string' || input.expectedRevision.length > 100 || typeof input.expectedWorkflowRevision !== 'string' || input.expectedWorkflowRevision.length > 100) throw new AuditRequestError('revision');
  await ensureAuditClosureSchema(db); await requireAuditParent(db, auditId);
  if (profile.escalationRecipient && !await auditRequestActorActive(db, profile.escalationRecipient)) throw new AuditRequestError('assignee');
  const emails = [...new Set([actor.email.toLowerCase(), profile.escalationRecipient].filter(Boolean))];
  const people = await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE lower(u.email) IN (SELECT value FROM json_each(?)) AND u.status='Active'`).bind(JSON.stringify(emails)).all<{ id: string; email: string; role: string; policy: string | null }>();
  if (people.results.length !== emails.length || !people.results.some(p => p.id === actor.id && p.email === actor.email.toLowerCase()) || people.results.some(p => !canWriteModule({ role: p.role, moduleAccess: parseModuleAccess(p.policy) }, 'Denetim Yönetimi'))) throw new AuditRequestError('forbidden', 403);
  const revision = crypto.randomUUID(), stamp = now.toISOString();
  const result = await db.batch([
    db.prepare(`INSERT INTO audit_reminder_profiles(audit_id,revision,data_json,updated_by,updated_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?)
      AND COALESCE((SELECT revision FROM audit_reminder_profiles WHERE audit_id=?),'')=?
      AND COALESCE((SELECT revision FROM audit_request_workflows WHERE audit_id=?),'')=?
      AND NOT EXISTS(SELECT 1 FROM audit_request_workflows WHERE audit_id=? AND state='closed')
      AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(p.value,'$.id') AND lower(u.email)=json_extract(p.value,'$.email') AND u.role=json_extract(p.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(p.value,'$.policy')))
      ON CONFLICT(audit_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING audit_id`).bind(auditId, revision, JSON.stringify(profile), actor.email, stamp, auditId, auditId, input.expectedRevision, auditId, input.expectedWorkflowRevision, auditId, JSON.stringify(people.results)),
    db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',closed_at=?,updated_at=? WHERE route IN ('audit-request','audit-milestone') AND status='queued' AND json_extract(source_json,'$.auditId')=? AND EXISTS(SELECT 1 FROM audit_reminder_profiles WHERE audit_id=? AND revision=?)`).bind(stamp, stamp, auditId, auditId, revision),
    db.prepare(`INSERT INTO audit_request_events(id,audit_id,request_id,action,actor,snapshot_json,created_at) SELECT ?,?,'','reminder-profile',?,?,? WHERE EXISTS(SELECT 1 FROM audit_reminder_profiles WHERE audit_id=? AND revision=?)`).bind(revision, auditId, actor.email, JSON.stringify({ profile, revision }), stamp, auditId, revision),
  ]);
  if (!result[0].results.length) throw new AuditRequestError('conflict', 409);
}
