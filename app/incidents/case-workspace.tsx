"use client";
import {useContext, useState,useEffect} from "react";
import {CurrentRecordTrail, ModuleTrailContext} from "../module-record-trail-view";
import {resolveCoreRecord} from "../core-record-focus";
import {navigateToFornost} from "../navigation-focus";
import {incidentRecoveryHours, incidentResponseHours} from "./domain";
import {incidentLabel} from "./labels";
import {incidentDecisionAvailable, incidentNextAction} from "./decisions";
import WorkflowCancelButton from "../workflow-cancel-button";
import {CommandBoard,NotificationClock} from "./command-board";
import {noticeLabel} from "./crisis";
import {CrisisActionDialog} from "./crisis-actions";
import IncidentHistoryPanel from "./history-panel";

export type Incident = {
  id: string; code: string; title: string; category: string; severity: string; detectedDate: string;
  description: string; businessImpact: string; owner: string; declaredBy: string; commander: string;
  reviewer: string; assetRefs: string; riskRef?: string; biaRef?: string; dataClassification: string;
  detectedAt?:string|null;awarenessAt?:string|null;vendorRef?:string|null;notificationScope?:string|null;notificationRegime?:string|null;personalData: boolean; status: string; rootCause?: string; lessonsLearned?: string;
  notificationDecision: string; notificationRationale?: string; reopenCount: number; attention: string; updatedAt: string;
};
export const hasIncidentBreach = (row: Incident) => row.attention === "response-breach" || row.attention === "recovery-breach";
export function matchesIncident(row: Incident, filter: string, query: string, lang: "tr"|"en") {
  const inScope = filter === "all" || (filter === "active" && !["closed","cancelled"].includes(row.status)) ||
    (filter === "breached" && hasIncidentBreach(row)) || row.status === filter || row.attention === filter;
  const locale = lang === "tr" ? "tr-TR" : "en-GB";
  const text = [row.code,row.title,row.category,incidentLabel(row.category,lang),row.owner,row.commander,row.assetRefs];
  return inScope && text.join(" ").toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
}

function RelatedRecords({module, refs}: {module: string; refs?: string}) {
  const context = useContext(ModuleTrailContext);
  const values = [...new Set((refs || "").split(/[;,|\r\n]+/).map(x=>x.trim()).filter(Boolean))];
  if (!values.length) return <>—</>;
  return <div className="ic-references">{values.map(ref=>{
    const row = context && context.coreState === "ready" && resolveCoreRecord(context.rows,{module,kind:"record",ref,source:"shared-record-link"});
    if (!row) return <span key={ref}>{ref}</span>;
    const name = row.data.title || row.data.process || row.data.name || row.code || ref;
    return <button className="ic-link" key={ref} onClick={()=>navigateToFornost({module,kind:"record",ref:row.id,source:"shared-record-link"})}>{String(name)}</button>;
  })}</div>;
}

