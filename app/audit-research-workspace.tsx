"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { WorkspaceTabs } from './workspace-tabs';
import { AuditWorkingDesk } from './audit-working-desk';
import { auditRequirementTitle, type AuditDeskRequirement } from './audit-workspace-model';
import type { AuditRequest } from './audit-requests';
import type { AuditWorkpaper } from './audit-workpapers';
import './audit-working-desk.css';

type Mode='desk'|'guide'|'board';
type ReqState={requests:AuditRequest[];complete:boolean}|null;
type PaperState={papers:AuditWorkpaper[];complete:boolean}|null;
function enrich(node:ReactNode,props:Record<string,unknown>){return isValidElement(node)?cloneElement(node as ReactElement<Record<string,unknown>>,props):node;}
export function AuditResearchWorkspace({lang,auditId,items,focusRequest,focusClosure='',focusWorkpaper='',focusMilestone='',focusedRequirement,plan,requests,workpapers,readiness,reports,closure,requirements,catalog,go,edit,remove,canWrite=false,canDelete=false,actionSection=''}:{
  lang:'tr'|'en';auditId:string;items:AuditDeskRequirement[];focusRequest:string;focusClosure?:string;focusWorkpaper?:string;focusMilestone?:string;focusedRequirement:string;
  plan?:ReactNode;requests?:ReactNode;workpapers?:ReactNode;readiness?:ReactNode;reports?:ReactNode;closure?:ReactNode;requirements:ReactNode;catalog:ReactNode;go:(module:string)=>void;
  edit:(row:AuditDeskRequirement)=>void;remove:(id:string)=>void;canWrite?:boolean;canDelete?:boolean;actionSection?:string;
}){
  const tr=lang==='tr',t=(a:string,b:string)=>tr?a:b;
  const preferred=focusMilestone?'plan':focusWorkpaper?'workpapers':focusClosure?'closure':focusRequest?'requests':'desk';
  const focus=[focusMilestone,focusWorkpaper,focusClosure,focusedRequirement,focusRequest].join('|');
  const [location,setLocation]=useState({section:preferred,focus});
  const section=location.focus!==focus?preferred:location.section;
  const [mode,setMode]=useState<Mode>('desk'),[context,setContext]=useState<{id:string;title:string}|undefined>();
  const [requestState,setRequestState]=useState<ReqState>(null),[paperState,setPaperState]=useState<PaperState>(null);
  const [requestDirty,setRequestDirty]=useState(false),[paperDirty,setPaperDirty]=useState(false);
  const receiveRequests=useCallback((data:ReqState)=>setRequestState(data),[]),receivePapers=useCallback((data:PaperState)=>setPaperState(data),[]);
  useEffect(()=>{try{const saved=localStorage.getItem('fornost-audit-view');if(['desk','guide','board'].includes(saved||''))setMode(saved as Mode);}catch{}},[]);
  useEffect(()=>{if(actionSection){const target=actionSection.split(':')[0];setLocation({section:target==='connections'?'readiness':target,focus});}},[actionSection]);
  useEffect(()=>{if(!requestDirty&&!paperDirty)setContext(undefined);},[focus]);
  function chooseMode(value:Mode){setMode(value);setLocation({section:'desk',focus});try{localStorage.setItem('fornost-audit-view',value);}catch{}}
  function change(next:string,requirement?:AuditDeskRequirement){
    if((requestDirty||paperDirty)&&requirement&&context?.id!==requirement.id)return;
    if(!requestDirty&&!paperDirty)setContext(requirement?{id:requirement.id,title:auditRequirementTitle(requirement)}:undefined);
    setLocation({section:next,focus});
  }
  const allRequests=requestState?.requests||[],allPapers=paperState?.papers||[];
  const complete=!!requestState?.complete&&!!paperState?.complete;
  const main=section==='requests'?'requests':section==='findings'?'findings':['reports','closure'].includes(section)?'closing':'work';
  const exceptions=allPapers.filter(p=>p.status!=='cancelled'&&p.samples.some(s=>s.result==='exception'));
  const toolNames:Record<string,string>={plan:t('Plan ve kapsam','Plan and scope'),workpapers:t('Test ve inceleme','Test and review'),readiness:t('Güvence ve hazırlık','Assurance and readiness'),requirements:t('Gelişmiş madde tablosu','Advanced requirement register')};
  const requestPanel=enrich(requests,{requirement:context,onData:receiveRequests,onDirtyChange:setRequestDirty});
  const paperPanel=enrich(workpapers,{requirement:context,onData:receivePapers,onDirtyChange:setPaperDirty});
  return <section className="fw-audit-workspace audit-workspace-v2" aria-label={t('Denetim çalışma alanı görünümleri','Audit workspace views')}>
    <WorkspaceTabs label={t('Denetim çalışma alanları','Audit work areas')} active={main} onChange={key=>change(key==='work'?'desk':key==='closing'?'closure':key)} items={[
      {key:'work',label:t('Çalışma alanı','Workspace'),content:null},
      ...(requests?[{key:'requests',label:t('Kanıt talepleri','Evidence requests'),content:null}]:[]),
      {key:'findings',label:t('Bulgular','Findings'),content:null},
      {key:'closing',label:t('Rapor ve kapanış','Report and closure'),content:null},
    ]}/>
    {(requestDirty||paperDirty)&&<p className="ad-notice" role="status">{t('Açık taslağınız korunuyor. Başka bir maddeye bağlanmak için önce taslağı kaydedin veya iptal edin.','Your open draft is retained. Save or cancel it before switching the linked requirement.')} <button type="button" onClick={()=>setLocation({section:requestDirty?'requests':'workpapers',focus})}>{t('Taslağa dön','Return to draft')}</button></p>}
    <div hidden={main!=='work'}>
      <div className="ad-view-toolbar"><div role="group" aria-label={t('Çalışma görünümü','Work view')}>{(['desk','guide','board'] as Mode[]).map((key,i)=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>chooseMode(key)}>{(tr?['Masa','Rehber','Pano']:['Desk','Guide','Board'])[i]}</button>)}</div><div className="ad-secondary-tools"><button type="button" onClick={()=>change('plan')}>{t('Plan ve ekip','Plan and team')}</button><button type="button" onClick={()=>change('workpapers')}>{t('Tüm testler','All tests')}</button><button type="button" onClick={()=>change('readiness')}>{t('Kanıt hazırlığı','Evidence readiness')}</button><button type="button" onClick={()=>change('requirements')}>{t('Gelişmiş tablo','Advanced register')}</button></div></div>
      {mode==='guide'&&<nav className="ad-guide-steps" aria-label={t('Denetim aşamaları','Audit stages')}>{[['plan',t('1 · Plan ve kapsam','1 · Plan and scope')],['desk',t('2 · Kanıt ve test','2 · Evidence and test')],['workpapers',t('3 · İnceleme','3 · Review')],['closure',t('4 · Rapor ve kapanış','4 · Report and closure')]].map(([key,label])=><button type="button" key={key} aria-current={section===key?'step':undefined} onClick={()=>change(key)}>{label}</button>)}</nav>}
    </div>
    {context&&['requests','workpapers'].includes(section)&&<div className="ad-context"><b>{t('Seçili madde','Selected requirement')}: {context.title}</b><span>{t('Yeni kayıt bu maddeye bağlanır.','New records link to this requirement.')}</span><button type="button" disabled={requestDirty||paperDirty} onClick={()=>{setContext(undefined);}}>{t('Denetimdeki tüm kayıtlar','All records in audit')}</button></div>}
    <div hidden={section!=='desk'}><AuditWorkingDesk lang={lang} items={items} mode={mode} focusedRequirement={focusedRequirement} requests={allRequests} papers={allPapers} complete={complete} canWrite={canWrite} canDelete={canDelete} onEdit={edit} onRemove={remove} onTool={change}/></div>
    {['plan','workpapers','readiness','requirements'].includes(section)&&<div className="ad-tool-heading"><button type="button" onClick={()=>setLocation({section:'desk',focus})}>{t('Çalışma alanına dön','Back to workspace')}</button><h3>{toolNames[section]}</h3></div>}
    <div hidden={section!=='plan'}>{plan||<p>{t('Plan için aktif denetim bağlantısı gerekiyor.','An active audit is required for planning.')}</p>}</div>
    <div hidden={section!=='requests'}>{requestPanel}</div>
    <div hidden={section!=='workpapers'}>{paperPanel}</div>
    <div hidden={section!=='readiness'}>{readiness}</div>
    <div hidden={section!=='requirements'}>{requirements}</div>
    <section className="ad-findings" hidden={section!=='findings'}><h3>{t('Bu denetimin test istisnaları','Test exceptions in this audit')}</h3><p>{t('İstisnaları çalışma kâğıdından inceleyin ve onaylı kaynaktan CAPA’ya aktarın.','Review exceptions in their workpapers and promote approved source results to CAPA.')}</p>{!paperState?.complete&&<p role="status">{t('Test verisi tam doğrulanmadı.','Test data is not fully verified.')}</p>}{exceptions.map(p=><article key={p.id}><h4>{p.title}</h4><p>{p.samples.filter(s=>s.result==='exception').length} {t('istisna','exceptions')} · {p.owner}</p><button type="button" onClick={()=>change('workpapers',items.find(r=>r.id===p.requirementId))}>{t('Test ve CAPA işlemlerini aç','Open test and CAPA actions')}</button></article>)}{paperState?.complete&&!exceptions.length&&<p>{t('Çalışma kâğıtlarında test istisnası yok.','No test exceptions in the workpapers.')}</p>}<button type="button" onClick={()=>go('Bulgular ve CAPA')}>{t('Tüm kurumsal bulgular','All enterprise findings')}</button></section>
    <section hidden={!['closure','reports'].includes(section)}><div className="ad-secondary-tools"><button type="button" aria-pressed={section==='closure'} onClick={()=>change('closure')}>{t('Kapanış ve onay','Closure and approval')}</button><button type="button" aria-pressed={section==='reports'} onClick={()=>change('reports')}>{t('Raporlar','Reports')}</button></div><div hidden={section!=='closure'}>{closure||<p>{t('Kapanış işlemleri yönetici yetkisi gerektirir.','Closure actions require an administrator.')}</p>}</div><div hidden={section!=='reports'}>{reports||<p>{t('Denetim raporu için yönetici yetkisi gerekir.','Audit reports require an administrator.')}</p>}</div></section>
    <details className="ad-catalog"><summary>{t('Katalog ve kapsam bilgisi','Catalog and scope information')}</summary>{catalog}<small>{auditId}</small></details>
  </section>;
}
