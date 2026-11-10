"use client";
import {useContext, useState} from "react";
import {CurrentRecordTrail, ModuleTrailContext} from "../module-record-trail-view";
import {resolveCoreRecord} from "../core-record-focus";
import {navigateToFornost} from "../navigation-focus";
import {incidentRecoveryHours, incidentResponseHours} from "./domain";
import {incidentLabel} from "./labels";
import {incidentDecisionAvailable, incidentNextAction} from "./decisions";
import IncidentHistoryPanel from "./history-panel";

export type Incident = {
  id: string; code: string; title: string; category: string; severity: string; detectedDate: string;
  description: string; businessImpact: string; owner: string; declaredBy: string; commander: string;
  reviewer: string; assetRefs: string; riskRef?: string; biaRef?: string; dataClassification: string;
  personalData: boolean; status: string; rootCause?: string; lessonsLearned?: string;
  notificationDecision: string; notificationRationale?: string; reopenCount: number; attention: string; updatedAt: string;
};
export const hasIncidentBreach = (row: Incident) => row.attention === "response-breach" || row.attention === "recovery-breach";
export function matchesIncident(row: Incident, filter: string, query: string, lang: "tr"|"en") {
  const inScope = filter === "all" || (filter === "active" && row.status !== "closed") ||
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
    const row = context && context.coreState === "ready" && resolveCoreRecord(context.rows,{module,kind:"record",ref});
    if (!row) return <span key={ref}>{ref}</span>;
    const name = row.data.title || row.data.process || row.data.name || row.code || ref;
    return <button className="ic-link" key={ref} onClick={()=>navigateToFornost({module,kind:"record",ref:row.id})}>{String(name)}</button>;
  })}</div>;
}

type View = "summary"|"evidence"|"history"|"crisis";
export function IncidentDossier({row,lang,user,disabled,onAction}:{
  row: Incident; lang: "tr"|"en"; user: {role:string;email:string}; disabled:boolean;
  onAction:(row:Incident)=>void;
}) {
  const tr=lang==="tr";
  const [view,setView]=useState<View>("summary");
  const [detailsOpen,setDetailsOpen]=useState(false);
  const changeView=(next:View)=>{setView(next);};
  const label=(s:string)=>incidentLabel(s,lang);
  const op=incidentNextAction[row.status];
  const actionLabel=op==="triage"?(tr?"Ön incelemeyi başlat":"Start triage"):op==="review"?(tr?"İncelemeye gönder":"Submit for review"):label(op);
  const allowed=incidentDecisionAvailable({record:{status:row.status,owner:row.owner,commander:row.commander,reviewer:row.reviewer,declared_by:row.declaredBy},revision:""},op,user);
  const tabs: [View,string][]=[["summary",tr?"Özet":"Summary"],["evidence",tr?"Kanıtlar":"Evidence"],["history",tr?"Karar geçmişi":"Decision history"],["crisis",tr?"Kriz özeti":"Crisis brief"]];
  const roles=<dl className="ic-roles">{[[tr?"Olay sahibi":"Incident owner",row.owner],[tr?"Olay yöneticisi":"Incident commander",row.commander],[tr?"Bağımsız inceleyen":"Independent reviewer",row.reviewer]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
  const impact=<div className="ic-impact"><strong>{tr?"İş etkisi":"Business impact"}</strong><p>{row.businessImpact || "—"}</p></div>;
  const notification=<div className="ic-notification"><strong>{tr?"Bildirim kararı":"Notification decision"}</strong><p>{label(row.notificationDecision || "pending")}</p>{row.notificationRationale&&<p>{row.notificationRationale}</p>}</div>;
  return <section className={view==="crisis"?"incident-dossier ic-crisis":"incident-dossier"} aria-label={row.title} data-incident-id={row.id}>
    <header className="ic-case-head"><small>{row.code} · {label(row.category)}</small>
      <h3 tabIndex={-1}>{row.title}</h3>
      <div className="ic-badges"><span className={`incident-badge ${row.severity}`}>{label(row.severity)}</span>
        <span className={`incident-state ${row.status}`}>{label(row.status)}</span>
        {hasIncidentBreach(row)&&<span className="ic-breach">{label(row.attention)}</span>}</div>
    </header>
    {view!=="crisis"&&roles}
    <div className="ic-views" role="group" aria-label={tr?"Dosya görünümleri":"Case views"}>{tabs.map(([key,name])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>changeView(key)}>{name}</button>)}</div>
    {view==="summary"&&<div className="ic-summary">
      {impact}
      <dl className="ic-facts">
        <div><dt>{tr?"Etkilenen varlıklar":"Affected assets"}</dt><dd><RelatedRecords module="Varlık Envanteri" refs={row.assetRefs}/></dd></div>
        <div><dt>{tr?"İş etki analizi":"Business impact analysis"}</dt><dd><RelatedRecords module="BIA" refs={row.biaRef}/></dd></div>
        {row.riskRef&&<div><dt>{tr?"Bağlı risk":"Linked risk"}</dt><dd><RelatedRecords module="Risk Assessment" refs={row.riskRef}/></dd></div>}
      </dl>
      <details className="ic-context" open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary>{tr?"Olay ayrıntıları":"Incident details"}</summary>
        <p>{row.description}</p><dl className="ic-facts">
          <div><dt>{tr?"Tespit tarihi":"Detected"}</dt><dd>{row.detectedDate}</dd></div>
          <div><dt>{tr?"Müdahale / kurtarma hedefi":"Response / recovery target"}</dt><dd>{incidentResponseHours(row.severity)} / {incidentRecoveryHours(row.severity)} {tr?"saat":"hours"}</dd></div>
          <div><dt>{tr?"Veri sınıfı":"Data classification"}</dt><dd>{label(row.dataClassification)}</dd></div>
          <div><dt>{tr?"Kişisel veri":"Personal data"}</dt><dd>{row.personalData?(tr?"Etkilenmiş olabilir":"May be affected"):(tr?"İşaretlenmedi":"Not marked")}</dd></div>
          <div><dt>{tr?"Yeniden açılma":"Reopens"}</dt><dd>{row.reopenCount}</dd></div>
        </dl>{row.rootCause&&<p><strong>{tr?"Kök neden":"Root cause"}</strong> · {row.rootCause}</p>}{row.lessonsLearned&&<p><strong>{tr?"Çıkarılan dersler":"Lessons learned"}</strong> · {row.lessonsLearned}</p>}{notification}
        {detailsOpen&&<CurrentRecordTrail module="Güvenlik Olayları" kind="incident" recordRef={row.id}/>}
      </details>
    </div>}
    {view==="crisis"&&<div className="ic-brief"><div>{impact}{roles}{notification}</div></div>}
    <IncidentHistoryPanel key={row.id+":"+row.updatedAt} id={row.id} tr={tr} view={view} showEvidence={()=>changeView("evidence")}/>
    {view==="summary"&&op&&<footer className="ic-next"><div><small>{tr?"Sıradaki adım":"Next step"}</small>
      <b>{row.status==="closed"?(tr?"Olay kapalı":"Incident closed"):allowed?(tr?"Karar ve gerekçesi dosyaya kaydedilir.":"The decision and its rationale are recorded in the case."):actionLabel}</b></div>
      {allowed&&<button className="primary" disabled={disabled} onClick={()=>onAction(row)}>{actionLabel}</button>}</footer>}
  </section>;
}
