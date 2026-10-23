import type { Actor } from './api/auth/security';
import { canReadModule, canWriteModule, isScoped, parseModuleAccess } from './module-access';
import { ensureAuditClosureSchema } from './audit-closure-schema';
import { auditRequestId } from './audit-request-store';
import { AuditRequestError } from './audit-requests';
import { publicWorkpaper } from './audit-workpaper-store';
import { auditReportHash } from './audit-status-report';
import { canonicalCoreReferenceValues, coreReferenceGuard } from './core-reference-write';
import { lifecycleInsert } from './enterprise-lifecycle-write';
import { workpaperCapaFinding, workpaperSampleKey, type WorkpaperCapaOrigin, type WorkpaperCapaLink } from './workpaper-capa';

type Person = { id: string; email: string; role: string; policy: string | null; name: string };
type Stored = Parameters<typeof publicWorkpaper>[0];
type LinkRow = { finding_id: string; source_revision: string; origin_json: string; actor: string; created_at: string; code: string | null; title: string | null; status: string | null; input_sha256: string };
const linkSelect = `SELECT l.*,f.code,f.title,f.status FROM audit_workpaper_capa_links l LEFT JOIN enterprise_findings f ON f.id=l.finding_id`;
const actorGuard = `EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)`;
const args = (p: Person) => [p.id,p.email,p.role,p.policy];
const eligible = (p: Person, write: boolean) => {
  const subject = {role:p.role,moduleAccess:parseModuleAccess(p.policy)};
  return ['Admin','Editor','Viewer'].includes(p.role) && !isScoped(subject) && canReadModule(subject,'Kanıtlar') && (write ? canWriteModule(subject,'Denetim Yönetimi') : canReadModule(subject,'Denetim Yönetimi'));
};
async function liveActor(db: D1Database, actor: Actor, write = false) {
  if (isScoped(actor) || !['Admin','Editor','Viewer'].includes(actor.role) || (write && !canWriteModule(actor,'Denetim Yönetimi'))) throw new AuditRequestError('forbidden',403);
  const p = await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,u.name,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.status='Active'`).bind(actor.id).first<Person>();
  if (!p || p.email!==actor.email.toLowerCase() || p.role!==actor.role || !eligible(p,write)) throw new AuditRequestError('forbidden',403);
  return p;
}
function link(row: LinkRow): WorkpaperCapaLink { return {findingId:row.finding_id,code:row.code||row.finding_id,title:row.title||'',status:row.status||'',missing:!row.code,sourceRevision:row.source_revision,origin:JSON.parse(row.origin_json),actor:row.actor,createdAt:row.created_at}; }

export async function readWorkpaperCapa(db: D1Database, actor: Actor, auditId: string, workpaperId: string) {
  auditRequestId(auditId); auditRequestId(workpaperId); await ensureAuditClosureSchema(db);
  const p = await liveActor(db,actor);
  const results = await db.batch([
    db.prepare(`SELECT p.*,a.name AS audit_name,COALESCE(c.state,'open') AS closure FROM audit_workpapers p JOIN simple_audits a ON a.id=p.audit_id LEFT JOIN audit_closure_state c ON c.audit_id=p.audit_id WHERE p.id=? AND p.audit_id=? AND ${actorGuard}`).bind(workpaperId,auditId,...args(p)),
    db.prepare(`${linkSelect} WHERE l.audit_id=? AND l.workpaper_id=? AND ${actorGuard} ORDER BY l.created_at,l.finding_id LIMIT 101`).bind(auditId,workpaperId,...args(p)),
    db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,u.name,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor') AND ${actorGuard} ORDER BY lower(u.email) LIMIT 1001`).bind(...args(p)),
    db.prepare(`SELECT 1 AS ok WHERE ${actorGuard}`).bind(...args(p)),
  ]);
  if (!results[3].results.length) throw new AuditRequestError('forbidden',403);
  const raw=results[0].results[0] as (Stored & {audit_name:string;closure:string})|undefined;
  if(!raw)throw new AuditRequestError('missing',404);
  const paper=publicWorkpaper(raw), canCreate=results[1].results.length<100&&eligible(p,true)&&raw.closure!=='closed'&&paper.status==='approved'&&(p.role==='Admin'||[paper.owner,paper.reviewer].includes(p.email));
  return {actorEmail:p.email,auditName:raw.audit_name,revision:paper.revision,canCreate,links:(results[1].results as unknown as LinkRow[]).slice(0,100).map(link),complete:results[1].results.length<=100,people:canCreate?(results[2].results as unknown as Person[]).slice(0,1000).filter(x=>eligible(x,true)).map(({email,name,role})=>({email,name,role})):[],peopleComplete:results[2].results.length<=1000};
}

