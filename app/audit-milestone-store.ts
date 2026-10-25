import {validateEvidenceChangeOrigin,type EvidenceChangeOrigin} from './evidence/change-followups';
import { prepareDeadlineAdjustment, deadlineCalendarGuard } from './audit-deadline-adjustment-store';
import {validateMilestoneBatch} from './audit-milestone-batch';
import {prepareBatchDeadlineAdjustment} from './audit-milestone-batch-deadline-store';
import type { Actor } from './api/auth/security';
import { canReadModule, canWriteModule, parseModuleAccess } from './module-access';
import { AuditRequestError, requestDueAt } from './audit-requests';
import { auditRequestId, requireAuditParent } from './audit-request-store';
import { ensureAuditClosureSchema } from './audit-closure-schema';
import { validateMilestone, validateMilestoneGraph, nextMilestoneDate, milestoneNextDue, milestoneLabels, type AuditMilestone } from './audit-milestones';
type Stored = { id:string; audit_id:string; revision:string; data_json:string; created_at:string; updated_at:string };
/** One guarded INSERT and its history commit together; no partial task packs. */
export async function createMilestoneBatch(db:D1Database, actor:Actor, input:Record<string,unknown>, now=new Date(), creation?:{origin:EvidenceChangeOrigin;guard:{sql:string;values:(string|number|null)[]}}) {
 if(!canWriteModule(actor,'Denetim Yönetimi'))throw new AuditRequestError('forbidden',403);
 const auditId=auditRequestId(input.auditId),items=validateMilestoneBatch(input.items),email=actor.email.toLowerCase();
 if(creation&&(items.length!==1||creation.origin.source.auditId!==auditId))throw new AuditRequestError('fields');
 if(creation)validateEvidenceChangeOrigin(creation.origin);
 if(actor.role!=='Admin'&&items.some(item=>item.fields.owner!==email))throw new AuditRequestError('owner',403);
 await ensureAuditClosureSchema(db);await requireAuditParent(db,auditId);
 const graphRows=await db.prepare('SELECT * FROM audit_milestones WHERE audit_id=? ORDER BY id LIMIT 101').bind(auditId).all<Stored>();
 if(graphRows.results.length>100)throw new AuditRequestError('source-invalid',503);
 if(graphRows.results.length+items.length>100)throw new AuditRequestError('limit',409);
 if(items.some(item=>graphRows.results.some(row=>row.id===item.id)))throw new AuditRequestError('conflict',409);
 const emails=[...new Set([email,...items.map(item=>item.fields.owner)])];
 const people=await db.prepare("SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND lower(u.email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(emails)).all<{id:string;email:string;role:string;policy:string|null}>();
 if(people.results.length!==emails.length||!people.results.some(p=>p.id===actor.id&&p.email===email&&p.role===actor.role)||people.results.some(p=>!canWriteModule({role:p.role,moduleAccess:parseModuleAccess(p.policy)},'Denetim Yönetimi')))throw new AuditRequestError('assignee',403);
 const stamp=now.toISOString(),rows:AuditMilestone[]=items.map(item=>({...item.fields,id:item.id,auditId,revision:crypto.randomUUID(),status:'planned',note:'',createdAt:stamp,updatedAt:stamp,...(creation?{evidenceChangeOrigin:creation.origin}:{})}));
 validateMilestoneGraph([...graphRows.results.map(row=>publicMilestone(row)),...rows]);
 const adjustment=await prepareBatchDeadlineAdjustment(db,auditId,input.deadlineAdjustment,items);
 const snapshot=JSON.stringify(graphRows.results.map(row=>({id:row.id,revision:row.revision}))),payload=JSON.stringify(rows);
 const historyPayload=JSON.stringify(rows.map(row=>({...row,...(adjustment?{deadlineAdjustment:adjustment.snapshots.get(row.id)}:{})})));
 const result=await db.batch([
  db.prepare(`WITH allowed AS MATERIALIZED (SELECT 1 WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?)
   AND (SELECT count(*) FROM audit_milestones WHERE audit_id=?)=?
   AND NOT EXISTS(SELECT 1 FROM json_each(?) g WHERE NOT EXISTS(SELECT 1 FROM audit_milestones m WHERE m.audit_id=? AND m.id=json_extract(g.value,'$.id') AND m.revision=json_extract(g.value,'$.revision')))
   AND NOT EXISTS(SELECT 1 FROM json_each(?) n JOIN audit_milestones m ON m.id=json_extract(n.value,'$.id'))
   AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(p.value,'$.id') AND lower(u.email)=json_extract(p.value,'$.email') AND u.role=json_extract(p.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(p.value,'$.policy')))
   ${deadlineCalendarGuard} AND (${creation?.guard.sql||'1'}))
   INSERT INTO audit_milestones(id,audit_id,revision,data_json,created_at,updated_at)
   SELECT json_extract(n.value,'$.id'),?,json_extract(n.value,'$.revision'),n.value,?,? FROM json_each(?) n WHERE EXISTS(SELECT 1 FROM allowed) RETURNING id`)
   .bind(auditId,auditId,graphRows.results.length,snapshot,auditId,payload,JSON.stringify(people.results),adjustment?1:0,auditId,adjustment?.revision||'',adjustment?.raw||'',...(creation?.guard.values||[]),auditId,stamp,stamp,payload),
  db.prepare(`INSERT INTO audit_milestone_events(id,audit_id,milestone_id,actor,action,note,snapshot_json,created_at)
   SELECT json_extract(n.value,'$.revision'),?,json_extract(n.value,'$.id'),?,'save','',n.value,? FROM json_each(?) n
   WHERE EXISTS(SELECT 1 FROM audit_milestones m WHERE m.id=json_extract(n.value,'$.id') AND m.audit_id=? AND m.revision=json_extract(n.value,'$.revision'))`)
   .bind(auditId,email,stamp,historyPayload,auditId),
 ]);
 if(result[0].results.length!==rows.length)throw new AuditRequestError('conflict',409);
 return {ids:rows.map(row=>row.id)};
}
export function publicMilestone(row: Stored, evidenceAccess=false): AuditMilestone {
 const value=JSON.parse(row.data_json), fields=validateMilestone(value);
 if (!Object.hasOwn(milestoneLabels,value.status) || typeof value.note!=='string') throw new AuditRequestError('source-invalid',503);
 if((value.recurrenceOf!==undefined&&(typeof value.recurrenceOf!=='string'||!/^AMT-[a-f0-9-]{36}$/.test(value.recurrenceOf)))||(value.recurrenceDay!==undefined&&(!Number.isInteger(value.recurrenceDay)||value.recurrenceDay<1||value.recurrenceDay>31)))throw new AuditRequestError('source-invalid',503);
 const review:Pick<AuditMilestone,'submittedBy'|'submittedAt'|'reviewedBy'|'reviewedAt'>={};
 for(const key of ['submittedBy','submittedAt','reviewedBy','reviewedAt'] as const)if(value[key]!==undefined){
  if(typeof value[key]!=='string'||value[key].length>254||(key.endsWith('At')?!Number.isFinite(Date.parse(value[key])):! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value[key])))throw new AuditRequestError('source-invalid',503);
  review[key]=value[key];
 }
 if((value.status==='submitted'||value.status==='changes_requested')&&!fields.reviewer)throw new AuditRequestError('source-invalid',503);
 if(value.status==='submitted'||(value.status==='completed'&&fields.reviewer)){
  if(!review.submittedBy||!review.submittedAt||review.submittedBy===fields.reviewer)throw new AuditRequestError('source-invalid',503);
  if(value.status==='completed'&&(!review.reviewedAt||review.reviewedBy!==fields.reviewer))throw new AuditRequestError('source-invalid',503);
 }
 return {...fields,...review,...(evidenceAccess&&value.evidenceChangeOrigin?{evidenceChangeOrigin:validateEvidenceChangeOrigin(value.evidenceChangeOrigin)}:{}),...(value.recurrenceOf?{recurrenceOf:value.recurrenceOf}:{}),...(value.recurrenceDay?{recurrenceDay:value.recurrenceDay}:{}),status:value.status,note:value.note,id:row.id,auditId:row.audit_id,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function readMilestones(db:D1Database,auditId:string,evidenceAccess=false) {
 auditRequestId(auditId); await ensureAuditClosureSchema(db); await requireAuditParent(db,auditId);
 const rows=await db.prepare('SELECT * FROM audit_milestones WHERE audit_id=? ORDER BY created_at,id LIMIT 101').bind(auditId).all<Stored>();
 return {milestones:rows.results.slice(0,100).map(row=>publicMilestone(row,evidenceAccess)),complete:rows.results.length<=100};
}
export async function milestonePeople(db:D1Database) {
 const rows=await db.prepare("SELECT u.id,u.name,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor') ORDER BY u.email LIMIT 1001").all<{id:string;name:string;email:string;role:string;policy:string|null}>();
 return {people:rows.results.slice(0,1000).filter(p=>canWriteModule({role:p.role,moduleAccess:parseModuleAccess(p.policy)},'Denetim Yönetimi')).map(p=>({email:p.email,name:p.name})),peopleComplete:rows.results.length<=1000};
}
export async function readMilestoneWork(db:D1Database,actor:Actor) {
 if(!canReadModule(actor,'Denetim Yönetimi'))return {milestones:[],complete:true};
 await ensureAuditClosureSchema(db);
 const rows=await db.prepare(`SELECT m.*,(SELECT count(*) FROM json_each(COALESCE(json_extract(m.data_json,'$.dependsOn'),'[]')) d WHERE NOT EXISTS(SELECT 1 FROM audit_milestones p WHERE p.audit_id=m.audit_id AND p.id=d.value AND json_extract(p.data_json,'$.status')='completed')) AS blockedCount FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id ORDER BY m.updated_at DESC,m.id LIMIT 1001`).all<Stored&{blockedCount:number}>();
 return {milestones:rows.results.slice(0,1000).map(raw=>{const row=publicMilestone(raw);return {id:row.id,auditId:row.auditId,title:row.title,status:row.status,owner:row.owner,reviewer:row.status==='submitted'?row.reviewer||'':'',dueDate:milestoneNextDue(row),timeZone:row.timeZone,createdAt:row.createdAt,updatedAt:row.updatedAt,blockedCount:raw.blockedCount,dueAt:requestDueAt(milestoneNextDue(row),row.timeZone)};}),complete:rows.results.length<=1000};
}
export async function mutateMilestone(db:D1Database,actor:Actor,input:Record<string,unknown>,now=new Date()) {
 if(!canWriteModule(actor,'Denetim Yönetimi'))throw new AuditRequestError('forbidden',403);
 const auditId=auditRequestId(input.auditId),sourceId=auditRequestId(input.id),action=String(input.action);
 let id=sourceId;
 if(!/^AMT-[a-f0-9-]{36}$/.test(id)||!['save','start','submit','approve','return','complete','cancel','reopen','repeat'].includes(action)||typeof input.expectedRevision!=='string'||input.expectedRevision.length>100)throw new AuditRequestError('fields');
 await ensureAuditClosureSchema(db);await requireAuditParent(db,auditId);
 const raw=await db.prepare('SELECT * FROM audit_milestones WHERE id=? AND audit_id=?').bind(id,auditId).first<Stored>(),current=raw?publicMilestone(raw,true):null;
 if((current?.revision||'')!==input.expectedRevision)throw new AuditRequestError('conflict',409);
 const email=actor.email.toLowerCase(),note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>2000||((action!=='save'||current)&&note.length<3))throw new AuditRequestError('note');
 const reviewAction=action==='approve'||action==='return';
 if(reviewAction){if(!current||email!==current.reviewer||email===current.owner||email===current.submittedBy)throw new AuditRequestError('independent-review',403);}
 else if(current&&email!==current.owner&&actor.role!=='Admin')throw new AuditRequestError('owner',403);
 let fields,status:AuditMilestone['status'];
 if(action==='save'){
  if(current&&['completed','cancelled','submitted'].includes(current.status))throw new AuditRequestError('transition',409);
  const rawFields=input.fields;
  if(!rawFields||typeof rawFields!=='object'||Array.isArray(rawFields))throw new AuditRequestError('fields');
  fields=validateMilestone({...rawFields,...(current?.reviewer!==undefined&&!Object.hasOwn(rawFields,'reviewer')&&!Object.hasOwn(rawFields,'reviewDueDate')?{reviewer:current.reviewer,reviewDueDate:current.reviewDueDate}: {})});status=current?.status||'planned';
  if(status==='changes_requested'&&!fields.reviewer)status='in_progress';
  if(actor.role!=='Admin'&&((fields.reviewer||'')!==(current?.reviewer||'')||(fields.reviewDueDate||'')!==(current?.reviewDueDate||'')))throw new AuditRequestError('review-admin',403);
  if(current?.remindersEnabled!==undefined&&!Object.hasOwn(input.fields as object,'remindersEnabled'))fields.remindersEnabled=current.remindersEnabled;
  if(current?.recurrence && !Object.hasOwn(input.fields as object,'recurrence'))fields.recurrence=current.recurrence;
  if(current?.dependsOn && !Object.hasOwn(input.fields as object,'dependsOn'))fields.dependsOn=[...current.dependsOn];
  if(actor.role!=='Admin'&&fields.owner!==email)throw new AuditRequestError('owner',403);
 }else{
  if(!current)throw new AuditRequestError('missing',404);
  fields=validateMilestone(current);status=current.status;
  if(action==='repeat'){
   if(status!=='completed'||!current.recurrence||current.recurrence==='none')throw new AuditRequestError('transition',409);
   id='AMT-'+crypto.randomUUID();fields.dueDate=nextMilestoneDate(current.dueDate,current.recurrence,current.recurrenceDay);fields.dependsOn=[sourceId];status='planned';
   if(fields.reviewer&&fields.reviewDueDate){const gap=Date.parse(fields.reviewDueDate+'T12:00:00Z')-Date.parse(current.dueDate+'T12:00:00Z');fields.reviewDueDate=new Date(Date.parse(fields.dueDate+'T12:00:00Z')+gap).toISOString().slice(0,10);fields=validateMilestone(fields);}
  }
  if(action==='start'){if(!['planned','changes_requested'].includes(status))throw new AuditRequestError('transition',409);status='in_progress';}
  if(action==='submit'){
   if(!['planned','in_progress','changes_requested'].includes(status))throw new AuditRequestError('transition',409);
   if(!fields.reviewer||fields.reviewer===email)throw new AuditRequestError('independent-review',403);status='submitted';
  }
  if(reviewAction){if(status!=='submitted')throw new AuditRequestError('transition',409);status=action==='approve'?'completed':'changes_requested';}
  if(action==='complete'){
   if(!['planned','in_progress','changes_requested'].includes(status))throw new AuditRequestError('transition',409);
   if(fields.reviewer)throw new AuditRequestError('review-required',409);status='completed';
  }
  if(action==='cancel'){if(!['planned','in_progress','changes_requested','submitted'].includes(status))throw new AuditRequestError('transition',409);status='cancelled';}
  if(action==='reopen'){if(!['completed','cancelled'].includes(status))throw new AuditRequestError('transition',409);status='planned';}
 }
 // Recovery may proceed with a disabled former owner; any new assignment must be active.
 const emails=[...new Set(['save','start','submit','approve','complete','repeat'].includes(action)?[email,fields.owner,...(fields.reviewer?[fields.reviewer]:[])]:[email])];
 const people=await db.prepare("SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND lower(u.email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(emails)).all<{id:string;email:string;role:string;policy:string|null}>();
 if(people.results.length!==emails.length||!people.results.some(p=>p.id===actor.id&&p.email===email&&p.role===actor.role)||people.results.some(p=>!canWriteModule({role:p.role,moduleAccess:parseModuleAccess(p.policy)},'Denetim Yönetimi')||(current?.evidenceChangeOrigin&&['save','start','submit','approve','complete','repeat'].includes(action)&&!canReadModule({role:p.role,moduleAccess:parseModuleAccess(p.policy)},'Kanıtlar'))))throw new AuditRequestError('assignee',403);
 const revision=crypto.randomUUID(),stamp=now.toISOString(),next:AuditMilestone={...fields,id,auditId,revision,status,note,createdAt:action==='repeat'?stamp:current?.createdAt||stamp,updatedAt:stamp};
 if(current?.evidenceChangeOrigin&&action!=='repeat')next.evidenceChangeOrigin=current.evidenceChangeOrigin;
 if(current&&!['save','reopen','repeat','submit'].includes(action))for(const key of ['submittedBy','submittedAt','reviewedBy','reviewedAt'] as const)if(current[key])next[key]=current[key];
 if(action==='submit'){next.submittedBy=email;next.submittedAt=stamp;}
 if(reviewAction){next.reviewedBy=email;next.reviewedAt=stamp;}
 if(action==='repeat')next.recurrenceOf=sourceId;else if(current?.recurrenceOf)next.recurrenceOf=current.recurrenceOf;
 if(fields.recurrence&&fields.recurrence!=='none')next.recurrenceDay=current&&current.recurrence===fields.recurrence&&(action==='repeat'||current.dueDate===fields.dueDate)?current.recurrenceDay||Number(current.dueDate.slice(8)):Number(fields.dueDate.slice(8));
 const adjustment = await prepareDeadlineAdjustment(db, auditId, action, input.deadlineAdjustment, fields);
 const graphRows=await db.prepare('SELECT * FROM audit_milestones WHERE audit_id=? ORDER BY id LIMIT 101').bind(auditId).all<Stored>();
 if(graphRows.results.length>100)throw new AuditRequestError('source-invalid',503);
 const graph=graphRows.results.map(row=>publicMilestone(row));
 if(action==='repeat'&&graph.some(row=>row.recurrenceOf===sourceId))throw new AuditRequestError('recurrence-exists',409);
 validateMilestoneGraph([...graph.filter(row=>row.id!==id),next]);
 const graphSnapshot=JSON.stringify(graphRows.results.map(row=>({id:row.id,revision:row.revision})));
 const result=await db.batch([
  db.prepare(`INSERT INTO audit_milestones(id,audit_id,revision,data_json,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM simple_audits WHERE id=?)
   AND (?<>'repeat' OR EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND audit_id=? AND revision=?))
   AND COALESCE((SELECT revision FROM audit_milestones WHERE id=? AND audit_id=?),'')=?
   AND (EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND audit_id=?) OR (SELECT count(*) FROM audit_milestones WHERE audit_id=?)<100)
   AND NOT EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND audit_id<>?)
   AND (SELECT count(*) FROM audit_milestones WHERE audit_id=?)=?
   AND NOT EXISTS(SELECT 1 FROM json_each(?) g WHERE NOT EXISTS(SELECT 1 FROM audit_milestones m WHERE m.audit_id=? AND m.id=json_extract(g.value,'$.id') AND m.revision=json_extract(g.value,'$.revision')))
   AND NOT EXISTS(SELECT 1 FROM json_each(?) p WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(p.value,'$.id') AND lower(u.email)=json_extract(p.value,'$.email') AND u.role=json_extract(p.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(p.value,'$.policy')))
   ${deadlineCalendarGuard}
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at RETURNING id`).bind(id,auditId,revision,JSON.stringify(next),next.createdAt,stamp,auditId,action,sourceId,auditId,input.expectedRevision,id,auditId,action==='repeat'?'':input.expectedRevision,id,auditId,auditId,id,auditId,auditId,graphRows.results.length,graphSnapshot,auditId,JSON.stringify(people.results), adjustment ? 1 : 0, auditId, adjustment?.revision || '', adjustment?.raw || ''),
  db.prepare("UPDATE continuous_assurance_notification_outbox SET status='cancelled',closed_at=?,updated_at=? WHERE route='audit-milestone' AND escalation_id=? AND status='queued' AND EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND revision=?)").bind(stamp,stamp,id,id,revision),
  db.prepare('INSERT INTO audit_milestone_events(id,audit_id,milestone_id,actor,action,note,snapshot_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND audit_id=? AND revision=?)').bind(revision,auditId,id,email,action,note,JSON.stringify({ ...next, ...(adjustment ? { deadlineAdjustment: adjustment.snapshot } : {}) }), stamp, id, auditId, revision),
 ]);
 if(!result[0].results.length)throw new AuditRequestError('conflict',409);
 return {id,revision};
}
