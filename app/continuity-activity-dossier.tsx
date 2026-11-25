"use client";

import {useState,type ReactNode} from "react";
import {useWorkflowRecords} from "./use-workflow-records";
import {WorkflowEvidenceHistory} from "./workflow-selection-fields";
import {withBasePath} from "./base-path";
import {RecoveryComparison} from "./continuity-plan-dossier";
import NavIcon from "./nav-icon";
import type {ContinuityActivityFile,ContinuityExercise,ContinuityGap,VerificationExercise} from "./continuity/activity-file";

type Selection = {exercise:ContinuityExercise;gap?:never}|{exercise?:never;gap:ContinuityGap};
type Workflow = {
  tr:boolean; text:(key:string)=>string; user:{email:string;role:string};busy:boolean;
  open:(kind:string,id:string)=>void; act:(kind:string,id:string)=>void;
  verify:(gap:ContinuityGap)=>void; close:(id:string,candidates:VerificationExercise[])=>void;
};

function DecisionEvidence({file,id,reference,tr}:{file:ContinuityActivityFile;id:string;reference:string|null;tr:boolean}) {
  const version=file.pins.find(pin=>pin.entityId===id)?.evidence;
  return <>
    {version ? <a className="continuity-link" href={withBasePath("/api/evidence?key="+encodeURIComponent(version.fileKey))} target="_blank" rel="noopener noreferrer">{version.evidenceTitle} · v{version.versionNo}</a>
      : <span>{reference || (tr?"Kanıt kaydı yok":"No evidence recorded")}</span>}
    <WorkflowEvidenceHistory tr={tr} pins={file.pins} entityId={id}/>
  </>;
}

