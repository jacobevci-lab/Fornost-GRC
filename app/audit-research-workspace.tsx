"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceTabs, type WorkspaceTab } from './workspace-tabs';
import { auditPreferredArea, auditRequirementMatches, type AuditQueue } from './audit-workspace-state';
import './audit-workspace-desk.css';

type Requirement = { id: string; data: Record<string, unknown> };
export function AuditResearchWorkspace({lang,auditId,items,focusRequest,focusClosure='',focusWorkpaper='',focusMilestone='',focusArea='',focusedRequirement,plan,requests,workpapers,readiness,reports,closure,requirements,catalog,findings}: {
 lang:'tr'|'en';auditId:string;items:Requirement[];focusRequest:string;focusClosure?:string;focusWorkpaper?:string;focusMilestone?:string;focusArea?:string;focusedRequirement:string;
 plan?:ReactNode;requests?:ReactNode;workpapers?:ReactNode;readiness?:ReactNode;reports?:ReactNode;closure?:ReactNode;findings?:ReactNode;
 requirements:(queue:AuditQueue)=>ReactNode;catalog:ReactNode;go:(module:string)=>void;
}) {
 const tr=lang==='tr';
 const focus=JSON.stringify([focusMilestone,focusWorkpaper,focusClosure,focusedRequirement,focusRequest,focusArea]);
 const preferred=auditPreferredArea({milestone:focusMilestone,workpaper:focusWorkpaper,closure:focusClosure,requirement:focusedRequirement,request:focusRequest,area:focusArea});
 const [view,setView]=useState({tab:preferred,focus}),[queue,setQueue]=useState<AuditQueue>('all'),[now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const active=view.focus!==focus?preferred:view.tab;
 const change=(tab:string)=>setView({tab,focus});
 const queues:[AuditQueue,string,string][]=[['all','Tüm maddeler','All requirements'],['overdue','Geciken','Overdue'],['evidence','Kanıt bekleyen','Awaiting evidence'],['review','İnceleme bekleyen','Awaiting review'],['unassigned','Sorumlu bekleyen','Unassigned']];
 const tabs:WorkspaceTab[]=[
  {key:'work',label:tr?'Çalışma alanı':'Workspace',content:<div className="audit-work-desk">
   <div className="audit-work-queues" aria-label={tr?'Yapılacak işler':'Work to do'}>{queues.map(([key,t,e])=><button type="button" key={key} aria-pressed={queue===key} onClick={()=>setQueue(key)}><strong>{items.filter(r=>auditRequirementMatches(r.data,key,now)).length}</strong><span>{tr?t:e}</span></button>)}</div>
   <p className="fw-muted">{tr?'Sayaçlar madde kayıtlarına dayanır. Kanıt teslimi, test tamamlanması ve bağımsız inceleme ayrı izlenir.':'Counts reflect requirement records. Evidence delivery, test completion and independent review are tracked separately.'}</p>
   {requirements(queue)}
   {plan&&<details className="audit-desk-section" key={`plan:${focusMilestone}`} open={!!focusMilestone}><summary>{tr?'Plan, kapsam ve ekip':'Plan, scope and team'}</summary>{plan}</details>}
   {workpapers&&<details className="audit-desk-section" key={`papers:${focusWorkpaper}`} open={!!focusWorkpaper}><summary>{tr?'Denetimin tüm çalışma kâğıtları':'All audit workpapers'}</summary>{workpapers}</details>}
   <details className="audit-desk-section"><summary>{tr?'Katalog ve güvence kontrolü':'Catalog and assurance checks'}</summary>{catalog}{readiness}</details>
  </div>},
  {key:'requests',label:tr?'Kanıt talepleri':'Evidence requests',content:requests||<p>{tr?'Talepler için portföye bağlı bir denetim gerekir.':'Requests require an audit linked to the portfolio.'}</p>},
  {key:'findings',label:tr?'Bulgular':'Findings',content:findings||<p>{tr?'Bağlı bulguları görmek için denetimi portföye bağlayın.':'Link the audit to the portfolio to see its findings.'}</p>},
  {key:'report',label:tr?'Rapor ve kapanış':'Report and closure',content:<div className="audit-report-desk">{reports}{closure}{!reports&&!closure&&<p>{tr?'Denetim raporu ve kapanış kararları için yönetici yetkisi gerekir.':'Audit reporting and closure decisions require administrator access.'}</p>}</div>},
 ];
 return <section className="fw-audit-workspace" data-audit-id={auditId} aria-label={tr?'Denetim çalışma alanı görünümleri':'Audit workspace views'}><WorkspaceTabs label={tr?'Denetim görünümleri':'Audit views'} items={tabs} active={active} onChange={change}/></section>;
}
