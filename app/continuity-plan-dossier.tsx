"use client";

import {useContext, useState, type ReactNode} from "react";
import type {ContinuityPlan} from "./continuity/plan";
import {ModuleTrailContext} from "./module-record-trail-view";
import {resolveCoreRecord} from "./core-record-focus";
import {navigateToFornost} from "./navigation-focus";
import {useWorkflowRecords} from "./use-workflow-records";
import NavIcon from "./nav-icon";
import "./continuity-plan-dossier.css";

type Plan = Pick<ContinuityPlan, "id"|"name"|"code"|"process"|"biaRef"|"status"|"owner"|"reviewer"|"crisisLead"|"mtpdHours"|"rtoHours"|"rpoHours">;
type Dossier = {
  latest: {id:string; code:string; type:string; completedAt:string|null; scheduledDate:string; outcome:string|null; actualRecoveryHours:number|null; actualDataLossHours:number|null} | null;
  gaps: {id:string; title:string; owner:string; dueDate:string}[];
  hasMore: boolean;
};
const pageSize = 20;

function Duration({hours,tr}:{hours:number|null;tr:boolean}) {
  if (hours === null || !Number.isFinite(hours)) return <>—</>;
  const minutes = hours > 0 && hours < 1;
  const value = minutes ? hours*60 : hours;
  return <>{new Intl.NumberFormat(tr?"tr-TR":"en",{maximumFractionDigits:3}).format(value)} {minutes?(tr?"dk":"min"):(tr?"saat":"h")}</>;
}

function PlanResults({plan,tr,text,openExercise,openGap}:{
  plan:Plan; tr:boolean; text:(key:string)=>string; openExercise:(id:string)=>void; openGap:(id:string)=>void;
}) {
  const [page,setPage]=useState(0);
  const resource=useWorkflowRecords<Dossier>(`/api/continuity?view=dossier&planId=${encodeURIComponent(plan.id)}&page=${page}`,null);
  if(resource.error) return <p role="alert">{tr?"Tatbikat ve aksiyonlar yüklenemedi.":"Exercise results and actions could not be loaded."} <button type="button" onClick={()=>void resource.reload()}>{tr?"Tekrar dene":"Retry"}</button></p>;
  if(!resource.ready || !resource.data) return <p role="status">{tr?"Tatbikat ve aksiyonlar yükleniyor…":"Loading exercise results and actions…"}</p>;
  const {latest,gaps,hasMore}=resource.data;
  const date=(value:string)=>Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(value)) : "—";
  const measures=[
    {label:tr?"Kurtarma süresi (RTO)":"Recovery time (RTO)",target:plan.rtoHours,actual:latest?.actualRecoveryHours??null},
    {label:tr?"Veri kaybı (RPO)":"Data loss (RPO)",target:plan.rpoHours,actual:latest?.actualDataLossHours??null},
  ];
  return <>
    <section className="cpd-exercise">
      <header><h4><NavIcon module="Kanıt Otomasyonu"/>{tr?"Son tamamlanan tatbikat":"Last completed exercise"}</h4>
        {latest && <button type="button" className="continuity-link" onClick={()=>openExercise(latest.id)}>{latest.code} ›</button>}
      </header>
      {latest ? <p>{date(latest.completedAt||latest.scheduledDate)} · {text(latest.type)}{latest.outcome && " · "+text(latest.outcome)}</p>
        : <p>{tr?"Bu plan için henüz tamamlanmış tatbikat yok.":"No exercise has been completed for this plan yet."}</p>}
      <table aria-label={tr?"Hedef ve gerçekleşen süreler":"Recovery targets and actuals"}>
        <thead><tr>{(tr?["Ölçüt","Hedef","Gerçekleşen","Sonuç"]:["Measure","Target","Actual","Result"]).map(s=><th key={s} scope="col">{s}</th>)}</tr></thead>
        <tbody>{measures.map(({label,target,actual})=><tr key={label}>
          <th scope="row">{label}</th><td><Duration hours={target} tr={tr}/></td><td><Duration hours={actual} tr={tr}/></td>
          <td>{actual===null ? (tr?"Ölçülmedi":"Not measured") : actual>target ?
            <span className="cpd-breach"><Duration hours={actual-target} tr={tr}/> {tr?"aşım":"over target"}</span> :
            <span className="cpd-met">{tr?"Hedef içinde":"Within target"}</span>}</td>
        </tr>)}</tbody>
      </table>
    </section>
    <section className="cpd-gaps"><h4>{tr?"Açık iyileştirme aksiyonları":"Open improvement actions"}</h4>
      {!gaps.length && <p>{page>0?(tr?"Bu sayfada açık aksiyon yok.":"No open actions on this page."):(tr?"Bu plan için açık aksiyon yok.":"No open actions for this plan.")}</p>}
      {gaps.map(gap=><div className="cpd-gap" key={gap.id}>
        <button className="continuity-link" type="button" onClick={()=>openGap(gap.id)}>{gap.title}</button><span>{gap.owner} · {gap.dueDate?date(gap.dueDate):"—"}</span>
      </div>)}
      {(page>0 || hasMore) && <div className="continuity-actions"><button type="button" disabled={page===0} onClick={()=>setPage(page-1)}>{tr?"Önceki":"Previous"}</button>
        {gaps.length>0 && <span>{page*pageSize+1}–{page*pageSize+gaps.length}</span>}<button type="button" disabled={!hasMore} onClick={()=>setPage(page+1)}>{tr?"Sonraki":"Next"}</button></div>}
    </section>
  </>;
}

