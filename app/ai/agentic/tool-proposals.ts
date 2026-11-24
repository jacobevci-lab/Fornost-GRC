import { validate } from '../../core-record-validation';
import { insertCoreRecords } from '../../core-reference-write';
import { reserveRecordCodes } from '../../record-code-store';
import { validateFinding, findingSlaDays } from '../../findings/domain';
import { insertFinding } from '../../findings/intake-store';
import { joinWorkflowGuards } from '../../workflow-selection-store';
import { digest } from '../grc/router';
import { agentActor, authority, authorityGuard, requireModule, entityIds } from './access';
import { scopedRecords, type AgentRecord } from './records';
import { AgenticError, day, text, type Actor } from './common';
import { saveProposal, proposalGuard, card, type Proposal } from './proposals';
export const proposalNames=['propose_capa_draft','propose_risk_draft','propose_evidence_review_note'] as const;
export type ProposalTool=typeof proposalNames[number];
const moduleFor=(tool:ProposalTool)=>tool==='propose_capa_draft'?'Bulgular ve CAPA':tool==='propose_risk_draft'?'Risk Assessment':'Kanıtlar';
const fields=['title','source_code','severity','root_cause','corrective_action','preventive_action','description','linked_risk_code','linked_control_code','asset_code','threat_summary','likelihood','impact','evidence_code','score','findings','recommendation','owner','reviewer','dueDate'];
async function prepareTool(db:D1Database,actor:Actor,tool:ProposalTool,input:Record<string,unknown>,lang:'tr'|'en'){
 actor=await agentActor(db,actor,true);requireModule(actor,moduleFor(tool),true);
 if(Object.keys(input).some(k=>!fields.includes(k)))throw new AgenticError('AI_FIELDS');
 const {records}=await scopedRecords(db,actor),pins:AgentRecord[]=[];
 const ref=(v:unknown,module?:string)=>{const r=records.find(r=>r.code===v&&(!module||r.module===module));if(!r)throw new AgenticError('AI_NOT_FOUND',404);pins.push(r);return r;};
 const source=ref(tool==='propose_risk_draft'?input.asset_code:tool==='propose_evidence_review_note'?input.evidence_code:input.source_code,tool==='propose_risk_draft'?'Varlık Envanteri':tool==='propose_evidence_review_note'?'Kanıtlar':undefined);
 const risk=input.linked_risk_code?ref(input.linked_risk_code,'Risk Assessment'):null,control=input.linked_control_code?ref(input.linked_control_code,'Kontroller'):null;
 if([risk,control].some(r=>r&&r.entity!==source.entity))throw new AgenticError('AI_SCOPE',403);
 const data:Record<string,unknown>={...input,title:text(input.title||source.title,240)};
 if(tool==='propose_risk_draft')Object.assign(data,{asset_code:source.code,likelihood:Number(input.likelihood??4),impact:Number(input.impact??4),owner:text(input.owner||actor.email,254),threat_summary:text(input.threat_summary||source.title,1800)});
 if(tool==='propose_capa_draft')Object.assign(data,{source_code:source.code,severity:text(input.severity||'medium',20),owner:text(input.owner||actor.email,254),reviewer:text(input.reviewer,254),linked_risk_code:risk?.code||'',linked_control_code:control?.code||'',dueDate:text(input.dueDate||day(findingSlaDays(String(input.severity||'medium'))),10),root_cause:text(input.root_cause||(lang==='tr'?'Kök neden insan incelemesiyle belirlenecek.':'Root cause to be established by human review.')),corrective_action:text(input.corrective_action||(lang==='tr'?'Kaynağı inceleyin ve doğrulanabilir iyileştirme planı hazırlayın.':'Review the source and prepare a verifiable corrective action plan.')),preventive_action:text(input.preventive_action||(lang==='tr'?'Tekrarı önleyici kontrol ve izleme planını belirleyin.':'Define preventive controls and a monitoring plan.')),description:text(input.description||(lang==='tr'?'AI önerisi; doğrulanmış uygunsuzluk değildir. Kaynak: ':'AI suggestion; not a verified nonconformity. Source: ')+source.code+' · '+source.title,3000)});
 if(tool==='propose_evidence_review_note'){
  if(!Number.isInteger(input.score)||Number(input.score)<0||Number(input.score)>100||!Array.isArray(input.findings)||!input.findings.length||input.findings.length>20||input.findings.some(x=>typeof x!=='string'||x.length>2000)||typeof input.recommendation!=='string'||!input.recommendation.trim())throw new AgenticError('AI_FIELDS');
  Object.assign(data,{evidence_code:source.code,score:input.score,findings:input.findings,recommendation:text(input.recommendation,2000)});
 }
 const auth=await authority(db,actor,pins.map(p=>p.id));
 return {actor,params:{title:data.title,data,tool,lang,entity:source.entity,source:{id:source.id,code:source.code,kind:source.kind,title:source.title,module:source.module},riskId:risk?.id||'',controlId:control?.id||'',authorization:auth},pins:pins.map(r=>({table:r.table,row:r.row}))};
}
export async function proposeTool(db:D1Database,actor:Actor,tool:ProposalTool,input:Record<string,unknown>,lang:'tr'|'en'){const p=await prepareTool(db,actor,tool,input,lang);return saveProposal(db,p.actor,'tool:'+tool,p.params,p.pins);}
async function assignee(db:D1Database,email:unknown,module:string,entity:string,reviewer=false){
 const u=await db.prepare("SELECT id,email,name,role,status FROM local_users WHERE lower(email)=lower(?) AND status='Active'").bind(text(email,254)).first<Actor&{status:string}>();
 if(!u||reviewer&&u.role!=='Admin')throw new AgenticError('AI_PEOPLE');
 const live=await agentActor(db,{...u,source:'local'},true);requireModule(live,module,true);const ids=await entityIds(db,live);if(ids&&!ids.includes(entity))throw new AgenticError('AI_PEOPLE');
 return {user:live,guard:authorityGuard(live,await authority(db,live,[]))};
}
export async function applyTool(db:D1Database,actor:Actor,p:Proposal){
 actor=await agentActor(db,actor,true);const params=JSON.parse(p.params_json),tool=params.tool as ProposalTool;if(!proposalNames.includes(tool))throw new AgenticError('AI_ACTION');requireModule(actor,moduleFor(tool),true);
 const scope=authorityGuard(actor,params.authorization),guard=joinWorkflowGuards(proposalGuard(p),scope,{sql:"NOT EXISTS(SELECT 1 FROM ai_operating_policy WHERE id='default' AND drafts_enabled=0)",values:[]}),now=new Date().toISOString(),d=params.data;
 const finish=(module:string,code?:string,recordId=p.id)=>db.prepare("UPDATE ai_hitl_proposals SET status='applied',result_json=json_object('id',?,'module',?,'code',?),applied_at=? WHERE id=? AND status='pending' AND changes()>0").bind(recordId,module,code||params.source.code,now,p.id);
 const entity=(kind:string)=>db.prepare("INSERT INTO org_record_entities(kind,record_id,org_entity_id,note,revision) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ai_hitl_proposals WHERE id=? AND status='applied')").bind(kind,p.id,params.entity,'Ask Fornost (Kullanıcı Onaylı)',crypto.randomUUID(),p.id);
 try{
  if(tool==='propose_risk_draft'){
   const owner=await assignee(db,d.owner,'Risk Assessment',params.entity);
   const checked=validate('Risk Assessment',{title:d.title,asset:params.source.id,owner:owner.user.name,ownerEmail:owner.user.email,ownerSource:'directory',status:'Değerlendiriliyor',description:d.threat_summary,inherentLikelihood:d.likelihood,inherentImpact:d.impact,aiOrigin:'Ask Fornost (Kullanıcı Onaylı)'});
   if(checked.error||!checked.data)throw new AgenticError('AI_FIELDS');
   const code=(await reserveRecordCodes(db,'Risk Assessment',1,now))[0];const all=joinWorkflowGuards(guard,owner.guard);
   await insertCoreRecords(db,'Risk Assessment',[{id:p.id,code,data:checked.data}],now,undefined,{guard:{sql:all.sql,values:all.values.map(String)},after:finish('Risk Assessment',code),tail:[entity('risk')]});
  }else if(tool==='propose_capa_draft'){
   const owner=await assignee(db,d.owner,'Bulgular ve CAPA',params.entity),reviewer=await assignee(db,d.reviewer,'Bulgular ve CAPA',params.entity,true);
   if([actor.email,owner.user.email].some(e=>e.toLowerCase()===reviewer.user.email.toLowerCase()))throw new AgenticError('AI_SOD',403);
   const sourceType=['risk','control','vendor','policy','incident','ai'].includes(params.source.kind)?params.source.kind:'manual';
   const finding=validateFinding({title:d.title,sourceType,sourceRef:params.source.id,sourceTitle:params.source.title,findingType:'improvement',description:d.description,severity:d.severity,owner:owner.user.email,reviewer:reviewer.user.email,rootCause:d.root_cause,correctiveAction:d.corrective_action,preventiveAction:d.preventive_action,dueDate:d.dueDate,riskRef:params.riskId||'',controlRef:params.controlId||'',referenceMode:'record-id'});
   const done=db.prepare("UPDATE ai_hitl_proposals SET status='applied',result_json=json_object('id',?,'module','Bulgular ve CAPA','code',(SELECT code FROM simple_grc_record_codes WHERE record_id='work:finding:'||?)),applied_at=? WHERE id=? AND status='pending' AND changes()>0").bind(p.id,p.id,now,p.id);
   await insertFinding(db,finding,{id:p.id,code:'FND-'+p.id,actor:actor.email,stamp:now,selectedIds:true,guard:joinWorkflowGuards(guard,owner.guard,reviewer.guard),afterCreate:[done,entity('finding')]});
  }else{
   const sourcePin=JSON.parse(p.source_json).find((x:{table:string;row:{id:string}})=>x.table==='simple_grc_records'&&x.row.id===params.source.id);
   const result={evidenceRevision:sourcePin?.row.updated_at,score:d.score,findings:d.findings,recommendation:d.recommendation,preliminary:true,humanConfirmedBy:actor.email,evidenceCode:params.source.code};
   const sourceHash=await digest(p.source_json);
   const r=await db.batch([db.prepare(`INSERT INTO grc_ai_results(id,kind,subject,source_hash,result,actor,created_at) SELECT ?,'evidence-note',?,?,?,?,? WHERE ${guard.sql}`).bind(p.id,params.source.id,sourceHash,JSON.stringify(result),actor.email,now,...guard.values),finish('Kanıtlar',undefined,params.source.id)]);if(!r[0].meta?.changes)throw new AgenticError('AI_STALE',409);
  }
 }catch(e){const replay=await db.prepare('SELECT status FROM ai_hitl_proposals WHERE id=?').bind(p.id).first<{status:string}>();if(replay?.status==='applied')return;throw e;}
}
export async function reviseTool(db:D1Database,actor:Actor,p:Proposal,patch:Record<string,unknown>){
 if(!p.kind.startsWith('tool:')||p.status!=='pending'||p.expires_at<=new Date().toISOString())throw new AgenticError('AI_EXPIRED',409);
 const params=JSON.parse(p.params_json);const a=authorityGuard(actor,params.authorization);if(!(await db.prepare(`SELECT 1 WHERE ${a.sql}`).bind(...a.values).first()))throw new AgenticError('AI_STALE',409);
 const next=await prepareTool(db,actor,params.tool,{...params.data,...patch},params.lang),revision=crypto.randomUUID(),now=new Date().toISOString();
 const guard=joinWorkflowGuards(proposalGuard(p),a);
 const results=await db.batch([db.prepare(`UPDATE ai_hitl_proposals SET params_json=?,source_json=?,revision=?,expires_at=? WHERE id=? AND ${guard.sql}`).bind(JSON.stringify(next.params),JSON.stringify(next.pins),revision,new Date(Date.now()+20*60000).toISOString(),p.id,...guard.values),db.prepare("INSERT INTO ai_activity_logs(id,actor,action,provider,model,context_refs_json,status,latency_ms,detail,created_at) SELECT ?,?,'hitl-revision','rules','',?,'success',0,'Human edited proposal; explicit confirmation required',? WHERE changes()=1").bind(crypto.randomUUID(),actor.email,JSON.stringify([p.id]),now)]);
 if(!results[0].meta?.changes)throw new AgenticError('AI_STALE',409);
 return toolReceipt(db,p.id);
}
export async function toolReceipt(db:D1Database,id:string){return card((await db.prepare('SELECT * FROM ai_hitl_proposals WHERE id=?').bind(id).first<Proposal>())!);}
