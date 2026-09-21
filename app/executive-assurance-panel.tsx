"use client";

import {useEffect,useState} from "react";
import {buildExecutiveAssurance} from "./executive-assurance";
import type {AssuranceRow} from "./control-assurance";
import {withBasePath} from "./base-path";
import "./executive-assurance.css";

type Operations={summary:{openEscalations:number;critical:number;high:number;unacknowledged:number;ownerless:number;ownerCoverage:number;overdueRiskReviews:number;mandatoryRetests:number;retestFailures:number;oldestOpenAgeDays:number;queuedNotifications:number};routes:{owner:number;governance:number}};

export default function ExecutiveAssurancePanel({rows,lang,go}:{rows:AssuranceRow[];lang:"tr"|"en";go:(module:string)=>void}){
 const tr=lang==="tr",assurance=buildExecutiveAssurance(rows),[operations,setOperations]=useState<Operations|null>(null);
 useEffect(()=>{let live=true;fetch(withBasePath("/api/continuous-assurance/executive"),{cache:"no-store",headers:{accept:"application/json"}}).then(response=>response.ok?response.json():null).then(data=>{if(live&&data)setOperations(data)}).catch(()=>{});return()=>{live=false}},[]);
 const state=assurance.state==="strong"?(tr?"Güçlü":"Strong"):assurance.state==="developing"?(tr?"Gelişiyor":"Developing"):(tr?"Kritik":"Critical");
 const metrics=[
  [assurance.traceabilityScore,tr?"Zincir bütünlüğü":"Chain integrity",`${assurance.completeChains}/${assurance.totalChains} ${tr?"tam":"complete"}`],
  [assurance.controlScore,tr?"Kontrol güvencesi":"Control assurance",tr?"Test + kanıt":"Test + evidence"],
  [assurance.evidenceScore,tr?"Kanıt güveni":"Evidence confidence",`${assurance.currentEvidence}/${assurance.totalEvidence} ${tr?"güncel":"current"}`],
  [assurance.auditScore,tr?"Denetim readiness":"Audit readiness",`${assurance.readyAudits}/${assurance.totalAudits} ${tr?"hazır":"ready"}`],
 ] as const;
 const ops=operations?.summary;
 const auditorPack=()=>window.open(withBasePath(`/api/continuous-assurance/auditor-pack?lang=${lang}`),"_blank","noopener,noreferrer");
 return <section className="executive-assurance-panel">
  <header><div><small>{tr?"BAĞLI GRC GÜVENCE POSTURE":"CONNECTED GRC ASSURANCE POSTURE"}</small><h3>{tr?"Riskten kanıta karar görünümü":"Risk-to-evidence decision view"}</h3><p>{tr?"Kontrol, kanıt, denetim, escalation ve owner accountability zincirini tek yönetici görünümünde ölçer.":"Measures controls, evidence, audits, escalations and owner accountability in one executive view."}</p></div><div className="executive-assurance-actions"><button onClick={auditorPack}>{tr?"Denetçi Paketi":"Auditor Pack"}<span>↗</span></button><button onClick={()=>go("Bağlantılı GRC")}>{tr?"Açıkları incele":"Review gaps"}<span>→</span></button></div></header>
  <div className="executive-assurance-body"><div className={`executive-assurance-score ${assurance.state}`}><small>{tr?"BÜTÜNLEŞİK SKOR":"COMPOSITE SCORE"}</small><strong aria-label={`${assurance.score} out of 100`}>{assurance.score}/100</strong><b>{state}</b><span>{assurance.partialChains} {tr?"kısmi zincir":"partial chains"}</span></div><div className="executive-assurance-metrics">{metrics.map(([value,label,detail])=><article key={label}><div><b>{label}</b><strong>{value}%</strong></div><i><em style={{width:`${value}%`}}/></i><span>{detail}</span></article>)}</div></div>
  {ops&&<div className="executive-assurance-operations" aria-label={tr?"Sürekli güvence yönetici operasyonları":"Continuous assurance executive operations"}>
   <article className={ops.critical?"critical":""}><small>{tr?"Açık escalation":"Open escalations"}</small><b>{ops.openEscalations}</b><span>{ops.critical} {tr?"kritik":"critical"} · {ops.high} {tr?"yüksek":"high"}</span></article>
   <article className={ops.unacknowledged?"attention":""}><small>{tr?"Ack bekleyen":"Unacknowledged"}</small><b>{ops.unacknowledged}</b><span>{tr?`en eski ${ops.oldestOpenAgeDays} gün`:`oldest ${ops.oldestOpenAgeDays} days`}</span></article>
   <article className={ops.ownerless?"attention":""}><small>{tr?"Owner kapsamı":"Owner coverage"}</small><b>{ops.ownerCoverage}%</b><span>{ops.ownerless} {tr?"sahipsiz":"unassigned"}</span></article>
   <article className={ops.overdueRiskReviews?"critical":""}><small>{tr?"Geciken risk review":"Overdue risk review"}</small><b>{ops.overdueRiskReviews}</b><span>{tr?"insan kararı bekliyor":"awaiting human decision"}</span></article>
   <article className={ops.mandatoryRetests+ops.retestFailures?"attention":""}><small>{tr?"Re-test posture":"Re-test posture"}</small><b>{ops.mandatoryRetests}</b><span>{ops.retestFailures} {tr?"başarısız":"failed"}</span></article>
   <article><small>{tr?"Routing kuyruğu":"Routing queue"}</small><b>{ops.queuedNotifications}</b><span>{operations?.routes.owner||0} owner · {operations?.routes.governance||0} governance</span></article>
  </div>}
 </section>;
}