export async function readWorkpaperCapaOrigin(db:D1Database,actor:Actor,findingId:string){
  auditRequestId(findingId);await ensureAuditClosureSchema(db);const p=await liveActor(db,actor);
  const result=await db.batch([
    db.prepare(`SELECT l.*,f.code,f.title,f.status,EXISTS(SELECT 1 FROM simple_audits a JOIN audit_workpapers p ON p.audit_id=a.id WHERE a.id=l.audit_id AND p.id=l.workpaper_id) AS source_available FROM audit_workpaper_capa_links l LEFT JOIN enterprise_findings f ON f.id=l.finding_id WHERE l.finding_id=? AND ${actorGuard}`).bind(findingId,...args(p)),
    db.prepare(`SELECT 1 AS ok WHERE ${actorGuard}`).bind(...args(p)),
  ]);
  if(!result[1].results.length)throw new AuditRequestError('forbidden',403);
  const row=result[0].results[0] as (LinkRow & {source_available:number})|undefined;
  return {link:row?link(row):null,sourceAvailable:!!row?.source_available};
}

export async function createWorkpaperCapa(db:D1Database,actor:Actor,input:Record<string,unknown>,now=new Date()){
  const auditId=auditRequestId(input.auditId),workpaperId=auditRequestId(input.workpaperId),findingId=auditRequestId(input.findingId);
  if(!/^FND-[a-f0-9-]{36}$/.test(findingId)||typeof input.expectedRevision!=='string'||input.expectedRevision.length>100||typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>200||typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>2000||Object.keys(input).some(k=>!['auditId','workpaperId','findingId','expectedRevision','reference','reason','fields'].includes(k)))throw new AuditRequestError('fields');
  await ensureAuditClosureSchema(db);const p=await liveActor(db,actor,true);
  const raw=await db.prepare('SELECT p.*,a.name AS audit_name FROM audit_workpapers p JOIN simple_audits a ON a.id=p.audit_id WHERE p.id=? AND p.audit_id=?').bind(workpaperId,auditId).first<Stored & {audit_name:string}>();
  if(!raw)throw new AuditRequestError('missing',404);
  const paper=publicWorkpaper(raw);
  if(paper.revision!==input.expectedRevision)throw new AuditRequestError('conflict',409);
  if(paper.status!=='approved')throw new AuditRequestError('approved-required',409);
  if(p.role!=='Admin'&&![paper.owner,paper.reviewer].includes(p.email))throw new AuditRequestError('owner',403);
  const sample=paper.samples.find(s=>s.reference===input.reference),evidence=paper.evidence.find(e=>e.id===sample?.versionId);
  if(!sample||sample.result!=='exception'||!evidence)throw new AuditRequestError('exception-required',409);
  const origin:WorkpaperCapaOrigin={auditId,auditName:raw.audit_name,workpaperId,workpaperTitle:paper.title,revision:paper.revision,owner:paper.owner,reviewer:paper.reviewer,sample,evidence,reason:input.reason.trim()};
  const finding=workpaperCapaFinding(input.fields,origin,now.toISOString().slice(0,10)),key=workpaperSampleKey(sample.reference);
  if(finding.reviewer===p.email)throw new AuditRequestError('independent-review',403);
  const fingerprint=await auditReportHash({origin,finding,actor:p.email});
  const prior=await db.prepare(`${linkSelect} WHERE (l.finding_id=? OR (l.workpaper_id=? AND l.sample_key=?)) AND ${actorGuard}`).bind(findingId,workpaperId,key,...args(p)).first<LinkRow>();
  if(prior){if(prior.finding_id!==findingId||prior.input_sha256!==fingerprint||!prior.code)throw new AuditRequestError('already-linked',409);return{id:findingId,code:prior.code,reused:true};}
  const emails=[...new Set([p.email,finding.owner,finding.reviewer])];
  const people=await db.prepare(`SELECT u.id,lower(u.email) AS email,u.role,u.name,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND lower(u.email) IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(emails)).all<Person>();
  if(people.results.length!==emails.length||people.results.some(person=>!eligible(person,true))||!people.results.some(person=>person.email===finding.reviewer&&person.role==='Admin'))throw new AuditRequestError('assignee',403);
  const references=coreReferenceGuard([{field:'risk_ref',value:finding.riskRef,modules:['Risk Assessment']},{field:'control_ref',value:finding.controlRef,modules:['Kontroller','Uyum']}].flatMap(({field,value,modules})=>canonicalCoreReferenceValues(value).map(value=>({sourceId:findingId,field,value,modules}))));
  const stamp=now.toISOString(),code=`FND-${now.getUTCFullYear()}-${crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()}`;
  const results=await db.batch([
    db.prepare(`INSERT INTO enterprise_findings(id,code,source_type,source_ref,source_title,finding_type,title,description,severity,owner,reviewer,root_cause,corrective_action,preventive_action,due_date,status,risk_ref,control_ref,detected_by,detected_at,updated_by,updated_at)
      SELECT ?,?,'audit',?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,? WHERE ${actorGuard}
      AND EXISTS(SELECT 1 FROM audit_workpapers p JOIN simple_audits a ON a.id=p.audit_id WHERE p.id=? AND p.audit_id=? AND p.revision=? AND p.data_json=? AND a.name=?)
      AND NOT EXISTS(SELECT 1 FROM audit_closure_state WHERE audit_id=? AND state='closed')
      AND NOT EXISTS(SELECT 1 FROM audit_workpaper_capa_links WHERE workpaper_id=? AND sample_key=?)
      AND (SELECT count(*) FROM audit_workpaper_capa_links WHERE workpaper_id=?)<100
      AND NOT EXISTS(SELECT 1 FROM json_each(?) person WHERE NOT EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(person.value,'$.id') AND lower(u.email)=json_extract(person.value,'$.email') AND u.role=json_extract(person.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(person.value,'$.policy')))
      AND EXISTS(SELECT 1 FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' WHERE v.id=? AND v.evidence_id=? AND v.content_sha256=? AND v.file_key=? AND v.file_name=? AND v.version_no=? AND v.evidence_title=? AND v.period IS ?)
      AND ${references.sql}`).bind(findingId,code,finding.sourceRef,finding.sourceTitle,finding.findingType,finding.title,finding.description,finding.severity,finding.owner,finding.reviewer,finding.rootCause,finding.correctiveAction,finding.preventiveAction,finding.dueDate,finding.riskRef||null,finding.controlRef||null,p.email,stamp,p.email,stamp,...args(p),workpaperId,auditId,paper.revision,raw.data_json,raw.audit_name,auditId,workpaperId,key,workpaperId,JSON.stringify(people.results),evidence.id,evidence.evidenceId,evidence.contentSha256,evidence.fileKey,evidence.fileName,evidence.versionNo,evidence.title,evidence.period,...references.values),
    lifecycleInsert(db,'audit_workpaper_capa_links',{finding_id:findingId,audit_id:auditId,workpaper_id:workpaperId,sample_key:key,source_revision:paper.revision,input_sha256:fingerprint,origin_json:JSON.stringify(origin),actor:p.email,created_at:stamp}),
    lifecycleInsert(db,'enterprise_finding_events',{id:crypto.randomUUID(),finding_id:findingId,action:'workpaper-exception-promotion',from_status:null,to_status:'open',detail:`${auditId} / ${workpaperId} / ${sample.reference}; ${origin.reason}`,evidence_reference:evidence.id,evidence_sha256:evidence.contentSha256,actor:p.email,created_at:stamp}),
  ]);
  if(Number(results[2]?.meta?.changes||0)!==1)throw new AuditRequestError('conflict',409);
  return{id:findingId,code,reused:false};
}
