"use client";
import { useState, type FormEvent } from 'react';
import { withBasePath } from './base-path';
import { useWorkflowRecords } from './use-workflow-records';
import { workflowSelectionMessage } from './workflow-selection-fields';
import { AssessmentFields, controlLabels } from './third-party-assessment-fields';
import { TPRM_CONTROLS } from './third-party-risk/domain';
import { assessmentDraft, sameAssessmentDraft, CORRECTION_PHRASES, type AssessmentSnapshot, type CorrectionContext, type CorrectionHistory, type CorrectionMode } from './third-party-risk/assessment-correction';

function AssessmentReadout({value,tr}:{value:AssessmentSnapshot;tr:boolean}) {
  return <div className="tprm-assessment-readout"><dl>
    <div><dt>{tr?'Döngü / durum':'Cycle / status'}</dt><dd>#{value.cycleNumber} · {value.status}</dd></div>
    <div><dt>{tr?'Etki / olasılık / olgunluk':'Impact / likelihood / maturity'}</dt><dd>{value.impact} / {value.likelihood} / {value.controlMaturity}</dd></div>
    <div><dt>{tr?'Kapsam / doğal risk / kalıntı risk':'Coverage / inherent risk / residual risk'}</dt><dd>{value.coverage}% · {value.inherentScore} / {value.residualScore} · {value.riskTier}</dd></div>
    <div><dt>{tr?'İyileştirme planı':'Treatment plan'}</dt><dd>{value.treatmentPlan}</dd></div>
    {value.submittedBy&&<div><dt>{tr?'Son gönderim':'Last submission'}</dt><dd>{value.submittedBy} · {value.submittedAt}</dd></div>}
    {value.evidenceReference&&<div><dt>{tr?'Önceki gönderim kanıtı':'Previous submission evidence'}</dt><dd>{value.evidenceReference}</dd></div>}
  </dl><details><summary>{tr?'12 kontrol yanıtı':'12 control responses'}</summary><dl>{TPRM_CONTROLS.map(key=><div key={key}><dt>{controlLabels[key][tr?0:1]}</dt><dd>{value.questionnaire[key]?(tr?'Evet':'Yes'):(tr?'Hayır':'No')}</dd></div>)}</dl></details></div>;
}
export function ThirdPartyAssessmentCorrection({assessmentId,mode,tr,busy,setBusy,refresh,close,completed}:{assessmentId:string;mode:CorrectionMode;tr:boolean;busy:boolean;setBusy:(value:boolean)=>void;refresh:()=>Promise<unknown>;close:()=>void;completed:()=>void}) {
  const resource=useWorkflowRecords<CorrectionContext>(`/api/third-party-risk?view=assessment-context&assessmentId=${encodeURIComponent(assessmentId)}`,null);
  const [source,setSource]=useState<CorrectionContext|null>(null),[edited,setEdited]=useState<Record<string,unknown>|null>(null),[note,setNote]=useState(''),[confirmation,setConfirmation]=useState(''),[notice,setNotice]=useState('');
  const current=resource.ready&&resource.data?.assessment?.id===assessmentId?resource.data:null,inspected=source||current;
  const draft=edited||(inspected?assessmentDraft(inspected.assessment):null),stale=Boolean(source&&current&&source.token!==current.token);
  const allowed=current&&(mode==='return'?current.canReturn:current.canRevise),changed=Boolean(draft&&current&&!sameAssessmentDraft(draft,current.assessment));
  const ready=Boolean(current&&inspected&&allowed&&!stale&&(mode==='return'||changed)&&note.trim().length>=20&&note.trim().length<=1200&&confirmation===CORRECTION_PHRASES[mode]);
  const freeze=()=>setSource(previous=>previous||current);
  async function submit(event:FormEvent) {
    event.preventDefault();if(!ready||!inspected||busy)return;
    setBusy(true);setNotice('');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let saved=false;
    try {
      const response=await fetch(withBasePath('/api/third-party-risk'),{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:mode==='return'?'return-assessment':'revise-assessment',assessmentId,contextToken:inspected.token,note,confirmation,...(mode==='revise'&&draft?{...draft,impact:Number(draft.impact),likelihood:Number(draft.likelihood),controlMaturity:Number(draft.controlMaturity)}:{})})});
      const result=await response.json();saved=response.ok&&result.ok===true;
      if(!saved)setNotice(workflowSelectionMessage(result.code,tr)||(result.code==='TPRM_CORRECTION_UNCHANGED'?(tr?'Değerlendirme içeriğinde değişiklik yok.':'The assessment content is unchanged.'):(tr?'İşlem kaydedilemedi. Güncel kaydı ve yetkinizi kontrol edin; taslağınız korunuyor.':'The change was not recorded. Check the current record and your access; your draft is retained.')));
    } catch { setNotice(tr?'İşlemin sonucu doğrulanamadı. Güncel kaydı ve geçmişi kontrol edin; taslağınız korunuyor.':'The outcome could not be confirmed. Check the current record and history; your draft is retained.'); }
    finally { clearTimeout(timeout);await Promise.allSettled([resource.reload(),refresh()]);setBusy(false); }
    if(saved)completed();
  }
  return <form className="tprm-form tprm-assessment-correction" onSubmit={submit}>
    <div className="wide tprm-decision-context">
      <p>{mode==='return'?(tr?'Eksikleri açıklayarak değerlendirmeyi risk sahibine geri gönderin. Bu işlem tedarikçiyi reddetmez; yeniden kanıtlı gönderim gerekir.':'Explain the required corrections and return the assessment to its risk owner. This does not reject the supplier; a new evidence-backed submission is required.'):(tr?'Taslak yanıtlarını ve iyileştirme planını düzeltin. Kaydetmek incelemeye göndermez; hazır olduğunda kanıt seçerek ayrıca gönderin.':'Correct the draft responses and treatment plan. Saving does not submit for review; select evidence and submit separately when ready.')}</p>
      <p>{tr?'Önceki gönderimler ve kanıtları tarihsel kayıttır. Tüm kanıt sürümleri Kanıt Kütüphanesi → Kullanım ve değişiklik etkisinde izlenebilir.':'Earlier submissions and their evidence remain historical. All selected evidence versions can be inspected in Evidence Library → Usage and change impact.'}</p>
      <button type="button" disabled={busy||resource.loading} onClick={()=>void resource.reload()}>{tr?'Değerlendirmeyi yenile':'Refresh assessment'}</button>
      {resource.loading&&<p role="status">{tr?'Değerlendirme yükleniyor…':'Loading assessment…'}</p>}
      {!resource.loading&&!current&&<p role="alert">{tr?'Değerlendirme yüklenemedi. Yenileyerek tekrar deneyin; taslağınız korunuyor.':'The assessment could not be loaded. Refresh to try again; your draft is retained.'}</p>}
      {current&&<section aria-label={tr?'Güncel değerlendirme':'Current assessment'}><h3>{current.profile.name}</h3><p>{current.profile.service}</p><p>{tr?'Risk sahibi / incelemeci':'Risk owner / reviewer'}: {current.profile.riskOwner} / {current.profile.reviewer}</p><p>{tr?'İnceleme / sözleşme bitişi':'Review / contract end'}: {current.profile.nextReview} / {current.profile.contractEnd}</p><AssessmentReadout value={current.assessment} tr={tr}/></section>}
      {current&&!allowed&&<p role="alert">{tr?'Bu işlem güncel durum veya atamanız için kullanılamıyor.':'This action is unavailable for the current state or your assignment.'}</p>}
      {stale&&<div role="alert"><p>{tr?'İncelediğiniz değerlendirme veya tedarikçi değişti. Güncel bilgileri inceleyip sürümü açıkça kullanın. Girdiğiniz alanlar korunur; çakışan alanları karşılaştırın.':'The inspected assessment or supplier changed. Review and explicitly use the current version. Your entered fields are retained; compare any conflicting fields.'}</p><button type="button" disabled={busy} onClick={()=>{setSource(current);setConfirmation('');setNotice('')}}>{tr?'Güncel sürümü kullan':'Use current version'}</button></div>}
      {notice&&<p role="alert">{notice}</p>}
    </div>
    <fieldset className="wide tprm-correction-fields" disabled={busy||!current||!allowed}>
      <legend>{mode==='return'?(tr?'Düzeltme isteği':'Correction request'):(tr?'Düzenlenen taslak':'Edited draft')}</legend>
      {mode==='revise'&&draft&&<AssessmentFields form={draft} set={value=>{freeze();setEdited(value)}} tr={tr}/>}
      <label className="wide">{tr?'Düzeltme gerekçesi':'Correction reason'}<textarea aria-label={tr?'Düzeltme gerekçesi':'Correction reason'} required minLength={20} maxLength={1200} rows={3} value={note} onChange={event=>{freeze();setNote(event.target.value)}}/></label>
      <label className="wide">{tr?'Onay ifadesi':'Confirmation phrase'}: <strong>{CORRECTION_PHRASES[mode]}</strong><input required autoComplete="off" value={confirmation} onChange={event=>{freeze();setConfirmation(event.target.value)}}/></label>
    </fieldset>
    <footer className="wide"><button type="button" disabled={busy} onClick={close}>{tr?'Vazgeç':'Cancel'}</button><button type="submit" disabled={busy||!ready}>{mode==='return'?(tr?'Risk sahibine geri gönder':'Return to risk owner'):(tr?'Düzeltmeyi kaydet':'Save correction')}</button></footer>
    <div className="wide"><ThirdPartyCorrectionHistory key={current?.token||'loading'} assessmentId={assessmentId} tr={tr} initiallyOpen/></div>
  </form>;
}

