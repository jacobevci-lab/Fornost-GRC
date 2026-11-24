import { incidentAttention } from '../../incidents/domain';
import { buildConnectedGrcGraph } from '../../connected-grc-model';
import { recordAiEvent } from '../storage';
import { LLMGateway } from '../llm-gateway';
import { enforceGroundedCitations } from '../knowledge';
import { privacyRow, type Runtime } from '../grc/router';
import { agentActor } from './access';
import { scopedRecords, publicRecord, rankRecords, connections, graphRows, type AgentRecord } from './records';
import { proposeTool, proposalNames, type ProposalTool } from './tool-proposals';
import { proposeCommand } from './proposals';
import { AgenticError, normal, text, type Actor } from './common';
export const FORNOST_AGENT_TOOLS=Object.freeze([
 {name:'search_grc_records',access:'read',parameters:['module','query','status_filter']},
 {name:'get_record_connections',access:'read',parameters:['record_code']},
 {name:'get_overdue_and_gaps',access:'read',parameters:[]},
 {name:'propose_capa_draft',access:'proposal',parameters:['title','source_code','severity','root_cause','corrective_action','linked_risk_code','linked_control_code']},
 {name:'propose_risk_draft',access:'proposal',parameters:['title','asset_code','threat_summary','likelihood','impact']},
 {name:'propose_evidence_review_note',access:'proposal',parameters:['evidence_code','score','findings','recommendation']}
] as const);
export class FornostToolRegistry {
 constructor(readonly env:Runtime,readonly actor:Actor,readonly lang:'tr'|'en'){}
 async invoke(name:string,args:Record<string,unknown>={}){
  const start=Date.now(),spec=FORNOST_AGENT_TOOLS.find(t=>t.name===name);
  try{
   if(!spec)throw new AgenticError('AI_TOOL_DENIED',403);
   await agentActor(this.env.DB,this.actor,spec.access==='proposal');
   let result:unknown;
   if(spec.access==='proposal')result={proposal:await proposeTool(this.env.DB,this.actor,name as ProposalTool,args,this.lang)};
   else{
    if(Object.keys(args).some(k=>!(spec.parameters as readonly string[]).includes(k)))throw new AgenticError('AI_FIELDS');
    const context=await scopedRecords(this.env.DB,this.actor,typeof args.module==='string'&&args.module?args.module:undefined);
    if(name==='search_grc_records')result={sources:rankRecords(context.records,text(args.query,2000),text(args.status_filter,80)).slice(0,32).map(publicRecord),coverage:context.coverage};
    else if(name==='get_record_connections')result={connections:connections(context.records,text(args.record_code,80)),coverage:context.coverage};
    else result=gapRecords(context.records,context.coverage);
   }
   await recordAiEvent(this.env.DB,{actor:this.actor.email,action:'tool:'+name,provider:'rules',status:'success',latencyMs:Date.now()-start,detail:spec.access==='read'?'Scoped read; bounded coverage':'Proposal only; awaiting human confirmation'});
   return result as {sources?:ReturnType<typeof publicRecord>[];coverage?:{module:string;loaded:number;limited:boolean}[];connections?:ReturnType<typeof connections>;gaps?:ReturnType<typeof gapRecords>['gaps'];proposal?:Awaited<ReturnType<typeof proposeTool>>};
  }catch(e){await recordAiEvent(this.env.DB,{actor:this.actor.email,action:'tool:'+text(name,48),provider:'rules',status:'denied',latencyMs:Date.now()-start,detail:'Tool or access validation rejected'});throw e;}
 }
}
function gapRecords(records:AgentRecord[],coverage:{module:string;loaded:number;limited:boolean}[]){
 const links=buildConnectedGrcGraph(graphRows(records)).links,today=new Date().toISOString().slice(0,10),gaps:{record:ReturnType<typeof publicRecord>;reason:string}[]=[];
 for(const r of records){
  const d=r.data,status=String(d.status||''),due=String(d.due_date||d.dueDate||d.sla_due_at||d.response_due_at||'');
  let reason='';
  if(r.kind==='finding'&&due&&due.slice(0,10)<today&&!['closed','accepted','cancelled'].includes(status))reason='overdue-capa';
  else if(r.kind==='evidence'&&d.reviewStatus!=='approved')reason='unapproved-evidence';
  else if(r.kind==='incident'&&['response-breach','recovery-breach'].includes(incidentAttention(status,String(d.severity),String(d.detected_date||''))))reason='incident-sla';
  else if(!links.some(l=>l.source.id===r.id||l.target.id===r.id))reason='no-visible-connections';
  if(reason)gaps.push({record:publicRecord(r),reason});
 }
 return {gaps:gaps.slice(0,50),coverage,limited:gaps.length>50,notice:'Missing visible connections are not proof of noncompliance. Inaccessible or unloaded records are excluded.'};
}
export type AgentAnswer={answer?:string;sources?:ReturnType<typeof publicRecord>[];coverage?:{module:string;loaded:number;limited:boolean}[];asOf?:string;mode?:string;gateway?:string;fallback?:boolean;steps:string[];proposal?:Awaited<ReturnType<typeof proposeTool>>|null;choices?:{id:string;code:string;title:string}[]};
export async function runAgent(env:Runtime,actor:Actor,question:string,input:Record<string,unknown>,lang:'tr'|'en'):Promise<AgentAnswer>{
 actor=await agentActor(env.DB,actor);const tr=lang==='tr',q=normal(question),registry=new FornostToolRegistry(env,actor,lang),steps:string[]=[];
 const call=async(name:string,args:Record<string,unknown>={})=>{steps.push(name);return registry.invoke(name,args);};
 const action=/(taslak|olustur|oner|\bac\b|create|draft|propose)/.test(q),capa=action&&/(capa|bulgu|finding|iyilestirme|remediation|improvement)/.test(q),risk=action&&/risk/.test(q),note=action&&/(inceleme not|review note)/.test(q);
 if(/(onayla|approve|close|kapat)/.test(q)&&/(kanit|evidence|tedarikci|vendor|capa|bulgu|finding)/.test(q)&&!action)throw new AgenticError('AI_TOOL_DENIED',403);
 if(/(hatirlat|remind)/.test(q)&&/(bulgu|finding|sla)/.test(q)){const p=await proposeCommand(env.DB,actor,question,input,lang);return {...p,steps:['legacy_reminder_proposal']};}
 const found=await call('search_grc_records',{query:question,...(risk?{module:'Varlık Envanteri'}:note?{module:'Kanıtlar'}:{})});
 let selected=found.sources||[];
 if(/(gecik|overdue|bosluk|gap|iyilestirme)/.test(q)){const g=await call('get_overdue_and_gaps');selected=[...(g.gaps||[]).map(x=>x.record),...selected].filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i).slice(0,32);}
 const codes:string[]=Array.from(question.match(/\b[A-Z]{2,5}-\d{3,}\b/g)||[]);
 const exact=selected.filter(r=>r.id===input.sourceCode||r.ref===input.assetId||codes.includes(r.id)||r.title.length>1&&q.includes(normal(r.title)));
 if(capa||risk||note){
  const candidates=exact.length?exact:selected;
  if(exact.length!==1&&!input.sourceCode&&!input.assetId)return {answer:tr?'Öneri için kaynak kaydı seçin.':'Select the source record for this proposal.',choices:candidates.map(s=>({id:s.ref,code:s.id,title:s.title})),steps,proposal:null};
  const source=exact[0];if(!source)throw new AgenticError('AI_NOT_FOUND',404);
  await call('get_record_connections',{record_code:source.id});
  const tool:ProposalTool=capa?'propose_capa_draft':risk?'propose_risk_draft':'propose_evidence_review_note';
  const args:Record<string,unknown>={title:text(input.title||(capa?(tr?'İyileştirme taslağı: ':'Improvement draft: '):risk?(tr?'Erişim riski: ':'Access risk: '):(tr?'Ön inceleme notu: ':'Pre-review note: '))+source.title,240)};
  if(capa)Object.assign(args,{source_code:source.id,owner:input.owner||actor.email,reviewer:input.reviewer||''});
  if(risk)Object.assign(args,{asset_code:source.id,threat_summary:question,likelihood:4,impact:4,owner:input.owner||actor.email});
  if(note)Object.assign(args,{evidence_code:source.id,score:0,findings:[tr?'Bu not kanıt dosyasının otomatik analiz sonucu değildir; Kanıt Kütüphanesinde ön inceleme çalıştırın.':'This note is not an automated file analysis; run pre-review in the Evidence Library.'],recommendation:tr?'İnsan doğrulayıcı incelemesi gerekli.':'Human verifier review required.'});
  return {...await call(tool,args),steps};
 }
 const links=codes.length===1&&selected.some(r=>r.id===codes[0])?(await call('get_record_connections',{record_code:codes[0]})).connections:[];
 const privacy=await privacyRow(env.DB),cloud=privacy&&JSON.parse(privacy.config).mode==='byok';
 // Classification is reapplied before any provider boundary; the tool response itself is an authorized local read.
 if(cloud){const permitted=await scopedRecords(env.DB,actor,undefined,'Internal'),ids=new Set(permitted.records.map(r=>r.code));selected=selected.filter(s=>ids.has(s.id));}
 const permittedCodes=new Set(selected.map(r=>r.id)),safeLinks=(links||[]).filter(l=>permittedCodes.has(l.from||'')&&permittedCodes.has(l.to||''));
 const result=await new LLMGateway(env).analyze(actor.email,'connected-analysis',{lang,question,instruction:'Use source codes in square brackets. Coverage is bounded, not portfolio-wide. A link is not proof of effectiveness.',sources:selected,connections:safeLinks},cloud?'Internal':'Confidential');
 const grounded=result.content?enforceGroundedCitations(result.content,selected.map(s=>s.id)):null;
 const safeModel=!!selected.length&&grounded?.grounded&&grounded.invalidRefs.length===0&&!/(certif|fully compliant|100\s*%|guaranteed|uyumlu|onayland|approved|control[s]? (?:are |is )?effective|kontrol.*etkindir)/i.test(result.content||'');
 const answer=safeModel?grounded!.answer:(tr?'Yetkili kapsamdaki güncel kayıtlar (sınırlı görünüm):':'Current records in your authorized scope (bounded view):')+'\n'+selected.map(s=>`[${s.id}] ${s.title} · ${Object.values(s.data as object).join(' · ')||'—'}`).join('\n')+(safeLinks.length?'\n'+safeLinks.map(l=>`[${l.from}] → [${l.to}] · ${l.relation}`).join('\n'):'');
 return {answer,sources:selected,coverage:found.coverage,asOf:new Date().toISOString(),mode:safeModel?'model':'rules',gateway:result.activeMode,fallback:result.fallback,steps};
}
export {proposalNames};
