"use client";
import { useState, type FormEvent } from 'react';
import { withBasePath } from './base-path';
import { useWorkflowRecords } from './use-workflow-records';
import { WorkflowPersonPicker, workflowSelectionMessage } from './workflow-selection-fields';
import { canReassignReviewer, HANDOFF_CONFIRMATION, type ReviewerContext, type ReviewerHistory, type ReviewerWorkCounts } from './third-party-risk/reviewer-handoff';

function WorkCounts({counts,tr}:{counts:ReviewerWorkCounts;tr:boolean}) {
  return <dl><div><dt>{tr?'Aktif değerlendirmeler':'Active assessments'}</dt><dd>{counts.activeAssessments} · {tr?'inceleme bekleyen':'awaiting review'}: {counts.submittedAssessments}</dd></div><div><dt>{tr?'Açık bulgular':'Open findings'}</dt><dd>{counts.openFindings} · {tr?'doğrulama bekleyen':'awaiting verification'}: {counts.verificationFindings}</dd></div></dl>;
}

export function ThirdPartyReviewerHandoff({vendorId,tr,busy,setBusy,refresh,close,completed}:{vendorId:string;tr:boolean;busy:boolean;setBusy:(value:boolean)=>void;refresh:()=>Promise<unknown>;close:()=>void;completed:()=>void}) {
  const resource=useWorkflowRecords<ReviewerContext>(`/api/third-party-risk?view=reviewer-context&vendorId=${encodeURIComponent(vendorId)}`,null);
  const [source,setSource]=useState<ReviewerContext|null>(null),[reviewer,setReviewer]=useState(''),[note,setNote]=useState(''),[confirmation,setConfirmation]=useState(''),[notice,setNotice]=useState('');
  const current=resource.ready&&resource.data?.vendorId===vendorId&&resource.data.counts&&Array.isArray(resource.data.exclusions)?resource.data:null;
  const inspected=source||current,stale=Boolean(source&&current&&source.token!==current.token),excluded=current?.exclusions.some(email=>email.toLowerCase()===reviewer.toLowerCase());
  const ready=Boolean(current&&inspected&&!stale&&canReassignReviewer(current.status,'Admin')&&!excluded&&reviewer&&note.trim().length>=20&&note.trim().length<=1200&&confirmation===HANDOFF_CONFIRMATION);
  const freeze=()=>setSource(previous=>previous||current);
  async function submit(event:FormEvent) {
    event.preventDefault();if(!ready||!inspected||busy)return;
    setBusy(true);setNotice('');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    let saved=false;
    try {
      const response=await fetch(withBasePath('/api/third-party-risk'),{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'reassign-reviewer',vendorId,assignmentMode:'directory',reviewer,note,confirmation,expectedRevision:inspected.revision,previousReviewer:inspected.reviewer,contextToken:inspected.token})});
      const result=await response.json();saved=response.ok&&result.ok===true;
      if(!saved)setNotice(workflowSelectionMessage(result.code,tr)||(result.code==='TPRM_REVIEWER_ACCESS'?(tr?'Devir için etkin bir Admin ve aktif tedarikçi gerekli.':'An active Admin and an active supplier are required for handoff.'):(tr?'Devir kaydedilemedi. Güncel atamayı ve açık işleri kontrol edin; taslağınız korunuyor.':'The handoff was not recorded. Check the current assignment and open work; your draft is retained.')));
    } catch { setNotice(tr?'İşlemin sonucu doğrulanamadı. Güncel atamayı kontrol edin; taslağınız korunuyor.':'The outcome could not be confirmed. Check the current assignment; your draft is retained.'); }
    finally { clearTimeout(timeout);await Promise.allSettled([resource.reload(),refresh()]);setBusy(false); }
    if(saved)completed();
  }
  return <form className="tprm-form tprm-reviewer-handoff" onSubmit={submit}>
    <div className="wide tprm-decision-context">
      <p>{tr?'İncelemeci sorumluluğunu devredin. Mevcut kararlar, kanıtlar ve tarihler korunur; açık inceleme ve doğrulama işleri yeni kişiye geçer.':'Transfer reviewer responsibility. Existing decisions, evidence and dates are retained; open review and verification work moves to the new reviewer.'}</p>
      <button type="button" disabled={busy||resource.loading} onClick={()=>void resource.reload()}>{tr?'Atamayı ve işleri yenile':'Refresh assignment and work'}</button>
      {resource.loading&&<p role="status">{tr?'Atama ve açık işler yükleniyor…':'Loading assignment and open work…'}</p>}
      {!resource.loading&&!current&&<p role="alert">{tr?'Atama bağlamı yüklenemedi. Çok fazla açık iş veya erişim sorunu olabilir. Yenileyin; devam ederse yöneticinize başvurun. Taslağınız korunuyor.':'Assignment context could not be loaded. There may be too much open work or an access problem. Refresh; if it persists, contact your administrator. Your draft is retained.'}</p>}
      {current&&<section aria-label={tr?'Güncel atama':'Current assignment'}><h3>{current.name}</h3><p>{tr?'Mevcut incelemeci':'Current reviewer'}: <strong>{current.reviewer}</strong></p><WorkCounts counts={current.counts} tr={tr}/></section>}
      {current&&!canReassignReviewer(current.status,'Admin')&&<p role="alert">{tr?'Bu tedarikçi incelemeci devrine kapalı.':'This supplier is closed to reviewer handoff.'}</p>}
      {stale&&<div role="alert"><p>{tr?'İncelediğiniz atama veya açık işler değişti. Güncel sürümü kullanmadan kaydedemezsiniz.':'The inspected assignment or open work changed. Use the current version before saving.'}</p><p>{tr?'İncelenen incelemeci':'Inspected reviewer'}: {source?.reviewer}</p><button type="button" disabled={busy} onClick={()=>{setSource(current);setConfirmation('');setNotice('')}}>{tr?'Güncel sürümü kullan':'Use current version'}</button></div>}
      {notice&&<p role="alert">{notice}</p>}
    </div>
    <fieldset className="workflow-evidence wide" disabled={busy||!current}>
      <legend>{tr?'Yeni bağımsız incelemeci':'New independent reviewer'}</legend>
      <p>{tr?'Kendinizi, mevcut incelemeciyi, tedarikçi sahiplerini veya açık işlere katkı veren kişileri seçemezsiniz. Etkin bir Admin seçin.':'Choose an active Admin. You, the current reviewer, supplier owners and contributors to open work cannot be selected.'}</p>
      <WorkflowPersonPicker tr={tr} reviewer label={tr?'Yeni incelemeci':'New reviewer'} value={reviewer} exclude={current?.exclusions||[]} onChange={value=>{freeze();setReviewer(value)}}/>
      {excluded&&<p role="alert">{tr?'Seçilen kişi güncel işler için bağımsız değil. Başka bir incelemeci seçin.':'The selected person is not independent of the current work. Choose another reviewer.'}</p>}
      <label>{tr?'Devir gerekçesi':'Handoff reason'}<textarea aria-label={tr?'Devir gerekçesi':'Handoff reason'} required minLength={20} maxLength={1200} rows={3} value={note} onChange={event=>{freeze();setNote(event.target.value)}}/></label>
      <label>{tr?'Onay ifadesi':'Confirmation phrase'}: <strong>{HANDOFF_CONFIRMATION}</strong><input required autoComplete="off" value={confirmation} onChange={event=>{freeze();setConfirmation(event.target.value)}}/></label>
    </fieldset>
    <footer className="wide"><button type="button" disabled={busy} onClick={close}>{tr?'Vazgeç':'Cancel'}</button><button type="submit" disabled={busy||!ready}>{tr?'Devri kaydet':'Save handoff'}</button></footer>
  </form>;
}

