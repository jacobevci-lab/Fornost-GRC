'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from '../base-path';
import {requestJsonWithDeadline} from '../bounded-json-request';
import {WorkflowEvidencePicker,workflowSelectionMessage} from '../workflow-selection-fields';
import WorkflowDialog from '../findings/dialog';
import {incidentLabel} from './labels';
import {IncidentContextDetails} from './context-details';
import {incidentDecisionAvailable,incidentDecisionPhrases,incidentEvidenceOperations,type IncidentDecisionContext} from './decisions';

export default function IncidentDecisionDialog({id,operation,tr,actor,close,onBusy}:{id:string;operation:string;tr:boolean;actor:{role:string;email:string};close:(refresh:boolean)=>void;onBusy:(busy:boolean)=>void}){
 const [context,setContext]=useState<IncidentDecisionContext|null>(null),[revision,setRevision]=useState(''),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [note,setNote]=useState(''),[confirmation,setConfirmation]=useState(''),[choice,setChoice]=useState({evidenceId:'',versionId:''}),[rootCause,setRootCause]=useState(''),[lessonsLearned,setLessonsLearned]=useState(''),[notificationDecision,setNotificationDecision]=useState(''),[notificationRationale,setNotificationRationale]=useState('');
 const reader=useRef<AbortController|null>(null),writer=useRef<AbortController|null>(null),firstRevision=useRef(''),changed=useRef(false),sending=useRef(false);
 const load=useCallback(async()=>{
  reader.current?.abort();const current=new AbortController();reader.current=current;setLoading(true);setFailed(false);
  try{
   const {response,body}=await requestJsonWithDeadline(withBasePath('/api/incidents?'+new URLSearchParams({view:'decision',incidentId:id})),{signal:current.signal,cache:'no-store'},fetch,10_000);
   if(!response.ok||typeof body.revision!=='string'||!body.record||typeof body.record!=='object'||(body.record as Record<string,unknown>).id!==id)throw new Error('source');
   if(current.signal.aborted||reader.current!==current)return;
   if(firstRevision.current&&firstRevision.current!==body.revision)changed.current=true;
   if(!firstRevision.current){firstRevision.current=body.revision;const r=(body as unknown as IncidentDecisionContext).record;setRootCause(String(r.root_cause||''));setLessonsLearned(String(r.lessons_learned||''));setNotificationDecision(r.notification_decision==='pending'?'':String(r.notification_decision||''));setNotificationRationale(String(r.notification_rationale||''));}
   setContext(body as unknown as IncidentDecisionContext);setRevision(previous=>previous||String(body.revision));setBlocked(false);setNotice('');
  }catch{if(!current.signal.aborted&&reader.current===current)setFailed(true);}
  finally{if(!current.signal.aborted&&reader.current===current)setLoading(false);}
 },[id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);reader.current?.abort();writer.current?.abort();onBusy(false);};},[load,onBusy]);
 const available=!!context&&incidentDecisionAvailable(context,operation,actor),stale=!!context&&revision!==context.revision,needsEvidence=incidentEvidenceOperations.includes(operation),ready=!!context&&!loading&&!failed&&!blocked&&!stale&&available;
 const dismiss=()=>{if(!sending.current)close(changed.current);};
 async function submit(){
  if(!ready||sending.current)return;sending.current=true;setBusy(true);onBusy(true);setNotice('');const current=new AbortController();writer.current=current;
  try{
   const {response,body}=await requestJsonWithDeadline(withBasePath('/api/incidents'),{method:'POST',signal:current.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:'transition',incidentId:id,operation,note,confirmation,decisionMode:'reviewed',expectedRevision:revision,expectedUpdatedAt:context?.record.updated_at,...(needsEvidence?{evidenceMode:'library',evidenceSelection:choice}:{}),rootCause,lessonsLearned,notificationDecision,notificationRationale})},fetch,15_000);
   if(current.signal.aborted)return;
   if(response.ok){close(true);return;}
   if(response.status===409||response.status>=500)setBlocked(true);
   setNotice(workflowSelectionMessage(body.code,tr)||(response.status>=500?(tr?'İşlemin sonucu doğrulanamadı. Taslağınız korundu; tekrar göndermeden önce güncel karar bağlamını yükleyin.':'The outcome could not be confirmed. Your draft is retained; refresh decision context before another attempt.'):response.status===409?(tr?'Karar kaydedilmedi. Kaynak değişmiş veya yönetişim koşulu sağlanmamış olabilir. Taslağınız korundu; güncel bağlamı inceleyin.':'Decision was not saved. The source may have changed or a governance condition may be unmet. Your draft is retained; review current context.'):response.status===403?(tr?'Bu karar için yetkiniz yok. Atama ve bağımsız inceleme koşullarını kontrol edin.':'You cannot make this decision. Check assignment and independent review requirements.'):(tr?'Karar kaydedilemedi. Notu, kanıtı, kök neden/dersleri, bildirim gerekçesini ve onay ifadesini kontrol edin.':'Decision was not saved. Check the note, evidence, root cause/lessons, notification rationale and confirmation.')));
  }catch{if(!current.signal.aborted){setBlocked(true);setNotice(tr?'İşlemin sonucu doğrulanamadı. Taslağınız korundu; tekrar göndermeden önce güncel karar bağlamını yükleyin.':'The outcome could not be confirmed. Your draft is retained; refresh decision context before another attempt.');}}
  finally{sending.current=false;if(!current.signal.aborted){setBusy(false);onBusy(false);}}
 }
 const r=context?.record,lang=tr?'tr':'en',title=tr?'Olay işlemi':'Incident action';
 return <WorkflowDialog className="incident-overlay" label={title} busy={busy} onClose={dismiss}><form className="incident-action incident-decision" onSubmit={e=>{e.preventDefault();void submit();}}>
  <header><div><small>{r?String(r.code):title} · {incidentLabel(operation,lang)}</small><h3>{r?String(r.title):title}</h3></div><button type="button" disabled={busy} aria-label={tr?'Kapat':'Close'} onClick={dismiss}>×</button></header>
  <section className="incident-decision-context" aria-label={tr?'Karar bağlamı':'Decision context'}>
   <button type="button" disabled={busy||loading} onClick={()=>void load()}>{tr?'Karar bağlamını yenile':'Refresh decision context'}</button>
   {loading&&<p role="status">{tr?'Güncel olay yükleniyor…':'Loading current incident…'}</p>}
   {failed&&<p role="alert">{tr?'Karar bağlamı yüklenemedi. Taslağınız korundu; tekrar deneyin.':'Decision context could not be loaded. Your draft is retained; retry.'}</p>}
   {r&&!loading&&!failed&&<><IncidentContextDetails record={r} tr={tr}/>
    {!available&&<p role="alert">{tr?'Bu işlem güncel durumda veya rolünüz için kullanılamıyor. Güncel sonucu kontrol edip pencereyi kapatabilirsiniz.':'This action is unavailable in the current state or for your role. Review the current outcome and close this dialog.'}</p>}
    {stale&&available&&<p role="alert">{tr?'Olay değişti. Güncel müdahale ve bildirim bilgilerini inceleyin; yeni bağlamı kullanıp onayı tekrar girin.':'The incident changed. Inspect the current response and notification details, adopt the new context and confirm again.'} <button type="button" disabled={busy} onClick={()=>{setRevision(context!.revision);setConfirmation('');setNotice('');}}>{tr?'Güncel bağlamı kullan':'Use current context'}</button></p>}</>}
  </section>
  {notice&&<p className="incident-dialog-notice" role="alert">{notice}</p>}
  <fieldset disabled={busy} className="incident-action-fields"><legend>{tr?'Karar':'Decision'}</legend>
   <label>{tr?'Açıklama':'Note'}<textarea aria-label={tr?'Açıklama':'Note'} required minLength={5} maxLength={3000} value={note} onChange={e=>setNote(e.target.value)}/></label>
   {needsEvidence&&<WorkflowEvidencePicker tr={tr} value={choice} onChange={setChoice}/>}
   {operation==='review'&&<><label>{tr?'Kök neden':'Root cause'}<textarea aria-label={tr?'Kök neden':'Root cause'} required minLength={20} maxLength={3000} value={rootCause} onChange={e=>setRootCause(e.target.value)}/></label><label>{tr?'Çıkarılan dersler':'Lessons learned'}<textarea aria-label={tr?'Çıkarılan dersler':'Lessons learned'} required minLength={20} maxLength={3000} value={lessonsLearned} onChange={e=>setLessonsLearned(e.target.value)}/></label></>}
   {['review','close'].includes(operation)&&<><label>{tr?'Bildirim kararı':'Notification decision'}<select aria-label={tr?'Bildirim kararı':'Notification decision'} required value={notificationDecision} onChange={e=>setNotificationDecision(e.target.value)}><option value="">—</option><option value="required">{incidentLabel('required',lang)}</option><option value="not-required">{incidentLabel('not-required',lang)}</option></select></label><label>{tr?'Bildirim kararı gerekçesi':'Notification rationale'}<textarea aria-label={tr?'Bildirim kararı gerekçesi':'Notification rationale'} required minLength={20} maxLength={2000} value={notificationRationale} onChange={e=>setNotificationRationale(e.target.value)}/></label><small>{tr?'Karar kaydı bildirim göndermez. Geçerli yükümlülükleri yetkili ekibiniz değerlendirir.':'Recording a decision does not send a notification. Your authorized team assesses applicable obligations.'}</small></>}
   <label>{tr?'Onay ifadesi':'Confirmation phrase'}<input aria-label={tr?'Onay ifadesi':'Confirmation phrase'} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/><small>{incidentDecisionPhrases[operation]}</small></label>
  </fieldset>
  <footer><button type="button" disabled={busy} className="secondary" onClick={dismiss}>{tr?'İptal':'Cancel'}</button><button type="submit" disabled={busy||!ready||(needsEvidence&&(!choice.evidenceId||!choice.versionId))}>{busy?(tr?'Kaydediliyor…':'Saving…'):(tr?'İşlemi uygula':'Apply action')}</button></footer>
 </form></WorkflowDialog>;
}
