import type {Actor} from '../api/auth/security';
import {canReadModule,canWriteModule,parseModuleAccess} from '../module-access';
import {authority,authorityGuard,currentActor} from '../enterprise/access';
import {ensureEnterprise} from '../enterprise/schema';
import {event} from '../enterprise/http';
import {evidenceReviewerIsIndependent} from '../evidence/intake';
import {evaluateEvidenceEligibility} from '../evidence/eligibility';
import {approvedAuditEvidence} from '../audit-engagement';
import {ensureEvidenceHistorySchema,verifyEvidenceVersionChainWithAnchor,type EvidenceVersionRow} from '../evidence/versioning';
import {catalogFor,ISO} from './catalog';
import {PostureError} from './store';
import type {DirectDocument,Implementation,Requirement} from './types';

type Row=Record<string,string|number|null>;
type Work={program:string;ref:string;implementation:Implementation;evidence_ids:string;policy_ids:string;revision:string;actor:string;contributors:string;org_entity_id:string};
type Source=DirectDocument & {snapshot:string;owners:string[]};
const lower=(v:unknown)=>String(v??'').trim().toLowerCase();
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const tableExists=async(db:D1Database,name:string)=>!!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
// Aggregate snapshots per table to stay within D1's bind limit even for large selections.
function documentsGuard(documents:Source[]){
 const groups:Record<string,Row[]>={simple_grc_records:[],policy_documents:[],policy_versions:[]};
 for(const d of documents){const snapshot=JSON.parse(d.snapshot);if(d.kind==='evidence')groups.simple_grc_records.push(snapshot.record);else{groups.policy_documents.push(snapshot.record);if(snapshot.version)groups.policy_versions.push(snapshot.version);}}
 const clauses:string[]=[],values:string[]=[];
 for(const [table,rows] of Object.entries(groups))if(rows.length){
  const keys=Object.keys(rows[0]);if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k)))throw new PostureError('source');
  clauses.push(`NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM ${table} t WHERE ${keys.map(k=>`t.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')}))`);values.push(JSON.stringify(rows));
 }
 const heads=documents.filter(d=>d.kind==='evidence').map(d=>[d.id,d.version]);
 if(heads.length){clauses.push("NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE coalesce((SELECT id FROM evidence_versions WHERE evidence_id=json_extract(s.value,'$[0]') ORDER BY version_no DESC LIMIT 1),'')<>json_extract(s.value,'$[1]'))");values.push(JSON.stringify(heads));}
 return {sql:clauses.length?clauses.join(' AND '):'1',values};
}
const publicSource=({id,kind,code,title,eligible,version,pin}:Source):DirectDocument=>({id,kind,code,title,eligible,version,...(pin?{pin}:{})});

