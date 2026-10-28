import type {Actor} from './api/auth/security';
import {parseModuleAccess} from './module-access';
import {completedInitialization} from './completed-initialization';
import {ensureCoreGrcSchemaCompatibility} from './api/grc/schema-compat';
import {ensureEvidenceHistorySchema, publicEvidenceVersion, sha256HexBytes, verifyEvidenceVersionChainWithAnchor, type EvidenceVersionRow} from './evidence/versioning';
import {lifecycleInsert} from './enterprise-lifecycle-write';
import type {WorkflowEvidence, WorkflowEvidencePin, WorkflowGuard} from './workflow-selection';

export class WorkflowSelectionError extends Error {
  constructor(public code: 'EVIDENCE_SELECTION'|'EVIDENCE_INTEGRITY'|'ASSIGNEE_SELECTION'|'SELECTION_ACCESS', public status = 422) {
    super(({EVIDENCE_SELECTION:'Kanıt ve sürüm seçimini kontrol edin. Kayıt silinmiş veya değişmiş olabilir.',EVIDENCE_INTEGRITY:'Kanıt dosyası veya sürüm zinciri doğrulanamadı. Kanıt kütüphanesindeki kaydı kontrol edin.',ASSIGNEE_SELECTION:'Atanan kişi etkin ve bu modülde yetkili olmalıdır. Bağımsız inceleyen için Admin seçin.',SELECTION_ACCESS:'Bu işlem için etkin ve tam erişimli bir yazma hesabı gerekli.'})[code]);
  }
}
export const workflowEvidenceSchema = [
  `CREATE TABLE IF NOT EXISTS workflow_evidence_pins(id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,workflow TEXT NOT NULL,entity_id TEXT NOT NULL,purpose TEXT NOT NULL,snapshot_json TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS workflow_evidence_pins_entity_idx ON workflow_evidence_pins(workflow,entity_id,purpose,created_at,id)`,
  `CREATE TRIGGER IF NOT EXISTS workflow_evidence_pin_immutable BEFORE UPDATE ON workflow_evidence_pins BEGIN SELECT RAISE(ABORT,'immutable-workflow-evidence'); END`,
];
const initialize = completedInitialization();
export async function ensureWorkflowEvidenceSchema(db:D1Database) {
  await initialize(db, async()=>{ for(const sql of workflowEvidenceSchema) await db.prepare(sql).run(); });
}
export function joinWorkflowGuards(...guards:(WorkflowGuard|undefined)[]):WorkflowGuard {
  const actual=guards.filter((g):g is WorkflowGuard=>Boolean(g));
  return {sql:actual.length?actual.map(g=>`(${g.sql})`).join(' AND '):'1',values:actual.flatMap(g=>g.values)};
}
type PersonRow={id:string;name:string;email:string;role:string;policy_json:string|null};
const personSelect=`SELECT u.id,u.name,u.email,u.role,a.policy_json FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.status='Active' AND u.role IN ('Admin','Editor')`;
function eligible(row:PersonRow) {return row.role==='Admin'||parseModuleAccess(row.policy_json).mode==='full';}
function peopleGuard(rows:PersonRow[]):WorkflowGuard {
  return {sql:`NOT EXISTS (SELECT 1 FROM json_each(?) s WHERE NOT EXISTS (SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=json_extract(s.value,'$.id') AND u.email=json_extract(s.value,'$.email') AND u.role=json_extract(s.value,'$.role') AND u.status='Active' AND a.policy_json IS json_extract(s.value,'$.policy_json')))`,values:[JSON.stringify(rows)]};
}
export async function workflowPeople(db:D1Database,q:string,reviewer:boolean) {
  const rows=await db.prepare(personSelect+` AND (?=0 OR u.role='Admin') AND (?='' OR instr(lower(u.name||' '||u.email),lower(?))>0) ORDER BY u.name,u.id LIMIT 1001`).bind(reviewer?1:0,q,q).all<PersonRow>();
  return {people:rows.results.filter(eligible).slice(0,1000).map(({id,name,email,role})=>({id,name,email,role})),complete:rows.results.length<=1000};
}
export async function workflowEvidenceChoices(db:D1Database,q:string,page:number,evidenceId:string) {
  await ensureCoreGrcSchemaCompatibility(db); await ensureEvidenceHistorySchema(db);
  if(evidenceId) {
    const rows=await db.prepare(`SELECT v.* FROM evidence_versions v JOIN simple_grc_records r ON r.id=v.evidence_id AND r.module='Kanıtlar' WHERE r.id=? ORDER BY v.version_no DESC LIMIT 1001`).bind(evidenceId).all<EvidenceVersionRow>();
    if(rows.results.length>1000) throw new WorkflowSelectionError('EVIDENCE_SELECTION');
    return {versions:rows.results.map(publicEvidenceVersion)};
  }
  const rows=await db.prepare(`SELECT r.id,r.data_json,v.evidence_title,v.version_no FROM simple_grc_records r JOIN evidence_versions v ON v.evidence_id=r.id AND v.version_no=(SELECT MAX(v2.version_no) FROM evidence_versions v2 WHERE v2.evidence_id=r.id) WHERE r.module='Kanıtlar' AND (?='' OR instr(lower(r.id||' '||v.evidence_title||' '||v.period||' '||v.file_name),lower(?))>0) ORDER BY r.updated_at DESC,r.id LIMIT 51 OFFSET ?`).bind(q,q,page*50).all<{id:string;data_json:string;evidence_title:string;version_no:number}>();
  return {records:rows.results.slice(0,50).map(r=>{let data:Record<string,unknown>={};try{data=JSON.parse(r.data_json)}catch{}return{id:r.id,title:r.evidence_title,status:String(data.status||''),latestVersion:r.version_no}}),hasMore:rows.results.length>50};
}
type SelectionEnv={DB:D1Database;BUCKET?:R2Bucket};
type Prepared={body:Record<string,unknown>;guard:WorkflowGuard;evidence?:WorkflowEvidence};
/** Only opted-in directory/library writes change the legacy API contract. Never grant a canonical pin to free-text evidence. */
export async function prepareWorkflowSelection(env:SelectionEnv,actor:Actor,input:Record<string,unknown>,assignments:Record<string,'writer'|'reviewer'>={},evidenceAllowed=false,reviewerExclusions:string[]=[actor.email]):Promise<Prepared> {
  const body={...input},directory=input.assignmentMode!==undefined,library=input.evidenceMode!==undefined||input.evidenceSelection!==undefined;
  if(directory&&input.assignmentMode!=='directory') throw new WorkflowSelectionError('ASSIGNEE_SELECTION');
  if(library&&(!evidenceAllowed||input.evidenceMode!=='library')) throw new WorkflowSelectionError('EVIDENCE_SELECTION');
  if(!directory&&!library) return {body,guard:joinWorkflowGuards()};
  const live=await env.DB.prepare(personSelect+' AND u.id=? AND lower(u.email)=?').bind(actor.id||'',actor.email.toLowerCase()).first<PersonRow>();
  if(!live||!eligible(live)||live.role!==actor.role) throw new WorkflowSelectionError('SELECTION_ACCESS',403);
  const people=[live];
  if(directory) {
    if(!Object.keys(assignments).length) throw new WorkflowSelectionError('ASSIGNEE_SELECTION');
    for(const [key,role] of Object.entries(assignments)) {
      const email=typeof body[key]==='string'?body[key].trim().toLowerCase():'';
      const person=await env.DB.prepare(personSelect+' AND lower(u.email)=?').bind(email).first<PersonRow>();
      if(!person||!eligible(person)||(role==='reviewer'&&(person.role!=='Admin'||reviewerExclusions.some(email=>person.email.toLowerCase()===email.toLowerCase())))) throw new WorkflowSelectionError('ASSIGNEE_SELECTION');
      body[key]=person.email;people.push(person);
    }
  }
  const guard=peopleGuard(people);
  if(!library) return {body,guard};
  const selection=input.evidenceSelection as Record<string,unknown>|null;
  if(!selection||typeof selection!=='object'||Array.isArray(selection)||typeof selection.evidenceId!=='string'||typeof selection.versionId!=='string'||!/^EVD-[a-zA-Z0-9_-]{1,100}$/.test(selection.evidenceId)||!/^EVV-[a-zA-Z0-9_-]{1,100}$/.test(selection.versionId)) throw new WorkflowSelectionError('EVIDENCE_SELECTION');
  await ensureCoreGrcSchemaCompatibility(env.DB);await ensureEvidenceHistorySchema(env.DB);await ensureWorkflowEvidenceSchema(env.DB);
  const record=await env.DB.prepare(`SELECT data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Kanıtlar'`).bind(selection.evidenceId).first<{data_json:string;updated_at:string}>();
  const rows=await env.DB.prepare('SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no LIMIT 1001').bind(selection.evidenceId).all<EvidenceVersionRow>();
  const selected=rows.results.find(v=>v.id===selection.versionId);
  if(!record||!selected||rows.results.length>1000) throw new WorkflowSelectionError('EVIDENCE_SELECTION');
  let anchor:Record<string,unknown>;try{anchor=JSON.parse(record.data_json)}catch{throw new WorkflowSelectionError('EVIDENCE_INTEGRITY')}
  const integrity=await verifyEvidenceVersionChainWithAnchor(rows.results,{versionNo:anchor.versionNo,chainSha256:anchor.versionChainSha256});
  if(integrity.state!=='verified'||!selected.file_key.startsWith(`evidence/${selection.evidenceId}/`)||selected.file_key.includes('..')||selected.file_size<1||selected.file_size>10*1024*1024) throw new WorkflowSelectionError('EVIDENCE_INTEGRITY');
  let bytes:Uint8Array|undefined,sqlFile=false;
  if(env.BUCKET) {
    const object=await env.BUCKET.get(selected.file_key);
    if(object) {
      const reader=object.body.getReader(),chunks:Uint8Array[]=[];let length=0;
      try {for(;;){const {done,value}=await reader.read();if(done)break;const chunk=new Uint8Array(value);length+=chunk.byteLength;if(length>selected.file_size){await reader.cancel();throw new WorkflowSelectionError('EVIDENCE_INTEGRITY')}chunks.push(chunk);}}
      finally {reader.releaseLock();}
      bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    }
  }
  if(!bytes) {const file=await env.DB.prepare('SELECT content FROM simple_evidence_files WHERE file_key=?').bind(selected.file_key).first<{content:ArrayBuffer|Uint8Array}>();if(file){bytes=new Uint8Array(file.content);sqlFile=true;}}
  if(!bytes||bytes.byteLength!==selected.file_size||await sha256HexBytes(bytes)!==selected.content_sha256) throw new WorkflowSelectionError('EVIDENCE_INTEGRITY');
  // Freeze every chain row and its anchor at the committing SQL statement, not merely at lookup time.
  const keys=Object.keys(selected);if(keys.some(k=>!/^[a-z_][a-z0-9_]*$/.test(k)))throw new WorkflowSelectionError('EVIDENCE_INTEGRITY');
  const evidenceGuard:WorkflowGuard={sql:`EXISTS (SELECT 1 FROM simple_grc_records r WHERE r.id=? AND r.module='Kanıtlar' AND r.data_json=? AND r.updated_at=?) AND (SELECT COUNT(*) FROM evidence_versions WHERE evidence_id=?)=? AND NOT EXISTS (SELECT 1 FROM json_each(?) s WHERE NOT EXISTS (SELECT 1 FROM evidence_versions v WHERE ${keys.map(k=>`v.${k} IS json_extract(s.value,'$.${k}')`).join(' AND ')}))`,values:[selection.evidenceId,record.data_json,record.updated_at,selection.evidenceId,rows.results.length,JSON.stringify(rows.results)]};
  // SQL-backed file bytes can also participate in the same atomic claim. Object storage is verified immediately before it.
  const fileGuard=!sqlFile?undefined:{sql:'EXISTS (SELECT 1 FROM simple_evidence_files WHERE file_key=? AND content=?)',values:[selected.file_key,bytes]};
  body.evidenceReference=selected.evidence_id;body.evidenceSha256=selected.content_sha256;
  return {body,guard:joinWorkflowGuards(guard,evidenceGuard,fileGuard),evidence:publicEvidenceVersion(selected)};
}
export function workflowPinStatement(db:D1Database,selection:Prepared,workflow:'continuity'|'regulatory'|'tprm'|'policy'|'findings',entityId:string,purpose:string,eventId:string,actor:string) {
  return selection.evidence?[lifecycleInsert(db,'workflow_evidence_pins',{id:crypto.randomUUID(),event_id:eventId,workflow,entity_id:entityId,purpose,snapshot_json:JSON.stringify(selection.evidence),actor,created_at:new Date().toISOString()})]:[];
}
export async function readWorkflowEvidencePins(db:D1Database,workflow:'continuity'|'regulatory'|'tprm'|'policy'|'findings',entityIds:string[],limit=6000):Promise<WorkflowEvidencePin[]> {
  await ensureWorkflowEvidenceSchema(db);
  const rows=await db.prepare(`SELECT p.* FROM workflow_evidence_pins p WHERE p.workflow=? AND p.entity_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM workflow_evidence_pins n WHERE n.workflow=p.workflow AND n.entity_id=p.entity_id AND n.purpose=p.purpose AND (n.created_at>p.created_at OR (n.created_at=p.created_at AND n.id>p.id))) ORDER BY p.created_at DESC LIMIT ?`).bind(workflow,JSON.stringify(entityIds),limit).all<{id:string;event_id:string;entity_id:string;purpose:string;snapshot_json:string;actor:string;created_at:string}>();
  return rows.results.map(r=>({id:r.id,eventId:r.event_id,entityId:r.entity_id,purpose:r.purpose,evidence:JSON.parse(r.snapshot_json),actor:r.actor,createdAt:r.created_at}));
}
