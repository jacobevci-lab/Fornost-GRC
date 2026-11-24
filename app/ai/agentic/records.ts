import { canReadModule } from '../../module-access';
import { buildConnectedGrcGraph, type ConnectedGrcRow } from '../../connected-grc-model';
import { recordDataClassificationAllowed } from '../data-policy';
import { sanitizeAiRecord } from '../security';
import { agentActor, entityIds } from './access';
import { AgenticError, normal, text, type Actor } from './common';
export const agentModules:Record<string,{kind:string;table:string;registry?:string}>={
 'Risk Assessment':{kind:'risk',table:'simple_grc_records'},'Varlık Envanteri':{kind:'asset',table:'simple_grc_records'},'Kontroller':{kind:'control',table:'simple_grc_records'},'Kanıtlar':{kind:'evidence',table:'simple_grc_records'},'Tedarikçiler':{kind:'vendor',table:'simple_grc_records'},'BIA':{kind:'bia',table:'simple_grc_records'},'Uyum':{kind:'compliance',table:'simple_grc_records'},
 'Bulgular ve CAPA':{kind:'finding',table:'enterprise_findings',registry:"'work:finding:'||r.id"},'Güvenlik Olayları':{kind:'incident',table:'enterprise_incidents',registry:"'enterprise:incident:'||r.id"},'Risk İştahı ve KRI':{kind:'kri',table:'risk_appetite_statements'},'AI Yönetişimi':{kind:'ai',table:'ai_model_inventory'},'Politika Merkezi':{kind:'policy',table:'policy_documents'}
};
export type AgentRecord={id:string;code:string;module:string;kind:string;table:string;entity:string;title:string;data:Record<string,unknown>;row:Record<string,unknown>};
export async function scopedRecords(db:D1Database,actor:Actor,module?:string,maxClassification:import('../data-policy').AiDataClassification='Confidential'){
 actor=await agentActor(db,actor);if(module&&!agentModules[module])throw new AgenticError('AI_FIELDS');
 const ids=await entityIds(db,actor),records:AgentRecord[]=[],coverage:{module:string;loaded:number;limited:boolean}[]=[];
 for(const [name,spec] of Object.entries(agentModules)){
  if(module&&module!==name||!canReadModule(actor,name))continue;
  const core=spec.table==='simple_grc_records';
  const rows=(await db.prepare(`SELECT r.*,c.code canonical_code,coalesce(o.org_entity_id,'root') entity FROM ${spec.table} r LEFT JOIN simple_grc_record_codes c ON c.record_id=${spec.registry||'r.id'} LEFT JOIN org_record_entities o ON o.kind=? AND o.record_id=r.id WHERE ${core?'r.module=? AND ':''}(? IS NULL OR coalesce(o.org_entity_id,'root') IN(SELECT value FROM json_each(?))) ORDER BY r.updated_at DESC,r.id LIMIT 501`).bind(spec.kind,...(core?[name]:[]),ids===null?null:JSON.stringify(ids),ids===null?null:JSON.stringify(ids)).all<Record<string,unknown>>()).results;
  coverage.push({module:name,loaded:Math.min(rows.length,500),limited:rows.length>500});
  for(const row of rows.slice(0,500)){
   const data=core?JSON.parse(String(row.data_json)):{...row,dataClassification:row.data_classification||row.classification||'Confidential'};
   if(!recordDataClassificationAllowed(data,maxClassification))continue;
   const code=String(row.canonical_code||row.code||'');if(!/^[A-Z]{2,5}-\d{3,}$/.test(code))continue;
   if(spec.kind==='kri'){const m=await db.prepare('SELECT value,band FROM risk_kri_measurements WHERE appetite_id=? ORDER BY recorded_at DESC,id LIMIT 1').bind(row.id).first<{value:number;band:string}>();if(m){data.latest_value=m.value;data.latest_band=m.band;}}
   records.push({id:String(row.id),code,module:name,kind:spec.kind,table:spec.table,entity:String(row.entity),title:text(data.title||data.controlTitle||data.evidenceTitle||data.process||data.system_name||data.kri_name||code,240),data,row:Object.fromEntries(Object.entries(row).filter(([k])=>!['canonical_code','entity'].includes(k)))});
  }
 }
 return {actor,records,coverage};
}
export const graphRows=(records:AgentRecord[]):ConnectedGrcRow[]=>records.map(r=>{
 const data={...r.data};
 if(r.kind==='finding'){data.findingRiskRef=data.risk_ref;data.findingControlRef=data.control_ref;const sourceFields:Record<string,string>={risk:'findingRiskRef',control:'findingControlRef',vendor:'findingVendorRef',policy:'findingPolicyRef',incident:'findingIncidentRef',ai:'aiModelRef'};const f=sourceFields[String(data.source_type)];if(f&&!data[f])data[f]=data.source_ref;}
 if(r.kind==='incident'){data.incidentAssetRefs=data.asset_refs;data.incidentRiskRef=data.risk_ref;data.biaRef=data.bia_ref;}
 if(r.kind==='kri')data.appetiteRiskRefs=data.risk_refs_json?JSON.parse(String(data.risk_refs_json)):data.risk_ref;
 return {id:r.id,code:r.code,module:r.module,data,updatedAt:String(r.row.updated_at||'')};
});
export function connections(records:AgentRecord[],code:string){const target=records.find(r=>r.code===code);if(!target)throw new AgenticError('AI_NOT_FOUND',404);const graph=buildConnectedGrcGraph(graphRows(records));return graph.links.filter(l=>l.source.id===target.id||l.target.id===target.id).map(l=>({from:l.source.code,to:l.target.code,relation:l.relation}));}
export function publicRecord(r:AgentRecord){const keys=['status','reviewStatus','riskLevel','implementation','due_date','dueDate','nextReview','expiryDate','inherentLikelihood','inherentImpact','latest_value','latest_band','metric_unit','severity'];const data=Object.fromEntries(keys.filter(k=>r.data[k]!==undefined).map(k=>[k,r.data[k]]));return {id:r.code,ref:r.id,module:r.module,title:r.title,data:sanitizeAiRecord(data)};}
export function rankRecords(records:AgentRecord[],query:string,status=''){const words=normal(query).split(/[^a-z0-9]+/).filter(w=>w.length>2);return records.filter(r=>!status||normal(String(r.data.status||r.data.reviewStatus||''))===normal(status)).map(r=>({r,score:words.reduce((n,w)=>n+(normal(r.code+' '+r.title+' '+JSON.stringify(publicRecord(r).data)).includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score||a.r.code.localeCompare(b.r.code)).map(x=>x.r);}
