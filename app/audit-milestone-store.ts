import type { Actor } from './api/auth/security';
import { canReadModule, canWriteModule, parseModuleAccess } from './module-access';
import { AuditRequestError, requestDueAt } from './audit-requests';
import { auditRequestId, requireAuditParent } from './audit-request-store';
import { ensureAuditClosureSchema } from './audit-closure-schema';
import { validateMilestone, validateMilestoneGraph, nextMilestoneDate, milestoneLabels, type AuditMilestone } from './audit-milestones';
type Stored = { id:string; audit_id:string; revision:string; data_json:string; created_at:string; updated_at:string };
export function publicMilestone(row: Stored): AuditMilestone {
 const value=JSON.parse(row.data_json), fields=validateMilestone(value);
 if (!Object.hasOwn(milestoneLabels,value.status) || typeof value.note!=='string') throw new AuditRequestError('source-invalid',503);
 if((value.recurrenceOf!==undefined&&(typeof value.recurrenceOf!=='string'||!/^AMT-[a-f0-9-]{36}$/.test(value.recurrenceOf)))||(value.recurrenceDay!==undefined&&(!Number.isInteger(value.recurrenceDay)||value.recurrenceDay<1||value.recurrenceDay>31)))throw new AuditRequestError('source-invalid',503);
 return {...fields,...(value.recurrenceOf?{recurrenceOf:value.recurrenceOf}:{}),...(value.recurrenceDay?{recurrenceDay:value.recurrenceDay}:{}),status:value.status,note:value.note,id:row.id,auditId:row.audit_id,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function readMilestones(db:D1Database,auditId:string) {
 auditRequestId(auditId); await ensureAuditClosureSchema(db); await requireAuditParent(db,auditId);
 const rows=await db.prepare('SELECT * FROM audit_milestones WHERE audit_id=? ORDER BY created_at,id LIMIT 101').bind(auditId).all<Stored>();
 return {milestones:rows.results.slice(0,100).map(publicMilestone),complete:rows.results.length<=100};
}
export async function milestonePeople(db:D1Database) {
 const rows=await db.prepare("SELECT u.id,u.name,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor') ORDER BY u.email LIMIT 1001").all<{id:string;name:string;email:string;role:string;policy:string|null}>();
 return {people:rows.results.slice(0,1000).filter(p=>canWriteModule({role:p.role,moduleAccess:parseModuleAccess(p.policy)},'Denetim Yönetimi')).map(p=>({email:p.email,name:p.name})),peopleComplete:rows.results.length<=1000};
}
export async function readMilestoneWork(db:D1Database,actor:Actor) {
 if(!canReadModule(actor,'Denetim Yönetimi'))return {milestones:[],complete:true};
 await ensureAuditClosureSchema(db);
 const rows=await db.prepare(`SELECT m.id,m.audit_id AS auditId,json_extract(m.data_json,'$.title') AS title,json_extract(m.data_json,'$.status') AS status,json_extract(m.data_json,'$.owner') AS owner,json_extract(m.data_json,'$.dueDate') AS dueDate,json_extract(m.data_json,'$.timeZone') AS timeZone,m.created_at AS createdAt,m.updated_at AS updatedAt,(SELECT count(*) FROM json_each(COALESCE(json_extract(m.data_json,'$.dependsOn'),'[]')) d WHERE NOT EXISTS(SELECT 1 FROM audit_milestones p WHERE p.audit_id=m.audit_id AND p.id=d.value AND json_extract(p.data_json,'$.status')='completed')) AS blockedCount,json_extract(m.data_json,'$.dependsOn') AS dependenciesJson FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id ORDER BY m.updated_at DESC,m.id LIMIT 1001`).all<{id:string;auditId:string;title:string;status:string;owner:string;dueDate:string;timeZone:string;createdAt:string;updatedAt:string;blockedCount:number;dependenciesJson:string|null}>();
 return {milestones:rows.results.slice(0,1000).map(({dependenciesJson,...row})=>{validateMilestone({...row,description:'',...(dependenciesJson===null?{}:{dependsOn:JSON.parse(dependenciesJson)})});if(!Object.hasOwn(milestoneLabels,row.status))throw new AuditRequestError('source-invalid',503);return {...row,dueAt:requestDueAt(row.dueDate,row.timeZone)};}),complete:rows.results.length<=1000};
}
export async function mutateMilestone(db:D1Database,actor:Actor,input:Record<string,unknown>,now=new Date()) {
 if(!canWriteModule(actor,'Denetim Yönetimi'))throw new AuditRequestError('forbidden',403);
 const auditId=auditRequestId(input.auditId),sourceId=auditRequestId(input.id),action=String(input.action);
 let id=sourceId;
 if(!/^AMT-[a-f0-9-]{36}$/.test(id)||!['save','start','complete','cancel','reopen','repeat'].includes(action)||typeof input.expectedRevision!=='string'||input.expectedRevision.length>100)throw new AuditRequestError('fields');
 await ensureAuditClosureSchema(db);await requireAuditParent(db,auditId);
 const raw=await db.prepare('SELECT * FROM audit_milestones WHERE id=? AND audit_id=?').bind(id,auditId).first<Stored>(),current=raw?publicMilestone(raw):null;
 if((current?.revision||'')!==input.expectedRevision)throw new AuditRequestError('conflict',409);
 const email=actor.email.toLowerCase(),note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>2000||((action!=='save'||current)&&note.length<3))throw new AuditRequestError('note');
 if(current&&email!==current.owner&&actor.role!=='Admin')throw new AuditRequestError('owner',403);
 let fields,status:AuditMilestone['status'];
 if(action==='save'){
  if(current&&['completed','cancelled'].includes(current.status))throw new AuditRequestError('transition',409);
  fields=validateMilestone(input.fields);status=current?.status||'planned';
  if(current?.recurrence && !Object.hasOwn(input.fields as object,'recurrence'))fields.recurrence=current.recurrence;
  if(current?.dependsOn && !Object.hasOwn(input.fields as object,'dependsOn'))fields.dependsOn=[...current.dependsOn];
  if(actor.role!=='Admin'&&fields.owner!==email)throw new AuditRequestError('owner',403);
 }else{
  if(!current)throw new AuditRequestError('missing',404);
  fields=validateMilestone(current);status=current.status;
  if(action==='repeat'){if(status!=='completed'||!current.recurrence||current.recurrence==='none')throw new AuditRequestError('transition',409);id='AMT-'+crypto.randomUUID();fields.dueDate=nextMilestoneDate(current.dueDate,current.recurrence,current.recurrenceDay);fields.dependsOn=[sourceId];status='planned';}
  if(action==='start'){if(status!=='planned')throw new AuditRequestError('transition',409);status='in_progress';}
  if(action==='complete'||action==='cancel'){if(!['planned','in_progress'].includes(status))throw new AuditRequestError('transition',409);status=action==='complete'?'completed':'cancelled';}
  if(action==='reopen'){if(!['completed','cancelled'].includes(status))throw new AuditRequestError('transition',409);status='planned';}
 }
 // Recovery may proceed with a disabled former owner; any new assignment must be active.
 const emails=[...new Set(action==='save'||action==='start'||action==='complete'||action==='repeat'?[email,fields.owner]:[email])];
 const people=await db.prepare("SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND lower(u.email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(emails)).all<{id:string;email:string;role:string;policy:string|null}>();
 if(people.results.length!==emails.length||!people.results.some(p=>p.id===actor.id&&p.email===email&&p.role===actor.role)||people.results.some(p=>!canWriteModule({role:p.role,moduleAccess:parseModuleAccess(p.policy)},'Denetim Yönetimi')))throw new AuditRequestError('assignee',403);
 const revision=crypto.randomUUID(),stamp=now.toISOString(),next:AuditMilestone={...fields,id,auditId,revision,status,note,createdAt:action==='repeat'?stamp:current?.createdAt||stamp,updatedAt:stamp};
 if(action==='repeat')next.recurrenceOf=sourceId;else if(current?.recurrenceOf)next.recurrenceOf=current.recurrenceOf;
 if(fields.recurrence&&fields.recurrence!=='none')next.recurrenceDay=current&&current.recurrence===fields.recurrence&&(action==='repeat'||current.dueDate===fields.dueDate)?current.recurrenceDay||Number(current.dueDate.slice(8)):Number(fields.dueDate.slice(8));
 const graphRows=await db.prepare('SELECT * FROM audit_milestones WHERE audit_id=? ORDER BY id LIMIT 101').bind(auditId).all<Stored>();
 if(graphRows.results.length>100)throw new AuditRequestError('source-invalid',503);
 const graph=graphRows.results.map(publicMilestone);
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
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at RETURNING id`).bind(id,auditId,revision,JSON.stringify(next),next.createdAt,stamp,auditId,action,sourceId,auditId,input.expectedRevision,id,auditId,action==='repeat'?'':input.expectedRevision,id,auditId,auditId,id,auditId,auditId,graphRows.results.length,graphSnapshot,auditId,JSON.stringify(people.results)),
  db.prepare('INSERT INTO audit_milestone_events(id,audit_id,milestone_id,actor,action,note,snapshot_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_milestones WHERE id=? AND audit_id=? AND revision=?)').bind(revision,auditId,id,email,action,note,JSON.stringify(next),stamp,id,auditId,revision),
 ]);
 if(!result[0].results.length)throw new AuditRequestError('conflict',409);
 return {id,revision};
}