export function ThirdPartyReviewerHistory({vendorId,tr}:{vendorId:string;tr:boolean}) {
  const [open,setOpen]=useState(false);
  return <details className="workflow-evidence-history tprm-reviewer-history" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{tr?'İncelemeci devir geçmişi':'Reviewer handoff history'}</summary>{open&&<HistoryPage vendorId={vendorId} tr={tr}/>}</details>;
}
function HistoryPage({vendorId,tr}:{vendorId:string;tr:boolean}) {
  const [page,setPage]=useState(0),resource=useWorkflowRecords<ReviewerHistory>(`/api/third-party-risk?view=reviewer-history&vendorId=${encodeURIComponent(vendorId)}&page=${page}`,null);
  const data=resource.ready&&resource.data?.vendorId===vendorId&&resource.data.page===page&&Array.isArray(resource.data.rows)?resource.data:null;
  return <><button type="button" disabled={resource.loading} onClick={()=>void resource.reload()}>{tr?'Geçmişi yenile':'Refresh history'}</button>
    {resource.loading?<p role="status">{tr?'Devir geçmişi yükleniyor…':'Loading handoff history…'}</p>:!data?<p role="alert">{tr?'Devir geçmişi yüklenemedi. Yenileyerek tekrar deneyin.':'Handoff history could not be loaded. Refresh to try again.'}</p>:<>
      {!data.rows.length&&<p>{tr?'Kaydedilmiş incelemeci devri yok.':'No recorded reviewer handoff.'}</p>}
      {data.rows.map(row=><div key={row.id}>{row.detail?<><strong>{row.detail.previousReviewer} → {row.detail.reviewer}</strong><span>{row.detail.note}</span><WorkCounts counts={row.detail.counts} tr={tr}/></>:<span>{tr?'Bu tarihsel kaydın ayrıntıları okunamadı.':'The details of this historical record could not be read.'}</span>}<span>{tr?'Atayan':'Assigned by'}: {row.actor}</span><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(tr?'tr-TR':'en-GB')}</time></div>)}<p>{tr?'Sayfa':'Page'} {page+1}</p>
    </>}<div className="workflow-choice-pages">{page>0&&<button type="button" disabled={resource.loading} onClick={()=>setPage(page-1)}>{tr?'Önceki 50':'Previous 50'}</button>}{data?.hasMore&&<button type="button" onClick={()=>setPage(page+1)}>{tr?'Sonraki 50':'Next 50'}</button>}</div></>;
}
