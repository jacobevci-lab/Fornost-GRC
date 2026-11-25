import { ensureAuditClosureSchema } from './audit-closure-schema';
import { publicMilestone } from './audit-milestone-store';
import { milestoneNextDue, type AuditMilestone } from './audit-milestones';
import { canWriteModule, parseModuleAccess } from './module-access';
import { defaultAuditReminderProfile, reminderLocalDate, reminderMilestones, reminderWorkingDay, validateAuditReminderProfile, type SavedAuditReminderProfile } from './audit-reminder-profile';
import type { AssuranceDeliveryOutbox } from './assurance-notification-delivery';

export function milestoneNotifications(row: AuditMilestone, now: Date, saved: SavedAuditReminderProfile = {revision:'',profile:defaultAuditReminderProfile}) {
 if(!row.remindersEnabled||!['planned','in_progress','changes_requested','submitted'].includes(row.status))return [];
 const p=saved.profile,today=reminderLocalDate(now,row.timeZone);if(!reminderWorkingDay(today,p))return [];
 const dates=reminderMilestones(milestoneNextDue(row),p),recipient=row.status==='submitted'?row.reviewer!:row.owner,review=row.status==='submitted';
 const phase=today>=dates.overdue?'overdue':today>=dates.due?'due':p.beforeDays&&today>=dates.before?'due-soon':'';
 if(!phase)return [];
 const notice=(recipient:string,milestone:string)=>{const suffix=saved.revision?':'+saved.revision:'';return {recipient,milestone,id:`AMN-${row.id}-${row.revision}-${milestone}${suffix}`,fingerprint:`audit-milestone:${row.id}:${row.revision}:${milestone}${suffix}`};};
 const notices=[notice(recipient,review?'review-'+phase:phase)];
 if(dates.escalation&&today>=dates.escalation&&p.escalationRecipient!==recipient)notices.push(notice(p.escalationRecipient,review?'review-escalation':'escalation'));
 return notices;
}
type LiveRow={id:string;audit_id:string;revision:string;data_json:string;created_at:string;updated_at:string;profile_revision:string|null;profile_json:string|null};
const source=`SELECT m.*,p.revision AS profile_revision,p.data_json AS profile_json FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id LEFT JOIN audit_reminder_profiles p ON p.audit_id=m.audit_id WHERE NOT EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.audit_id=m.audit_id AND c.state='closed')`;
const profileOf=(raw:LiveRow):SavedAuditReminderProfile=>({revision:raw.profile_revision||'',profile:raw.profile_json?validateAuditReminderProfile(JSON.parse(raw.profile_json)):defaultAuditReminderProfile});
async function recipientActive(db:D1Database,email:string){
 const row=await db.prepare("SELECT u.role,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE lower(u.email)=? AND u.status='Active' AND u.role IN ('Admin','Editor')").bind(email.toLowerCase()).first<{role:string;policy_json:string|null}>();
 return !!row&&canWriteModule({role:row.role,moduleAccess:parseModuleAccess(row.policy_json)},'Denetim Yönetimi');
}
export async function syncMilestoneNotifications(db:D1Database,now=new Date(),auditId?:string){
 await ensureAuditClosureSchema(db);
 const query=db.prepare(source+` AND json_extract(m.data_json,'$.remindersEnabled')=1 AND json_extract(m.data_json,'$.status') IN ('planned','in_progress','changes_requested','submitted')${auditId?' AND m.audit_id=?':''} ORDER BY m.updated_at DESC,m.id LIMIT 5001`);
 const rows=await(auditId?query.bind(auditId):query).all<LiveRow>();if(rows.results.length>5000)throw Error('Milestone reminder source exceeds its processing limit.');
 const stamp=now.toISOString();
 for(const raw of rows.results){
  const row=publicMilestone(raw),saved=profileOf(raw),allowed=[];
  for(const notice of milestoneNotifications(row,now,saved))if(await recipientActive(db,notice.recipient))allowed.push(notice);
  await db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE route='audit-milestone' AND escalation_id=? AND status='queued' AND fingerprint NOT IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND revision=? AND COALESCE((SELECT revision FROM audit_reminder_profiles WHERE audit_id=audit_milestones.audit_id),'')=?)`).bind(stamp,stamp,row.id,JSON.stringify(allowed.map(n=>n.fingerprint)),row.id,row.revision,saved.revision).run();
  for(const notice of allowed){
   // Email contains identifiers and deadline only; narratives remain behind authenticated access.
   await db.prepare(`INSERT INTO continuous_assurance_notification_outbox(id,fingerprint,escalation_id,recipient,route,subject,body,severity,status,reason,created_at,updated_at,last_routed_at,closed_at,source_json)
    SELECT ?,?,?,?,'audit-milestone',?,?,'medium','queued',?,?,?,?,NULL,? WHERE EXISTS(SELECT 1 FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id WHERE m.id=? AND m.revision=? AND COALESCE((SELECT revision FROM audit_reminder_profiles WHERE audit_id=m.audit_id),'')=? AND NOT EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.audit_id=m.audit_id AND c.state='closed'))
    ON CONFLICT(fingerprint) DO UPDATE SET status='queued',closed_at=NULL,updated_at=excluded.updated_at WHERE continuous_assurance_notification_outbox.status='cancelled'`).bind(notice.id,notice.fingerprint,row.id,notice.recipient,notice.milestone.endsWith('escalation')?'Denetim görevi eskalasyonu / Audit milestone escalation':'Denetim görevi hatırlatması / Audit milestone reminder',`Denetim / Audit: ${row.auditId}\nGörev / Milestone: ${row.id}\nHedef tarih / Due: ${milestoneNextDue(row)} (${row.timeZone})\nAşama / Stage: ${row.status==='submitted'?'İnceleme / Review':'Hazırlık / Preparation'}\nFornost > Denetim / Audit > Plan ve kapsam / Plan and scope`,notice.milestone,stamp,stamp,stamp,JSON.stringify({kind:'audit-milestone',auditId:row.auditId,milestoneId:row.id,revision:row.revision,phase:notice.milestone,profileRevision:saved.revision}),row.id,row.revision,saved.revision).run();
  }
 }
 await db.prepare(`UPDATE continuous_assurance_notification_outbox SET status='cancelled',updated_at=?,closed_at=? WHERE route='audit-milestone' AND status='queued' AND NOT EXISTS(SELECT 1 FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id WHERE m.id=continuous_assurance_notification_outbox.escalation_id AND m.revision=json_extract(continuous_assurance_notification_outbox.source_json,'$.revision') AND json_extract(m.data_json,'$.remindersEnabled')=1 AND json_extract(m.data_json,'$.status') IN ('planned','in_progress','changes_requested','submitted') AND NOT EXISTS(SELECT 1 FROM audit_closure_state c WHERE c.audit_id=m.audit_id AND c.state='closed'))`).bind(stamp,stamp).run();
}
export async function milestoneNotificationCurrent(db:D1Database,item:AssuranceDeliveryOutbox,now=new Date()){
 if(item.route!=='audit-milestone')return true;
 await ensureAuditClosureSchema(db);
 const raw=await db.prepare(source+' AND m.id=?').bind(item.escalation_id).first<LiveRow>();if(!raw)return false;
 const row=publicMilestone(raw),expected=milestoneNotifications(row,now,profileOf(raw)).find(n=>n.id===item.id&&n.fingerprint===item.fingerprint);
 if(!expected||expected.recipient!==item.recipient)return false;
 let metadata;try{metadata=JSON.parse(item.source_json||'{}');}catch{return false;}
 return metadata.kind==='audit-milestone'&&metadata.milestoneId===row.id&&metadata.auditId===row.auditId&&metadata.revision===row.revision&&await recipientActive(db,expected.recipient);
}
