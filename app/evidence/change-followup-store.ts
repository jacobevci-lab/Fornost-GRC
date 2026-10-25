import type { Actor } from '../api/auth/security';
import { canReadModule, canWriteModule, parseModuleAccess } from '../module-access';
import { auditReportHash } from '../audit-status-report';
import { ensureAuditClosureSchema } from '../audit-closure-schema';
import { auditRequestId, auditRequestPeople } from '../audit-request-store';
import { AuditRequestError } from '../audit-requests';
import { createMilestoneBatch, publicMilestone } from '../audit-milestone-store';
import { validateMilestoneBatch } from '../audit-milestone-batch';
import { usagePins } from './usage';
import { evidenceChangeSource, type EvidenceChangeOrigin, type EvidenceChangePreview, type EvidenceChangeSource } from './change-followups';

type Person = {id:string;email:string;role:string;policy:string|null};
type Anchor = {id:string;code:string|null;data_json:string;updated_at:string;version_id:string|null;version_no:number|null;content_sha256:string|null};
type Source = {id:string;audit_id:string;revision:string;data_json:string;audit_name:string;closure:string;workflow_state:string;workflow_revision:string;time_zone:string};
type PinVersion = {id:string;evidence_id:string;version_no:number;content_sha256:string};
type StoredMilestone = Parameters<typeof publicMilestone>[0];
const str = (v:unknown) => typeof v==='string'?v:'';
const actorGuard = `EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)`;
const personArgs = (p:Person) => [p.id,p.email,p.role,p.policy];
function allowed(actor:{role:string;moduleAccess?:Actor['moduleAccess']},write=false){return ['Admin','Editor','Viewer'].includes(actor.role)&&canReadModule(actor,'Kanıtlar')&&(write?canWriteModule(actor,'Denetim Yönetimi'):canReadModule(actor,'Denetim Yönetimi'));}
async function liveActor(db:D1Database,actor:Actor,write=false){
  if(!allowed(actor,write))throw new AuditRequestError('forbidden',403);
  const p=await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.status='Active'`).bind(actor.id).first<Person>();
  if(!p||p.email!==actor.email.toLowerCase()||p.role!==actor.role||!allowed({role:p.role,moduleAccess:parseModuleAccess(p.policy)},write))throw new AuditRequestError('forbidden',403);
  return p;
}
const tableFor = (kind:EvidenceChangeSource) => kind==='requests'?'audit_requests':'audit_workpapers';
const pinIds = (table:string) => `SELECT json_extract(e.value,'$.id') FROM ${table} p,json_each(p.data_json,'$.evidence') e WHERE p.id=? AND json_extract(e.value,'$.evidenceId')=?`;
async function snapshot(db:D1Database,p:Person,evidenceId:string,kind:EvidenceChangeSource,sourceId:string){
  const table=tableFor(kind);
  const results=await db.batch([
    db.prepare(`SELECT r.id,c.code,r.data_json,r.updated_at,v.id AS version_id,v.version_no,v.content_sha256 FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id LEFT JOIN evidence_versions v ON v.id=(SELECT id FROM evidence_versions WHERE evidence_id=r.id ORDER BY version_no DESC LIMIT 1) WHERE r.id=? AND r.module='Kanıtlar' AND ${actorGuard}`).bind(evidenceId,...personArgs(p)),
    db.prepare(`SELECT p.id,p.audit_id,p.revision,p.data_json,a.name AS audit_name,COALESCE(c.state,'open') AS closure,COALESCE(w.state,'draft') AS workflow_state,COALESCE(w.revision,'') AS workflow_revision,COALESCE(w.time_zone,'UTC') AS time_zone FROM ${table} p JOIN simple_audits a ON a.id=p.audit_id LEFT JOIN audit_closure_state c ON c.audit_id=p.audit_id LEFT JOIN audit_request_workflows w ON w.audit_id=p.audit_id WHERE p.id=? AND ${actorGuard}`).bind(sourceId,...personArgs(p)),
    db.prepare(`SELECT id,evidence_id,version_no,content_sha256 FROM evidence_versions WHERE id IN (${pinIds(table)}) AND ${actorGuard} ORDER BY id LIMIT 101`).bind(sourceId,evidenceId,...personArgs(p)),
    db.prepare(`SELECT 1 AS ok WHERE ${actorGuard}`).bind(...personArgs(p)),
  ]);
  if(!results[3].results.length)throw new AuditRequestError('forbidden',403);
  const anchor=results[0].results[0] as Anchor|undefined,source=results[1].results[0] as Source|undefined,versions=results[2].results as PinVersion[];
  if(!anchor||!source)throw new AuditRequestError('missing',404);
  const data=JSON.parse(anchor.data_json),work=JSON.parse(source.data_json);
  if(!Array.isArray(work.evidence)||work.evidence.length>100||versions.length>100||!str(work.title)||!str(source.revision))throw new AuditRequestError('source-invalid',503);
  const evidence:EvidenceChangeOrigin['evidence']={id:evidenceId,code:anchor.code||evidenceId,title:(str(data.evidenceTitle)||evidenceId).slice(0,500),versionId:anchor.version_id||'',versionNo:anchor.version_no||0,contentSha256:anchor.content_sha256||''};
  const pins=usagePins(work.evidence.map((pin:Record<string,unknown>)=>({...pin,available:versions.some(v=>v.id===pin.id&&v.evidence_id===evidenceId&&v.version_no===pin.versionNo&&v.content_sha256===pin.contentSha256)?1:0})),{...evidence,updatedAt:anchor.updated_at});
  if(!pins.length)throw new AuditRequestError('not-linked',409);
  if(pins.some(pin=>pin.id.length>120||!Number.isInteger(pin.versionNo)||pin.versionNo<0))throw new AuditRequestError('source-invalid',503);
  const sourceView:EvidenceChangeOrigin['source']={kind,id:sourceId,auditId:source.audit_id,title:work.title.slice(0,500),revision:source.revision,status:str(work.status),pins};
  const currentVersion=!!evidence.versionId&&Number.isInteger(evidence.versionNo)&&evidence.versionNo>0&&/^[a-f0-9]{64}$/.test(evidence.contentSha256);
  const active=source.closure!=='closed'&&(kind!=='requests'||source.workflow_state!=='closed')&&(kind==='requests'?['assigned','submitted','changes_requested'].includes(work.status):['draft','submitted'].includes(work.status));
  const key=await auditReportHash({evidenceId,versionId:evidence.versionId,kind,sourceId});
  const token=await auditReportHash({anchor,source,versions,actor:p});
  return {anchor,source,versions,evidence,sourceView,key,token,active,currentVersion,needsReview:pins.some(pin=>pin.state!=='current'),sourceOwner:str(work.status==='submitted'?work.reviewer:work.owner),sourceDueDate:str(work.status==='submitted'?work.reviewDueDate:work.dueDate),timeZone:kind==='requests'?source.time_zone:str(work.timeZone)||'UTC'};
}
async function existingForKey(db:D1Database,key:string){
  return db.prepare(`SELECT m.* FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id WHERE json_type(m.data_json,'$.evidenceChangeOrigin')='object' AND json_extract(m.data_json,'$.evidenceChangeOrigin.key')=?`).bind(key).first<StoredMilestone>();
}
export async function readEvidenceChangePreview(db:D1Database,actor:Actor,evidenceId:string,sourceKind:unknown,sourceId:string):Promise<EvidenceChangePreview>{
  const p=await liveActor(db,actor),kind=evidenceChangeSource(sourceKind);auditRequestId(evidenceId);auditRequestId(sourceId);await ensureAuditClosureSchema(db);
  const s=await snapshot(db,p,evidenceId,kind,sourceId),prior=await existingForKey(db,s.key),row=prior?publicMilestone(prior,true):null;
  const write=allowed({role:p.role,moduleAccess:parseModuleAccess(p.policy)},true);
  const eligibility:EvidenceChangePreview['eligibility']=row?'existing':!write?'read-only':!s.currentVersion?'no-current-version':!s.active?'historical':!s.needsReview?'current':'ready';
  const people=eligibility==='ready'?await auditRequestPeople(db):{people:[],complete:true};
  if(!await db.prepare(`SELECT 1 AS ok WHERE ${actorGuard}`).bind(...personArgs(p)).first())throw new AuditRequestError('forbidden',403);
  // Source/evidence contents are never returned; the hash binds the later explicit create.
  return {token:s.token,canCreate:eligibility==='ready',eligibility,evidence:s.evidence,source:s.sourceView,auditName:s.source.audit_name,sourceOwner:s.sourceOwner,sourceDueDate:s.sourceDueDate,timeZone:s.timeZone,actorEmail:p.email,admin:p.role==='Admin',people:people.people.map(({email,name})=>({email,name})),peopleComplete:people.complete,existing:row?{id:row.id,title:row.title,status:row.status,owner:row.owner,dueDate:row.dueDate}:null};
}
export async function createEvidenceChangeFollowup(db:D1Database,actor:Actor,input:Record<string,unknown>,now=new Date()){
  const p=await liveActor(db,actor,true),evidenceId=auditRequestId(input.evidenceId),kind=evidenceChangeSource(input.sourceKind),sourceId=auditRequestId(input.sourceId),id=auditRequestId(input.id);
  if(Object.keys(input).some(k=>!['evidenceId','sourceKind','sourceId','id','expectedToken','reason','fields'].includes(k))||typeof input.expectedToken!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedToken)||typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>2000)throw new AuditRequestError('fields');
  const [item]=validateMilestoneBatch([{id,fields:input.fields}]);
  if(actor.role!=='Admin'&&item.fields.owner!==p.email)throw new AuditRequestError('owner',403);
  const reason=input.reason.trim(),inputHash=await auditReportHash({evidenceId,kind,sourceId,expectedToken:input.expectedToken,fields:item.fields,reason,actor:{id:p.id,email:p.email}});
  await ensureAuditClosureSchema(db);
  const prior=await db.prepare('SELECT m.* FROM audit_milestones m JOIN simple_audits a ON a.id=m.audit_id WHERE m.id=?').bind(id).first<StoredMilestone>();
  if(prior){const row=publicMilestone(prior,true);if(row.evidenceChangeOrigin?.inputHash!==inputHash)throw new AuditRequestError('conflict',409);if(!await db.prepare(`SELECT 1 AS ok WHERE ${actorGuard}`).bind(...personArgs(p)).first())throw new AuditRequestError('forbidden',403);return{id,auditId:row.auditId,reused:true};}
  const s=await snapshot(db,p,evidenceId,kind,sourceId);
  if(s.token!==input.expectedToken)throw new AuditRequestError('changed',409);
  if(!s.currentVersion||!s.active||!s.needsReview)throw new AuditRequestError('followup-ineligible',409);
  if(await existingForKey(db,s.key))throw new AuditRequestError('followup-exists',409);
  const emails=[...new Set([p.email,item.fields.owner])];
  const people=await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND lower(u.email) IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(emails)).all<Person>();
  if(people.results.length!==emails.length||people.results.some(person=>!allowed({role:person.role,moduleAccess:parseModuleAccess(person.policy)},true)))throw new AuditRequestError('assignee',403);
  const origin:EvidenceChangeOrigin={version:1,key:s.key,inputHash,evidence:s.evidence,source:s.sourceView,reason,createdBy:p.email,createdAt:now.toISOString()};
  const table=tableFor(kind);
  const guard={sql:`${actorGuard}
    AND EXISTS(SELECT 1 FROM ${table} p JOIN simple_audits a ON a.id=p.audit_id WHERE p.id=? AND p.audit_id=? AND p.revision=? AND p.data_json=? AND a.name=?)
    AND COALESCE((SELECT state FROM audit_closure_state WHERE audit_id=?),'open')=?
    AND COALESCE((SELECT state FROM audit_request_workflows WHERE audit_id=?),'draft')=? AND COALESCE((SELECT revision FROM audit_request_workflows WHERE audit_id=?),'')=? AND COALESCE((SELECT time_zone FROM audit_request_workflows WHERE audit_id=?),'UTC')=?
    AND EXISTS(SELECT 1 FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id JOIN evidence_versions v ON v.evidence_id=r.id WHERE r.id=? AND r.module='Kanıtlar' AND r.data_json=? AND r.updated_at=? AND COALESCE(c.code,'')=? AND v.id=? AND v.version_no=? AND v.content_sha256=? AND NOT EXISTS(SELECT 1 FROM evidence_versions newer WHERE newer.evidence_id=r.id AND newer.version_no>v.version_no))
    AND (SELECT count(*) FROM evidence_versions WHERE id IN (${pinIds(table)}))=?
    AND NOT EXISTS(SELECT 1 FROM json_each(?) pin WHERE NOT EXISTS(SELECT 1 FROM evidence_versions v WHERE v.id=json_extract(pin.value,'$.id') AND v.evidence_id=json_extract(pin.value,'$.evidence_id') AND v.version_no=json_extract(pin.value,'$.version_no') AND v.content_sha256=json_extract(pin.value,'$.content_sha256')))
    AND NOT EXISTS(SELECT 1 FROM json_each(?) person WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(person.value,'$.id') AND lower(u.email)=json_extract(person.value,'$.email') AND u.role=json_extract(person.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(person.value,'$.policy')))
    AND NOT EXISTS(SELECT 1 FROM audit_milestones WHERE json_type(data_json,'$.evidenceChangeOrigin')='object' AND json_extract(data_json,'$.evidenceChangeOrigin.key')=?)`,
    values:[...personArgs(p),sourceId,s.source.audit_id,s.source.revision,s.source.data_json,s.source.audit_name,s.source.audit_id,s.source.closure,s.source.audit_id,s.source.workflow_state,s.source.audit_id,s.source.workflow_revision,s.source.audit_id,s.source.time_zone,evidenceId,s.anchor.data_json,s.anchor.updated_at,s.anchor.code||'',s.evidence.versionId,s.evidence.versionNo,s.evidence.contentSha256,sourceId,evidenceId,s.versions.length,JSON.stringify(s.versions),JSON.stringify(people.results),s.key]};
  // Reuse the milestone graph, account, capacity, closure and atomic history checks.
  await createMilestoneBatch(db,actor,{auditId:s.source.audit_id,items:[{id,fields:input.fields}]},now,{origin,guard});
  return {id,auditId:s.source.audit_id,reused:false};
}