// The selector and live posture use exactly the same current-source eligibility checks.
async function sources(db:D1Database,evidenceIds:string[]|null,policyIds:string[]|null,scopeIds?:string[]|null):Promise<Source[]>{
 const output:Source[]=[];
 const scope=(kind:string,id:string)=>scopeIds?` AND coalesce((SELECT org_entity_id FROM org_record_entities WHERE kind='${kind}' AND record_id=${id}),'root') IN(SELECT value FROM json_each(?))`:'';
 const scoped=scopeIds?[JSON.stringify(scopeIds)]:[];
 if(evidenceIds===null||evidenceIds.length){
  await ensureEvidenceHistorySchema(db);
  const records=(await db.prepare(`SELECT r.* FROM simple_grc_records r WHERE r.module='Kanıtlar' ${evidenceIds?'AND r.id IN(SELECT value FROM json_each(?))':''}${scope('evidence','r.id')} ORDER BY r.id`).bind(...(evidenceIds?[JSON.stringify(evidenceIds)]:[]),...scoped).all<Row>()).results;
  const versions=(await db.prepare('SELECT * FROM evidence_versions WHERE evidence_id IN(SELECT value FROM json_each(?)) ORDER BY evidence_id,version_no').bind(JSON.stringify(records.map(r=>r.id))).all<EvidenceVersionRow>()).results;
  const codes=(await db.prepare('SELECT record_id,code FROM simple_grc_record_codes WHERE record_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(records.map(r=>r.id))).all<{record_id:string;code:string}>()).results;
  for(const record of records){
   const data=JSON.parse(String(record.data_json)),chain=versions.filter(v=>v.evidence_id===record.id),v=chain.at(-1),code=codes.find(c=>c.record_id===record.id)?.code||'';
   const eligible=!!v&&data.reviewStatus==='approved'&&data.reviewedVersion===v.id&&typeof data.reviewedBy==='string'&&evidenceReviewerIsIndependent(data,{email:data.reviewedBy},[chain[0].created_by,v.created_by])&&evaluateEvidenceEligibility(data).current&&approvedAuditEvidence(data.status)&&v.content_sha256===data.contentSha256&&v.period===String(data.period||'').trim()&&!!v.period&&(await verifyEvidenceVersionChainWithAnchor(chain,{versionNo:data.versionNo,chainSha256:data.versionChainSha256})).state==='verified';
   output.push({id:String(record.id),kind:'evidence',code,title:String(data.evidenceTitle||data.title||code),eligible,version:v?.id||'',snapshot:JSON.stringify({record,chain}),owners:[data.owner,data.ownerEmail,data.uploadedBy,data.versionUploadedBy,chain[0]?.created_by,v?.created_by].map(lower).filter(Boolean),
    ...(eligible&&v?{pin:{id:v.id,evidenceId:String(record.id),fileKey:v.file_key,title:v.evidence_title,code,version:v.version_no,hash:v.content_sha256,period:v.period,collectedAt:String(data.collectedAt||'')}}:{})});
  }
 }
 if((policyIds===null||policyIds.length)&&await tableExists(db,'policy_documents')){
  const records=(await db.prepare(`SELECT p.* FROM policy_documents p WHERE 1=1 ${policyIds?'AND p.id IN(SELECT value FROM json_each(?))':''}${scope('policy','p.id')} ORDER BY p.id`).bind(...(policyIds?[JSON.stringify(policyIds)]:[]),...scoped).all<Row>()).results;
  const versions=(await db.prepare('SELECT * FROM policy_versions WHERE id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(records.map(p=>p.current_version_id))).all<Row>()).results;
  const codes=(await db.prepare('SELECT record_id,code FROM simple_grc_record_codes WHERE record_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(records.map(p=>p.id))).all<{record_id:string;code:string}>()).results;
  const today=new Date().toISOString().slice(0,10);
  for(const record of records){
   const v=versions.find(v=>v.id===record.current_version_id&&v.policy_id===record.id),owners=[record.owner,record.created_by,v?.created_by,v?.submitted_by].map(lower).filter(Boolean);
   const eligible=!!v&&record.status==='published'&&v.status==='published'&&!!v.approved_by&&!!v.published_by&&!owners.includes(lower(v.approved_by))&&String(v.effective_date)<=today&&(!record.next_review||String(record.next_review)>=today)&&await digest(String(v.content))===v.content_sha256;
   output.push({id:String(record.id),kind:'policy',code:codes.find(c=>c.record_id===record.id)?.code||String(record.code),title:String(record.title),eligible,version:String(v?.id||''),snapshot:JSON.stringify({record,version:v}),owners});
  }
 }
 return output;
}
export async function directDocumentCatalog(db:D1Database,allowPolicies:boolean,scopeIds?:string[]|null){
 return {documents:(await sources(db,null,allowPolicies?null:[],scopeIds)).map(publicSource)};
}
const fingerprint=(work:Work,documents:Source[])=>digest(JSON.stringify({implementation:work.implementation,evidence:JSON.parse(work.evidence_ids),policies:JSON.parse(work.policy_ids),sources:documents.map(d=>[d.kind,d.id,d.eligible,d.snapshot])}));

export async function attachDirectWork(db:D1Database,programs:{name:string;requirements:Requirement[]}[],scopeIds?:string[]|null,allowPolicies=true){
 const works=(await db.prepare(`SELECT * FROM framework_requirement_work WHERE program IN(SELECT value FROM json_each(?)) ${scopeIds?'AND org_entity_id IN(SELECT value FROM json_each(?))':''}`).bind(JSON.stringify(programs.map(p=>p.name)),...(scopeIds?[JSON.stringify(scopeIds)]:[])).all<Work>()).results;
 if(!works.length)return;
 const documents=await sources(db,[...new Set(works.flatMap(w=>JSON.parse(w.evidence_ids)))],[...new Set(allowPolicies?works.flatMap(w=>JSON.parse(w.policy_ids)):[])],scopeIds);
 const reviews=(await db.prepare(`SELECT r.*,u.role,a.policy_json FROM framework_requirement_reviews r JOIN local_users u ON lower(u.email)=lower(r.reviewer) AND u.status='Active' AND u.role IN ('Admin','Editor') LEFT JOIN user_module_access a ON a.user_id=u.id WHERE r.program IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(programs.map(p=>p.name))).all<{program:string;ref:string;work_revision:string;source_fingerprint:string;reviewer:string;role:Actor['role'];policy_json:string|null}>()).results;
 for(const program of programs)for(const requirement of program.requirements){
  const work=works.find(w=>w.program===program.name&&w.ref===requirement.ref);if(!work)continue;
  const evidence:string[]=JSON.parse(work.evidence_ids),policies:string[]=JSON.parse(work.policy_ids);
  const linked=documents.filter(d=>(d.kind==='evidence'?evidence:policies).includes(d.id));
  const complete=linked.length===evidence.length+policies.length;
  const hash=await fingerprint(work,linked);
  const receipt=complete&&linked.some(d=>d.eligible)?reviews.find(r=>r.program===work.program&&r.ref===work.ref&&r.work_revision===work.revision&&r.source_fingerprint===hash&&canWriteModule({role:r.role,moduleAccess:parseModuleAccess(r.policy_json)},'Uyum')):undefined;
  requirement.direct={implementation:work.implementation,revision:work.revision,actor:work.actor,evidenceIds:linked.filter(d=>d.kind==='evidence').map(d=>d.id),policyIds:linked.filter(d=>d.kind==='policy').map(d=>d.id),sources:linked.map(publicSource),verified:!!receipt,...(receipt?{verifiedBy:receipt.reviewer}:{})};
 }
}

function ids(value:unknown){
 if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=='string'||!id.trim()||id.length>160)||new Set(value).size!==value.length)throw new PostureError('fields');
 return value as string[];
}
async function permitted(db:D1Database,actor:Actor,recordIds:string[]){
 await ensureEnterprise(db);
 const auth=await authority(db,actor,recordIds),live=await currentActor(db,actor);
 if(live.orgScope?.restricted||!['Admin','Editor'].includes(live.role)||!canWriteModule(live,'Uyum')||!canReadModule(live,'Kanıtlar'))throw new PostureError('forbidden',403);
 return {live,guard:authorityGuard(live,auth)};
}
export async function saveDirectWork(db:D1Database,actor:Actor,body:Record<string,unknown>){
 const {name,ref,revision,implementation}=body,evidence=ids(body.evidenceIds),policies=ids(body.policyIds);
 if(typeof name!=='string'||typeof ref!=='string'||!catalogFor(name).some(r=>r.ref===ref)||typeof revision!=='string'||!['open','planned','partial','implemented'].includes(String(implementation)))throw new PostureError('fields');
 const {live,guard}=await permitted(db,actor,[...evidence,...policies]);
 if(policies.length&&!canReadModule(live,'Politika Merkezi'))throw new PostureError('forbidden',403);
 const documents=await sources(db,evidence,policies);
 if(documents.length!==evidence.length+policies.length)throw new PostureError('source',409);
 const docGuard=documentsGuard(documents);
 const next=crypto.randomUUID(),stamp=new Date().toISOString();
 const result=await db.batch([
  db.prepare(`INSERT INTO framework_requirement_work(program,ref,implementation,evidence_ids,policy_ids,revision,actor,contributors,updated_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard.sql} AND ${docGuard.sql}
   AND EXISTS(SELECT 1 FROM framework_programs WHERE name=?) AND coalesce((SELECT revision FROM framework_requirement_work WHERE program=? AND ref=?),'')=?
   ON CONFLICT(program,ref) DO UPDATE SET implementation=excluded.implementation,evidence_ids=excluded.evidence_ids,policy_ids=excluded.policy_ids,revision=excluded.revision,updated_at=excluded.updated_at,contributors=(SELECT json_group_array(value) FROM (SELECT value FROM json_each(framework_requirement_work.contributors) UNION SELECT excluded.actor))`)
   .bind(name,ref,implementation,JSON.stringify(evidence),JSON.stringify(policies),next,live.email,JSON.stringify([live.email]),stamp,...guard.values,...docGuard.values,name,name,ref,revision),
  event(db,live.email,'requirement-implementation-saved',JSON.stringify({name,ref,implementation,evidence:documents.filter(d=>d.kind==='evidence').map(d=>d.code),policies:documents.filter(d=>d.kind==='policy').map(d=>d.code),revision:next}),'changes()=1')
 ]);
 if(!result[0].meta?.changes)throw new PostureError('conflict',409);
 return {revision:next};
}
export async function verifyDirectWork(db:D1Database,actor:Actor,body:Record<string,unknown>){
 const {name,ref,revision,note}=body;
 if(typeof name!=='string'||typeof ref!=='string'||typeof revision!=='string'||typeof note!=='string'||note.trim().length<10||note.length>2000)throw new PostureError('fields');
 const work=await db.prepare('SELECT * FROM framework_requirement_work WHERE program=? AND ref=?').bind(name,ref).first<Work>();
 if(!work||work.revision!==revision||work.implementation!=='implemented')throw new PostureError('conflict',409);
 const evidence:string[]=JSON.parse(work.evidence_ids),policies:string[]=JSON.parse(work.policy_ids);
 const {live,guard}=await permitted(db,actor,[...evidence,...policies]);
 if(policies.length&&!canReadModule(live,'Politika Merkezi'))throw new PostureError('forbidden',403);
 const documents=await sources(db,evidence,policies);
 if(documents.length!==evidence.length+policies.length||!documents.some(d=>d.eligible))throw new PostureError('verification-evidence',409);
 if([...JSON.parse(work.contributors),...documents.flatMap(d=>d.owners)].map(lower).some(v=>v===lower(live.email)||v===lower(live.name)))throw new PostureError('independent-reviewer',403);
 const applicable=await db.prepare('SELECT applicability FROM framework_decisions WHERE program=? AND ref=?').bind(name,ref).first<{applicability:string}>();
 if(applicable?.applicability==='excluded'&&!(name===ISO&&!catalogFor(name).find(r=>r.ref===ref)?.annex))throw new PostureError('excluded',409);
 const hash=await fingerprint(work,documents),docGuard=documentsGuard(documents),id=crypto.randomUUID();
 const result=await db.batch([
  db.prepare(`INSERT INTO framework_requirement_reviews SELECT ?,?,?,?,?,?,?,? WHERE ${guard.sql} AND ${docGuard.sql}
   AND EXISTS(SELECT 1 FROM framework_requirement_work WHERE program=? AND ref=? AND revision=?)`)
   .bind(id,name,ref,revision,hash,live.email,note.trim(),new Date().toISOString(),...guard.values,...docGuard.values,name,ref,revision),
  event(db,live.email,'requirement-independently-verified',JSON.stringify({name,ref,revision,sources:documents.map(d=>d.code)}),'changes()=1')
 ]);
 if(!result[0].meta?.changes)throw new PostureError('conflict',409);
 return {id};
}