export function ThirdPartyCorrectionHistory({assessmentId,tr,initiallyOpen=false}:{assessmentId:string;tr:boolean;initiallyOpen?:boolean}) {
  const [open,setOpen]=useState(initiallyOpen);
  return <details open={open} className="workflow-evidence-history tprm-correction-history" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{tr?'Değerlendirme düzeltme geçmişi':'Assessment correction history'}</summary>{open&&<HistoryPage assessmentId={assessmentId} tr={tr}/>}</details>;
}
function HistoryPage({assessmentId,tr}:{assessmentId:string;tr:boolean}) {
  const [page,setPage]=useState(0),resource=useWorkflowRecords<CorrectionHistory>(`/api/third-party-risk?view=assessment-corrections&assessmentId=${encodeURIComponent(assessmentId)}&page=${page}`,null);
  const data=resource.ready&&resource.data?.assessmentId===assessmentId&&resource.data.page===page&&Array.isArray(resource.data.rows)?resource.data:null;
  return <><button type="button" disabled={resource.loading} onClick={()=>void resource.reload()}>{tr?'Geçmişi yenile':'Refresh history'}</button>
    {resource.loading?<p role="status">{tr?'Düzeltme geçmişi yükleniyor…':'Loading correction history…'}</p>:!data?<p role="alert">{tr?'Düzeltme geçmişi yüklenemedi. Yenileyerek tekrar deneyin.':'Correction history could not be loaded. Refresh to try again.'}</p>:<>
      {!data.rows.length&&<p>{tr?'Kaydedilmiş düzeltme veya geri gönderim yok.':'No recorded correction or return.'}</p>}
      {data.rows.map(row=><div key={row.id}>{row.detail?<><strong>{row.detail.mode==='return'?(tr?'Risk sahibine geri gönderildi':'Returned to risk owner'):(tr?'Taslak düzeltildi':'Draft corrected')}</strong><p>{row.detail.note}</p><details><summary>{tr?'Önceki ve sonraki içerik':'Before and after content'}</summary><h4>{tr?'Önceki':'Before'}</h4><AssessmentReadout value={row.detail.before} tr={tr}/><h4>{tr?'Sonraki':'After'}</h4><AssessmentReadout value={row.detail.after} tr={tr}/></details></>:<p>{tr?'Bu tarihsel kaydın ayrıntıları okunamadı.':'The details of this historical record could not be read.'}</p>}<span>{row.actor}</span><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(tr?'tr-TR':'en-GB')}</time></div>)}<p>{tr?'Sayfa':'Page'} {page+1} · {tr?'Sayfa başına en fazla 20 kayıt; önceki olaylar korunur.':'Up to 20 records per page; earlier events remain retained.'}</p>
    </>}<div className="workflow-choice-pages">{page>0&&<button type="button" disabled={resource.loading} onClick={()=>setPage(page-1)}>{tr?'Önceki 20':'Previous 20'}</button>}{data?.hasMore&&<button type="button" onClick={()=>setPage(page+1)}>{tr?'Sonraki 20':'Next 20'}</button>}</div></>;
}