function ActivityDetail({selected,workflow}:{selected:Selection;workflow:Workflow}) {
  const {exercise,gap}=selected;
  const {tr,text,user,busy,open,act,verify,close}=workflow;
  const id=(exercise||gap).id;
  const query=new URLSearchParams({view:"activity",focusKind:exercise?"continuity-exercise":"continuity-gap",focusId:id});
  const result=useWorkflowRecords<ContinuityActivityFile>("/api/continuity?"+query,null);
  if(result.error) return <div className="cpd-placeholder" role="alert">{tr?"Kayıt ayrıntıları yüklenemedi.":"Record details could not be loaded."} <button type="button" onClick={()=>void result.reload()}>{tr?"Tekrar dene":"Retry"}</button></div>;
  if(!result.ready || !result.data) return <p className="cpd-placeholder" role="status">{tr?"Ayrıntılar yükleniyor…":"Loading record details…"}</p>;
  const file=result.data;
  const {plan,source}=file;
  const planLink=plan ? <button className="continuity-link" type="button" onClick={()=>open("continuity-plan",plan.id)}>{plan.code} · {plan.name} ›</button>
    : <span>{tr?"Bağlı plan kullanılamıyor":"Linked plan unavailable"}</span>;
  const canWrite=user.role!=="Viewer";
  if(exercise){
    const completed=exercise.status==="completed";
    const canManage=exercise.status==="planned" && canWrite && (user.role==="Admin"||exercise.facilitator===user.email);
    return <article className="cpd-file" aria-label={exercise.code}>
      <header><h3>{exercise.scenario || exercise.code}</h3><span>{exercise.code} · {text(exercise.type)} · {exercise.scheduledDate} · {text(exercise.status)}{exercise.outcome && " · "+text(exercise.outcome)}</span></header>
      <dl className="cpd-facts"><div><dt>{tr?"Bağlı plan":"Linked plan"}</dt><dd>{planLink}</dd></div>
        <div><dt>{tr?"Tatbikat sorumlusu":"Facilitator"}</dt><dd>{exercise.facilitator}</dd></div></dl>
      <section className="cpd-exercise"><h4>{tr?"Kurtarma hedefleri ve sonuçlar":"Recovery targets and results"}</h4>
        {plan && <RecoveryComparison plan={plan} measurement={completed?source:null} tr={tr}/>}
        {!plan && <p>{tr?"Hedefler kullanılamıyor.":"Recovery targets unavailable."}</p>}
      </section>
      {completed && <section className="cpd-activity-evidence"><h4>{tr?"Sonuç kanıtı":"Result evidence"}</h4>
        <DecisionEvidence file={file} id={id} reference={source?.evidenceReference??null} tr={tr}/>
      </section>}
      <section className="cpd-gaps"><h4>{tr?"İyileştirme açıkları":"Improvement gaps"}</h4>
        {file.gaps.map(item=><div key={item.id} className="cpd-gap"><button className="continuity-link" type="button" onClick={()=>open("continuity-gap",item.id)}>{item.title} ›</button><span>{text(item.status)}</span></div>)}
        {!file.gaps.length && <p>{tr?"Bu tatbikata bağlı iyileştirme açığı yok.":"No improvement gaps linked to this exercise."}</p>}
      </section>
      {canManage && <footer className="continuity-actions">{plan?.status==="active" && <>
        <button type="button" disabled={busy} onClick={()=>act("complete-exercise",id)}>{tr?"Sonuç gir":"Record result"}</button>
        <button type="button" disabled={busy} onClick={()=>act("reschedule-exercise",id)}>{tr?"Tarihi değiştir":"Reschedule"}</button></>}
        <button type="button" disabled={busy} onClick={()=>act("cancel-exercise",id)}>{tr?"İptal et":"Cancel exercise"}</button></footer>}
    </article>;
  }
  const closed=gap.status==="closed";
  const canClose=!closed && user.role==="Admin" && gap.reviewer===user.email && gap.owner!==user.email && file.candidates.length>0;
  const hasEvidence=file.pins.some(pin=>pin.entityId===id)||Boolean(file.closureEvidenceReference);
  return <article className="cpd-file" aria-label={gap.title}>
    <header><h3>{gap.title}</h3><span>{text(gap.status)} · {text(gap.severity)}</span></header>
    <dl className="cpd-facts"><div><dt>{tr?"Sorumlu":"Owner"}</dt><dd>{gap.owner}</dd></div>
      <div><dt>{tr?"Bağımsız inceleyen":"Independent reviewer"}</dt><dd>{gap.reviewer}</dd></div>
      <div><dt>{tr?"Termin":"Due date"}</dt><dd>{gap.dueDate||"—"}</dd></div></dl>
    <section className="cpd-exercise"><h4>{tr?"Kaynak tatbikat":"Source exercise"}</h4>
      {source ? <button type="button" className="continuity-link" onClick={()=>open("continuity-exercise",source.id)}>{source.scheduledDate} · {source.scenario||source.code} ›</button>
        : <p>{tr?"Kaynak tatbikat kullanılamıyor.":"Source exercise unavailable."}</p>}
      <div>{planLink}</div>
      {plan && source && <RecoveryComparison plan={plan} measurement={source} tr={tr}/>}
    </section>
    <section className="cpd-verification"><h4>{tr?"Kapanış doğrulaması":"Closure verification"}</h4>
      <dl><div><dt>{tr?"Başarılı tekrar tatbikatı":"Successful verification exercise"}</dt><dd>
        {file.verification ? <button type="button" className="continuity-link" onClick={()=>open("continuity-exercise",file.verification!.id)}>{file.verification.code} ›</button>
          : closed ? (tr?"Kayıt bulunamadı":"No record found") : file.candidates.length ? (tr?"Seçime hazır":"Available for selection") : (tr?"Bekleniyor":"Pending")}
      </dd></div><div><dt>{tr?"Kapanış kanıtı":"Closure evidence"}</dt><dd>
        {hasEvidence?<DecisionEvidence file={file} id={id} reference={file.closureEvidenceReference} tr={tr}/>:closed?(tr?"Kayıt bulunamadı":"No record found"):(tr?"Bekleniyor":"Pending")}
      </dd></div></dl>
    </section>
    {!closed && canWrite && <footer className="continuity-actions">
      {plan?.status==="active" && <button type="button" disabled={busy} onClick={()=>verify(gap)}>{tr?"Doğrulama planla":"Schedule verification"}</button>}
      {canClose && <button type="button" disabled={busy} onClick={()=>close(id,file.candidates)}>{tr?"Kapat":"Close"}</button>}
    </footer>}
  </article>;
}

export function ContinuityActivityDossier({rows,kind,workflow,empty,refreshing}:{
  rows:ContinuityExercise[]|ContinuityGap[];kind:"exercises"|"gaps";workflow:Workflow;empty:ReactNode;refreshing:boolean;
}) {
  const [selectedId,setSelectedId]=useState("");
  const record=rows.find(row=>row.id===selectedId)??rows[0];
  const {tr,text}=workflow;
  const title=kind==="exercises"?(tr?"Tatbikatlar":"Exercises"):(tr?"İyileştirme açıkları":"Improvement gaps");
  return <div className="cpd-workspace cpd-activities"><section className="cpd-index" aria-label={title}>
    <h3>{title} <small>{rows.length}</small></h3><div>{rows.map(row=>
      <button key={row.id} type="button" aria-pressed={row.id===record?.id} onClick={()=>setSelectedId(row.id)}>
        <NavIcon module={kind==="exercises"?"Kanıt Otomasyonu":"Bulgular ve CAPA"}/>
        <span><strong>{"scenario" in row?(row.scenario||row.code):row.title}</strong>
          {"scheduledDate" in row?row.scheduledDate:row.dueDate} · {text(row.status)}
        </span>
      </button>)}</div>
    </section>
    {record ? !refreshing && <ActivityDetail key={record.id} selected={"scenario" in record?{exercise:record}:{gap:record}} workflow={workflow}/>
      : <div className="cpd-placeholder">{empty}</div>}
  </div>;
}
