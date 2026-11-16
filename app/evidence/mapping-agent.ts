import { assessControl, templatesForSource, type ControlAssessment } from '../connectors/control-templates';
import { recordDataClassificationAllowed, type AiDataClassification } from '../ai/data-policy';
import { redactSensitiveText } from '../ai/security';
import { observedExecutionGuard } from './execution-guard';
import { creationHash, ruleInsert, type RuleInput } from './rule-write';

export type MappingSource = { id:string; name:string; vendor:string; category:string; driver:string; enabled:number; config_json:string; secret_ciphertext:string|null };
export type MappingControl = { id:string; ref:string; title:string; description:string; revision:string };
export type MappingAssessment = Omit<ControlAssessment,'issues'> & { name:string; definition:string; reasons:string[] };
export type MappingProposal = { templateId:string; controlId:string; rationale:string; missingEvidence:string };
export type MappingReport = { sourceId:string; collectedAt:string; payloadHash:string; assessments:MappingAssessment[]; controls:MappingControl[]; proposals:MappingProposal[]; summary:string; catalogTruncated:boolean };
export class MappingAgentError extends Error {
  constructor(public code:string, public status=409) { super(code); }
}
export async function mappingHash(value:unknown) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function sourceFingerprint(source:MappingSource) {
  return mappingHash(observedExecutionGuard('source',source,'s').values);
}
export function mappingAssessments(source:MappingSource,payload:unknown,lang:'tr'|'en',now=new Date()):MappingAssessment[] {
  const config=JSON.parse(source.config_json),templates=templatesForSource({driver:source.driver,config});
  if (!templates.length || !source.enabled) throw new MappingAgentError('MAPPING_SOURCE_UNSUPPORTED');
  return templates.map(template=>{
    const {issues,...assessment}=assessControl(template.id,template.version,config,payload,now);
    return {...assessment,name:template.name[lang],definition:template.description[lang],reasons:[...new Set(issues.map(item=>item.reason))]};
  });
}
export async function mappingControls(rows:{id:string;code?:string|null;data_json:string}[],maximum:AiDataClassification):Promise<MappingControl[]> {
  const controls:MappingControl[]=[];
  for(const row of rows){
    let data:Record<string,unknown>;try{data=JSON.parse(row.data_json);}catch{continue;}
    if(!data||typeof data!=='object'||Array.isArray(data)||!recordDataClassificationAllowed(data,maximum))continue;
    // Bind to one canonical record, not a framework clause shared by several controls.
    const ref=row.code||row.id;
    if(!ref||ref.length>160||/[;,|\n\r]/.test(ref))continue;
    controls.push({id:row.id,ref,title:redactSensitiveText(data.controlTitle||data.title||data.name||data.objective||ref,220),description:redactSensitiveText(data.description||data.objective||'',500),revision:await mappingHash(row.data_json)});
  }
  // Ambiguous references cannot safely resolve into the canonical control graph.
  return controls.filter(c=>controls.filter(other=>other.ref.toLocaleLowerCase('en-US')===c.ref.toLocaleLowerCase('en-US')).length===1);
}
export function parseMappingResponse(content:string,controls:MappingControl[],assessments:MappingAssessment[]) {
  let value;try{value=JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw new MappingAgentError('MAPPING_INVALID_RESPONSE',502);}
  if(!value||typeof value.summary!=='string'||!value.summary.trim()||!Array.isArray(value.proposals)||value.proposals.length>8)throw new MappingAgentError('MAPPING_INVALID_RESPONSE',502);
  const seen=new Set<string>();
  const proposals:MappingProposal[]=value.proposals.map((p:MappingProposal)=>{
    if(!p||typeof p.templateId!=='string'||typeof p.controlId!=='string'||!controls.some(c=>c.id===p.controlId)||!assessments.some(a=>a.templateId===p.templateId&&a.status!=='error')||typeof p.rationale!=='string'||!p.rationale.trim()||typeof p.missingEvidence!=='string'||!p.missingEvidence.trim())throw new MappingAgentError('MAPPING_INVALID_RESPONSE',502);
    const key=JSON.stringify([p.templateId,p.controlId]);if(seen.has(key))throw new MappingAgentError('MAPPING_INVALID_RESPONSE',502);seen.add(key);
    return {templateId:p.templateId,controlId:p.controlId,rationale:redactSensitiveText(p.rationale,900),missingEvidence:redactSensitiveText(p.missingEvidence,900)};
  });
  return {summary:redactSensitiveText(value.summary,1400),proposals};
}
export async function ensureMappingSchema(db:D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS evidence_mapping_runs(
    id TEXT PRIMARY KEY,source_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,status TEXT NOT NULL,
    report_json TEXT,provider TEXT,model TEXT,input_hash TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,
    approved_rule_id TEXT,approved_proposal INTEGER,approved_by TEXT,approved_at TEXT,approval_input_hash TEXT)`).run();
  const columns=await db.prepare('PRAGMA table_info(evidence_mapping_runs)').all<{name:string}>();
  if(!columns.results.some(c=>c.name==='approval_input_hash')){
    try{await db.prepare('ALTER TABLE evidence_mapping_runs ADD COLUMN approval_input_hash TEXT').run();}catch(error){
      const current=await db.prepare('PRAGMA table_info(evidence_mapping_runs)').all<{name:string}>();
      if(!current.results.some(c=>c.name==='approval_input_hash'))throw error;
    }
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS evidence_mapping_actor_time ON evidence_mapping_runs(created_by,created_at)').run();
}
export async function claimMappingRun(db:D1Database,source:MappingSource,actor:string,now=new Date()) {
  const id=crypto.randomUUID(),fingerprint=await sourceFingerprint(source);
  const result=await db.prepare(`INSERT INTO evidence_mapping_runs(id,source_id,source_fingerprint,status,created_by,created_at)
    SELECT ?,?,?,'running',?,? WHERE (SELECT COUNT(*) FROM evidence_mapping_runs WHERE created_by=? AND created_at>=?)<3`)
    .bind(id,source.id,fingerprint,actor.toLowerCase(),now.toISOString(),actor.toLowerCase(),new Date(now.getTime()-60000).toISOString()).run();
  if(!result.meta?.changes)throw new MappingAgentError('MAPPING_RATE_LIMIT',429);
  return {id,fingerprint};
}
type RunRow={id:string;source_id:string;source_fingerprint:string;status:string;report_json:string;approved_rule_id:string|null;approved_proposal:number|null;approval_input_hash:string|null};

/** Approval and rule creation share a transaction; no proposal can silently bind changed source/control data. */
export async function approveMapping(db:D1Database,runId:string,index:number,input:RuleInput,source:MappingSource) {
  const row=await db.prepare('SELECT * FROM evidence_mapping_runs WHERE id=?').bind(runId).first<RunRow>();
  if(!row||row.status!=='completed'||!Number.isInteger(index)||index<0)throw new MappingAgentError('MAPPING_NOT_AVAILABLE');
  const report=JSON.parse(row.report_json) as MappingReport,proposal=report.proposals[index],control=report.controls.find(c=>c.id===proposal?.controlId);
  const assessment=report.assessments.find(a=>a.templateId===proposal?.templateId);
  if(!proposal||!control||!assessment||assessment.status==='error'||assessment.templateVersion!==input.templateVersion||source.id!==row.source_id||input.sourceId!==source.id||input.templateId!==proposal.templateId||input.controlRefs!==control.ref)throw new MappingAgentError('MAPPING_CHANGED');
  const inputHash=await creationHash(input);
  const replay=async()=>{
    const saved=await db.prepare(`SELECT r.id,m.approval_input_hash FROM evidence_mapping_runs m JOIN evidence_automation_rules r ON r.id=m.approved_rule_id WHERE m.id=? AND m.approved_proposal=?`).bind(runId,index).first<{id:string;approval_input_hash:string|null}>();
    if(saved&&saved.approval_input_hash!==inputHash)throw new MappingAgentError('MAPPING_CHANGED');
    return saved?{ruleId:saved.id,reused:true}:null;
  };
  if(row.approved_rule_id){
    const existing=await db.prepare('SELECT id FROM evidence_automation_rules WHERE id=?').bind(row.approved_rule_id).first<{id:string}>();
    if(row.approved_proposal!==index||!existing)throw new MappingAgentError('MAPPING_ALREADY_USED');
    if(row.approval_input_hash!==inputHash)throw new MappingAgentError('MAPPING_CHANGED');
    return {ruleId:existing.id,reused:true};
  }
  const age=Date.parse(input.now)-Date.parse(report.collectedAt);
  if(!Number.isFinite(age)||age<0||age>30*60000||await sourceFingerprint(source)!==row.source_fingerprint)throw new MappingAgentError('MAPPING_STALE');
  const target=await db.prepare("SELECT data_json FROM simple_grc_records WHERE id=? AND module='Kontroller'").bind(control.id).first<{data_json:string}>();
  if(!target||await mappingHash(target.data_json)!==control.revision)throw new MappingAgentError('MAPPING_STALE');
  const s=observedExecutionGuard('source',source,'s');
  let result;
  try{result=await db.batch([
    ruleInsert(db,input,{sql:`EXISTS(SELECT 1 FROM evidence_automation_sources s WHERE ${s.sql}) AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Kontroller' AND data_json=?) AND EXISTS(SELECT 1 FROM evidence_mapping_runs WHERE id=? AND status='completed' AND approved_rule_id IS NULL AND report_json=?)`,values:[...s.values,control.id,target.data_json,runId,row.report_json]}),
    db.prepare(`UPDATE evidence_mapping_runs SET approved_rule_id=?,approved_proposal=?,approved_by=?,approved_at=?,approval_input_hash=? WHERE id=? AND approved_rule_id IS NULL AND changes()=1`).bind(input.id,index,input.actor,input.now,inputHash,runId),
  ]);}catch(error){
    if(!String(error).toLowerCase().includes('unique'))throw error;
    const saved=await replay();if(saved)return saved;
    throw new MappingAgentError('MAPPING_ALREADY_USED');
  }
  if(!result[0].meta?.changes){
    const saved=await replay();if(saved)return saved;
    throw new MappingAgentError('MAPPING_STALE');
  }
  return {ruleId:input.id,reused:false};
}