type View = "summary"|"evidence"|"history"|"crisis";
export function IncidentDossier({row,lang,user,disabled,onAction,reload,onCancelSaved}:{
  row: Incident; lang: "tr"|"en"; user: {role:string;email:string}; disabled:boolean;
  onAction:(row:Incident)=>void;reload:()=>Promise<void>;onCancelSaved:()=>Promise<void>;
}) {
  const tr=lang==="tr";
  const [view,setView]=useState<View>("summary");
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [modal,setModal]=useState<'notice'|'evidence'|null>(null),[now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
  const editable=!["closed","cancelled"].includes(row.status)&&(user.role==="Admin"||user.role==="Editor"&&[row.owner,row.commander].includes(user.email));
  const changeView=(next:View)=>{setView(next);};
  const label=(s:string)=>incidentLabel(s,lang);
  const op=incidentNextAction[row.status];
  const actionLabel=op==="triage"?(tr?"Ön incelemeyi başlat":"Start triage"):op==="review"?(tr?"İncelemeye gönder":"Submit for review"):label(op);
  const needsNotice=op==="review"&&row.personalData&&!!row.detectedAt&&!row.notificationScope;
  const allowed=incidentDecisionAvailable({record:{status:row.status,owner:row.owner,commander:row.commander,reviewer:row.reviewer,declared_by:row.declaredBy},revision:""},op,user);
  const tabs: [View,string][]=[["summary",tr?"Özet":"Summary"],["evidence",tr?"Kanıtlar":"Evidence"],["history",tr?"Karar geçmişi":"Decision history"],["crisis",tr?"Kriz özeti":"Crisis brief"]];
  const roles=<dl className="ic-roles">{[[tr?"Olay sahibi":"Incident owner",row.owner],[tr?"Olay yöneticisi":"Incident commander",row.commander],[tr?"Bağımsız inceleyen":"Independent reviewer",row.reviewer]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
  const impact=<div className="ic-impact"><strong>{tr?"İş etkisi":"Business impact"}</strong><p>{row.businessImpact || "—"}</p></div>;
  const notification=<div className="ic-notification"><strong>{tr?"Bildirim kararı":"Notification decision"}</strong><p>{label(row.notificationDecision || "pending")}</p>{row.notificationScope&&<p>{noticeLabel(row.notificationRegime==="both"?"bothRegimes":row.notificationRegime||"",tr)} · {noticeLabel(row.notificationScope,tr)}</p>}{row.notificationRationale&&<p>{row.notificationRationale}</p>}{editable&&<button type="button" disabled={disabled} onClick={()=>setModal("notice")}>{tr?"Bildirim Kararını Kaydet":"Record notification decision"}</button>}</div>;
  return <section className={view==="crisis"?"incident-dossier ic-crisis":"incident-dossier"} aria-label={row.title} data-incident-id={row.id}>
    <header className="ic-case-head"><small>{row.code} · {label(row.category)}</small>
      {user.role==="Admin"&&["declared","triage"].includes(row.status)&&<div className="ic-case-cancel"><WorkflowCancelButton key={row.id+row.updatedAt} endpoint="/api/incidents" id={row.id} revision={row.updatedAt} label={row.code} tr={tr} onSaved={onCancelSaved}/></div>}
      <h3 tabIndex={-1}>{row.title}</h3>
      <div className="ic-badges"><span className={`incident-badge ${row.severity}`}>{label(row.severity)}</span>
        <span className={`incident-state ${row.status}`}>{label(row.status)}</span>
        <NotificationClock row={row} tr={tr} now={now}/>{hasIncidentBreach(row)&&<span className="ic-breach">{label(row.attention)}</span>}</div>
    </header>
    {view!=="crisis"&&roles}
    <div className="ic-views" role="group" aria-label={tr?"Dosya görünümleri":"Case views"}>{tabs.map(([key,name])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>changeView(key)}>{name}</button>)}</div>
    {view==="summary"&&<div className="ic-summary">
      {impact}{notification}
      <dl className="ic-facts">
        <div><dt>{tr?"Etkilenen varlıklar":"Affected assets"}</dt><dd><RelatedRecords module="Varlık Envanteri" refs={row.assetRefs}/></dd></div>
        <div><dt>{tr?"İş etki analizi":"Business impact analysis"}</dt><dd><RelatedRecords module="BIA" refs={row.biaRef}/></dd></div>
        {row.vendorRef&&<div><dt>{tr?"Tedarikçi":"Vendor"}</dt><dd><RelatedRecords module="Tedarikçiler" refs={row.vendorRef}/></dd></div>}
        {row.riskRef&&<div><dt>{tr?"Bağlı risk":"Linked risk"}</dt><dd><RelatedRecords module="Risk Assessment" refs={row.riskRef}/></dd></div>}
      </dl>
      <details className="ic-context" open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary>{tr?"Olay ayrıntıları":"Incident details"}</summary>
        <p>{row.description}</p><dl className="ic-facts">
          <div><dt>{tr?"Tespit tarihi":"Detected"}</dt><dd>{row.detectedDate}</dd></div>
          <div><dt>{tr?"Müdahale / kurtarma hedefi":"Response / recovery target"}</dt><dd>{incidentResponseHours(row.severity)} / {incidentRecoveryHours(row.severity)} {tr?"saat":"hours"}</dd></div>
          <div><dt>{tr?"Veri sınıfı":"Data classification"}</dt><dd>{label(row.dataClassification)}</dd></div>
          <div><dt>{tr?"Kişisel veri":"Personal data"}</dt><dd>{row.personalData?(tr?"Etkilenmiş olabilir":"May be affected"):(tr?"İşaretlenmedi":"Not marked")}</dd></div>
          <div><dt>{tr?"Yeniden açılma":"Reopens"}</dt><dd>{row.reopenCount}</dd></div>
        </dl>{row.rootCause&&<p><strong>{tr?"Kök neden":"Root cause"}</strong> · {row.rootCause}</p>}{row.lessonsLearned&&<p><strong>{tr?"Çıkarılan dersler":"Lessons learned"}</strong> · {row.lessonsLearned}</p>}
        {detailsOpen&&<CurrentRecordTrail module="Güvenlik Olayları" kind="incident" recordRef={row.id}/>}
      </details>
    </div>}
    {view==="crisis"&&<CommandBoard row={row} tr={tr} now={now} user={user} disabled={disabled} notification={notification}/>}
    {view==="evidence"&&editable&&<div className="ic-evidence-action"><button type="button" disabled={disabled} onClick={()=>setModal("evidence")}>+ {tr?"Müdahale Kanıtı Ekle":"Add response evidence"}</button></div>}
    {modal&&<CrisisActionDialog mode={modal} row={row} tr={tr} close={()=>setModal(null)} refresh={reload}/>}
    {view!=="crisis"&&<IncidentHistoryPanel key={row.id+":"+row.updatedAt} id={row.id} tr={tr} view={view} showEvidence={()=>changeView("evidence")}/>}
    {view==="summary"&&op&&<footer className="ic-next"><div><small>{tr?"Sıradaki adım":"Next step"}</small>
      <b>{row.status==="closed"?(tr?"Olay kapalı":"Incident closed"):allowed?(tr?"Karar ve gerekçesi dosyaya kaydedilir.":"The decision and its rationale are recorded in the case."):actionLabel}</b></div>
      {allowed&&<button className="primary" disabled={disabled} onClick={()=>needsNotice?setModal("notice"):onAction(row)}>{needsNotice?(tr?"Önce bildirim kararını kaydet":"Record notification decision first"):actionLabel}</button>}</footer>}
  </section>;
}
