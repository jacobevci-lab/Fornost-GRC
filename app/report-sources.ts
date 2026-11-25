import type { ReportRecord } from './report-export';

// Read-only projections: no documents, secrets, storage keys or mutations.
export const WORKFLOW_REPORT_MODULES = ['AI Yönetişimi','Politika Merkezi','Güvenlik Olayları','Denetim Yönetimi','İş Sürekliliği','Regülasyon Merkezi','Risk İştahı ve KRI'] as const;
export const REPORT_SOURCE_LIMIT = 10_000;
type Source = { table:string; module:string; key:string; fields:string; admin?:boolean; type:string };
export const reportSources:Source[] = [
 {table:'ai_model_inventory',module:'AI Yönetişimi',key:'r.id',admin:true,type:'ai-system',fields:'r.system_name title,r.model_name modelName,r.vendor,r.purpose,r.owner,r.status,r.risk_tier riskTier,r.data_classification dataClassification,r.review_date reviewDate,r.created_at createdAt,r.updated_at updatedAt'},
 {table:'policy_documents',module:'Politika Merkezi',key:'r.id',type:'policy',fields:'r.code fallbackCode,r.title,r.category,r.classification,r.owner,r.reviewer,r.status,r.next_review reviewDate,r.created_at createdAt,r.updated_at updatedAt'},
 {table:'enterprise_incidents',module:'Güvenlik Olayları',key:"'enterprise:incident:'||r.id",type:'incident',fields:'r.code fallbackCode,r.title,r.category,r.severity,r.status,r.owner,r.reviewer,r.risk_ref riskRef,r.bia_ref biaRef,r.detected_date detectedDate,r.declared_at createdAt,r.updated_at updatedAt'},
 {table:'simple_audits',module:'Denetim Yönetimi',key:"'enterprise:audit:'||r.id",type:'audit',fields:'r.name title,r.audit_owner owner,r.auditor reviewer,r.status,r.template,r.audit_type auditType,r.created_at createdAt,r.updated_at updatedAt'},
 {table:'enterprise_continuity_plans',module:'İş Sürekliliği',key:"'enterprise:continuity-plan:'||r.id",type:'continuity-plan',fields:'r.code fallbackCode,r.name title,r.process,r.bia_ref biaRef,r.criticality,r.owner,r.reviewer,r.rto_hours rto,r.rpo_hours rpo,r.review_date reviewDate,r.status,r.version,r.created_at createdAt,r.updated_at updatedAt'},
 {table:'regulatory_intelligence_sources',module:'Regülasyon Merkezi',key:"'enterprise:regulatory-source:'||r.id",type:'regulatory-source',fields:"r.name title,r.authority,r.url,r.owner,CASE WHEN r.enabled=1 THEN 'active' ELSE 'inactive' END status,r.next_check_at reviewDate,r.created_at createdAt,r.updated_at updatedAt"},
 {table:'regulatory_changes',module:'Regülasyon Merkezi',key:"'work:regulatory-change:'||r.id",type:'regulatory-change',fields:'r.title,r.summary,r.severity,r.status,r.owner,r.reviewer,r.external_ref externalRef,r.source_id sourceRef,r.published_date publishedDate,r.effective_date effectiveDate,r.applicability,r.detected_at createdAt,r.updated_at updatedAt'},
 {table:'risk_appetite_statements',module:'Risk İştahı ve KRI',key:"'enterprise:risk-appetite:'||r.id",type:'risk-appetite',fields:'r.code fallbackCode,r.kri_name title,r.statement,r.owner,r.reviewer,r.status,r.next_measurement reviewDate,r.created_at createdAt,r.updated_at updatedAt'},
 {table:'audit_requests',module:'Denetim Yönetimi',key:"'work:audit-request:'||r.id",type:'pbc-request',fields:`r.audit_id auditId,
 json_extract(r.data_json,'$.requirementId') requirementId,json_extract(r.data_json,'$.title') title,
 json_extract(r.data_json,'$.owner') owner,json_extract(r.data_json,'$.reviewer') reviewer,
 json_extract(r.data_json,'$.status') status,json_extract(r.data_json,'$.dueDate') dueDate,
 json_extract(r.data_json,'$.reviewDueDate') reviewDueDate,json_extract(r.data_json,'$.periodStart') periodStart,
 json_extract(r.data_json,'$.periodEnd') periodEnd,
 (SELECT json_group_array(json_object('id',json_extract(e.value,'$.evidenceId'),'version',json_extract(e.value,'$.versionNo'),'period',json_extract(e.value,'$.period'))) FROM json_each(r.data_json,'$.evidence') e) evidenceIndex,
 r.created_at createdAt,r.updated_at updatedAt`},
];
export function reportSourceSql(source:Source,hasCodes:boolean) {
 return `SELECT r.id,${source.key} registryKey,${source.fields}${hasCodes?',COALESCE(display.code,native.code) registryCode':''} FROM ${source.table} r ${hasCodes?`LEFT JOIN simple_grc_record_codes native ON native.record_id=${source.key} LEFT JOIN simple_grc_record_codes display ON display.record_id='map:display:'||(${source.key})`:''} ORDER BY r.id LIMIT ${REPORT_SOURCE_LIMIT+1}`;
}
export async function collectReportSources(db:D1Database,admin:boolean) {
 const tables=new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results.map(r=>r.name));
 const sources=reportSources.filter(s=>!s.admin||admin),present=sources.filter(s=>tables.has(s.table));
 const batches=present.length?await db.batch<Record<string,unknown>>(present.map(s=>db.prepare(reportSourceSql(s,tables.has('simple_grc_record_codes'))))):[];
 if(batches.some(b=>!b.success))throw new Error('unavailable');
 if(batches.some(b=>b.results.length>REPORT_SOURCE_LIMIT))throw new Error('limit');
 const codeKeys=new Set<string>();
 for(let i=0;i<present.length;i++)for(const r of batches[i].results){
  if(present[i].type==='pbc-request'){
   codeKeys.add(`enterprise:audit:${r.auditId}`);if(r.requirementId)codeKeys.add(String(r.requirementId));
   for(const e of JSON.parse(String(r.evidenceIndex||'[]')))if(e.id)codeKeys.add(String(e.id));
  }
  if(present[i].type==='regulatory-change'&&r.sourceRef)codeKeys.add(`enterprise:regulatory-source:${r.sourceRef}`);
 }
 const codes=new Map<string,string>();
 if(codeKeys.size&&tables.has('simple_grc_record_codes')){
  const keys=[...codeKeys];
  for(let start=0;start<keys.length;start+=400){
   const result=await db.prepare(`WITH requested(id) AS (SELECT value FROM json_each(?)) SELECT requested.id,COALESCE(display.code,native.code) code FROM requested LEFT JOIN simple_grc_record_codes native ON native.record_id=requested.id LEFT JOIN simple_grc_record_codes display ON display.record_id='map:display:'||requested.id`).bind(JSON.stringify(keys.slice(start,start+400))).all<{id:string;code:string|null}>();
   for(const row of result.results)if(row.code)codes.set(row.id,row.code);
  }
 }
 const records:ReportRecord[]=present.flatMap((source,i)=>batches[i].results.map(raw=>{
  const {id,registryKey,registryCode,fallbackCode,createdAt,updatedAt,auditId,requirementId,evidenceIndex,...fields}=raw;
  if(source.type==='pbc-request'){
   fields.auditRef=codes.get(`enterprise:audit:${auditId}`)||String(auditId||'');
   fields.requirementRef=codes.get(String(requirementId))||String(requirementId||'');
   fields.evidenceRefs=JSON.parse(String(evidenceIndex||'[]')).map((e:{id:string;version:number;period:string})=>`${codes.get(e.id)||e.id} · v${e.version}${e.period?` · ${e.period}`:''}`).join('\n');
  }
  if(source.type==='regulatory-change')fields.sourceRef=codes.get(`enterprise:regulatory-source:${fields.sourceRef}`)||fields.sourceRef;
  return {id:String(registryKey),code:String(registryCode||fallbackCode||id),module:source.module,data:{...fields,recordType:source.type},createdAt:String(createdAt||''),updatedAt:String(updatedAt||'')};
 }));
 const result={records,modules:WORKFLOW_REPORT_MODULES.filter(m=>admin||m!=='AI Yönetişimi'),uninitialized:sources.filter(s=>!tables.has(s.table)).map(s=>s.module).filter((v,i,a)=>a.indexOf(v)===i),complete:true};
 if(new TextEncoder().encode(JSON.stringify(result)).length>24*1024*1024)throw new Error('limit');
 return result;
}
