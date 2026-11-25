"use client";
import { useState, type FormEvent } from 'react';
import { withBasePath } from './base-path';
import { useWorkflowRecords } from './use-workflow-records';
import { workflowSelectionMessage } from './workflow-selection-fields';
import { ThirdPartyFindingHistoryDisclosure } from './third-party-finding-history';
import { FINDING_DEADLINE_PHRASE, type FindingDeadlineContext } from './third-party-risk/finding-deadline';
import { findingStatusLabel } from './third-party-risk/finding-history';
import { validReviewDate } from './third-party-risk/review-schedule';

export function ThirdPartyFindingDeadline({findingId,tr,busy,setBusy,refresh,close,completed}:{findingId:string;tr:boolean;busy:boolean;setBusy:(value:boolean)=>void;refresh:()=>Promise<unknown>;close:()=>void;completed:()=>void}) {
  const resource=useWorkflowRecords<FindingDeadlineContext>(`/api/third-party-risk?view=finding-deadline-context&findingId=${encodeURIComponent(findingId)}`,null);
  const [source,setSource]=useState<FindingDeadlineContext|null>(null),[nextDate,setNextDate]=useState(''),[note,setNote]=useState(''),[confirmation,setConfirmation]=useState(''),[notice,setNotice]=useState('');
  const current=resource.ready&&resource.data?.finding?.id===findingId?resource.data:null,inspected=source||current,stale=Boolean(source&&current&&source.token!==current.token);
  const ready=Boolean(current&&inspected&&current.canSchedule&&!stale&&validReviewDate(nextDate)&&nextDate>=current.today&&nextDate!==current.finding.dueDate&&note.trim().length>=20&&note.length<=1200&&confirmation===FINDING_DEADLINE_PHRASE);
  const freeze=()=>setSource(previous=>previous||current);
  async function submit(event:FormEvent) {
    event.preventDefault();if(!ready||!inspected||busy)return;
    setBusy(true);setNotice('');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let saved=false;
    try {
      const response=await fetch(withBasePath('/api/third-party-risk'),{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:'reschedule-finding',findingId,contextToken:inspected.token,nextDate,note,confirmation})});
      const result=await response.json();saved=response.ok&&result.ok===true;
      if(!saved)setNotice(workflowSelectionMessage(result.code,tr)||(tr?'Termin kaydedilemedi. Güncel kaydı, tarihi ve yetkinizi kontrol edin; taslağınız korunuyor.':'The deadline was not recorded. Check the current record, date and your access; your draft is retained.'));
    } catch {setNotice(tr?'İşlemin sonucu doğrulanamadı. Yeniden kaydetmeden önce güncel termini ve geçmişi kontrol edin; taslağınız korunuyor.':'The outcome could not be confirmed. Check the current deadline and history before saving again; your draft is retained.');}
    finally {clearTimeout(timeout);setConfirmation('');await Promise.allSettled([resource.reload(),refresh()]);setBusy(false);}
    if(saved)completed();
  }
  return <form className="tprm-form tprm-finding-deadline" onSubmit={submit}>
    <div className="wide tprm-decision-context">
      <p>{tr?'Bulgu için gerekçeli yeni bir termin belirleyin. Bu işlem bulguyu kapatmaz; önceki gecikme, iade notu ve kanıtlar geçmişte korunur.':'Set a reasoned new deadline for the finding. This does not close it; prior lateness, return feedback and evidence remain retained.'}</p>
      <button type="button" disabled={busy||resource.loading} onClick={()=>void resource.reload()}>{tr?'Bulguyu yenile':'Refresh finding'}</button>
      {resource.loading&&<p role="status">{tr?'Bulgu yükleniyor…':'Loading finding…'}</p>}
      {!resource.loading&&!current&&<p role="alert">{tr?'Bulgu yüklenemedi. Yenileyerek tekrar deneyin; taslağınız korunuyor.':'The finding could not be loaded. Refresh to try again; your draft is retained.'}</p>}
      {current&&<section aria-label={tr?'Güncel bulgu':'Current finding'}><h3>{current.finding.title}</h3><p>{current.profile.name} · {tr?'Döngü':'Cycle'} #{current.cycleNumber}</p><dl>
        <div><dt>{tr?'Durum / önem':'Status / severity'}</dt><dd>{findingStatusLabel(current.finding.status,tr)} · {current.finding.severity}</dd></div>
        <div><dt>{tr?'Bulgu sahibi':'Finding owner'}</dt><dd>{current.finding.owner}</dd></div>
        <div><dt>{tr?'İncelemeci':'Reviewer'}</dt><dd>{current.profile.reviewer}</dd></div>
        <div><dt>{tr?'Güncel termin':'Current deadline'}</dt><dd>{current.finding.dueDate}</dd></div>
        <div><dt>{tr?'Sözleşme bitişi':'Contract end'}</dt><dd>{current.profile.contractEnd}</dd></div>
      </dl>{current.finding.actionNote&&<p className="tprm-finding-note"><b>{tr?'Son işlem notu':'Latest action note'}: </b>{current.finding.actionNote}</p>}</section>}
      {current&&!current.canSchedule&&<p role="alert">{tr?'Termin değişikliği güncel durum veya atamanız için kullanılamıyor.':'Deadline planning is unavailable for the current state or your assignment.'}</p>}
      {stale&&<div role="alert"><p>{tr?'İncelediğiniz bulgu, tedarikçi veya değerlendirme değişti. Güncel bilgileri inceleyip sürümü açıkça kullanın. Girdiğiniz tarih ve gerekçe korunur.':'The inspected finding, supplier or assessment changed. Review and explicitly use the current version. Your proposed date and reason are retained.'}</p><p>{tr?'İncelenen termin':'Inspected deadline'}: {source?.finding.dueDate}</p><button type="button" disabled={busy} onClick={()=>{setSource(current);setConfirmation('');setNotice('')}}>{tr?'Güncel sürümü kullan':'Use current version'}</button></div>}
      {notice&&<p role="alert">{notice}</p>}
    </div>
    <fieldset className="wide tprm-correction-fields" disabled={busy||!current||!current.canSchedule}>
      <legend>{tr?'Yeni termin planı':'New deadline plan'}</legend>
      <label>{tr?'Yeni termin':'New deadline'}<input type="date" required min={current?.today} value={nextDate} onChange={event=>{freeze();setNextDate(event.target.value)}}/></label>
      <label className="wide">{tr?'Termin değişikliği gerekçesi':'Deadline change reason'}<textarea aria-label={tr?'Termin değişikliği gerekçesi':'Deadline change reason'} required minLength={20} maxLength={1200} rows={3} value={note} onChange={event=>{freeze();setNote(event.target.value)}}/></label>
      <label className="wide">{tr?'Onay ifadesi':'Confirmation phrase'}: <strong>{FINDING_DEADLINE_PHRASE}</strong><input required autoComplete="off" value={confirmation} onChange={event=>{freeze();setConfirmation(event.target.value)}}/></label>
    </fieldset>
    <footer className="wide"><button type="button" disabled={busy} onClick={close}>{tr?'Vazgeç':'Cancel'}</button><button type="submit" disabled={busy||!ready}>{tr?'Yeni termini kaydet':'Save new deadline'}</button></footer>
    <ThirdPartyFindingHistoryDisclosure key={current?.token||'loading'} findingId={findingId} tr={tr}/>
  </form>;
}