export default function ContinuityPlanDossier({plans,tr,text,actions,empty,openExercise,openGap}:{
  plans:Plan[]; tr:boolean; text:(key:string)=>string; actions:(plan:Plan)=>ReactNode; empty:ReactNode;
  openExercise:(id:string)=>void; openGap:(id:string)=>void;
}) {
  const [selection,setSelection]=useState("");
  const selected=plans.find(p=>p.id===selection)??plans[0];
  const context=useContext(ModuleTrailContext);
  const bia=selected && context && resolveCoreRecord(context.rows,{module:"BIA",kind:"record",ref:selected.biaRef});
  const biaLabel=bia?[bia.code||bia.id,bia.data.process].filter(Boolean).join(" · "):selected?.biaRef;
  return <div className="cpd-workspace">
    <section className="cpd-index" aria-label={tr?"Plan listesi":"Plan list"}>
      <h3>{tr?"Plan dosyası":"Plan dossier"} <small>{plans.length}</small></h3>
      <div>{plans.map(plan=><button key={plan.id} type="button" aria-pressed={selected?.id===plan.id} onClick={()=>setSelection(plan.id)}>
        <NavIcon module="Politika Merkezi"/><span><strong>{plan.code}</strong>{plan.name}</span></button>)}</div>
    </section>
    {selected ? <article className="cpd-file" aria-label={selected.name}>
      <header><h3>{selected.name}</h3><span>{selected.code} · {text(selected.status)}</span></header>
      <dl className="cpd-facts"><div><dt>BIA</dt><dd>{bia?<button type="button" className="continuity-link" onClick={()=>navigateToFornost({module:"BIA",kind:"record",ref:bia.id})}>{biaLabel} ›</button>:biaLabel||"—"}</dd></div>
        <div><dt>{tr?"Plan sahibi":"Plan owner"}</dt><dd>{selected.owner}</dd></div>
        <div><dt>MTPD</dt><dd><Duration hours={selected.mtpdHours} tr={tr}/></dd></div></dl>
      <PlanResults key={selected.id} plan={selected} tr={tr} text={text} openExercise={openExercise} openGap={openGap}/>
      <footer>{actions(selected)}</footer>
    </article> : <div className="cpd-placeholder">{empty}</div>}
  </div>;
}
