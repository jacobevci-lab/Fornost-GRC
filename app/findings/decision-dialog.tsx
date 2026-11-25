'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from '../base-path';
import {requestJsonWithDeadline} from '../bounded-json-request';
import {WorkflowEvidencePicker,workflowSelectionMessage} from '../workflow-selection-fields';
import FindingDialog from './dialog';
import {findingLabel} from './presentation';
import {addDays} from './domain';
import {findingDecisionAvailable,findingDecisionPhrases,findingEvidenceOperations,type FindingDecisionContext} from './decisions';

export default function FindingDecisionDialog({id,operation,tr,actor,close,onBusy}:{id:string;operation:string;tr:boolean;actor:{role:string;email:string};close:(refresh:boolean)=>void;onBusy:(busy:boolean)=>void}){
 const [context,setContext]=useState<FindingDecisionContext|null>(null),[revision,setRevision]=useState(''),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [note,setNote]=useState(''),[confirmation,setConfirmation]=useState(''),[choice,setChoice]=useState({evidenceId:'',versionId:''}),[acceptUntil,setAcceptUntil]=useState(()=>addDays(new Date().toISOString().slice(0,10),90)),[rationale,setRationale]=useState('');
 const reader=useRef<AbortController|null>(null),writer=useRef<AbortController|null>(null),firstRevision=useRef(''),changed=useRef(false),sending=useRef(false);
 const load=useCallback(async()=>{
  reader.current?.abort();const current=new AbortController();reader.current=current;setLoading(true);setFailed(false);
  try{
   const {response,body}=await requestJsonWithDeadline(withBasePath('/api/findings?'+new URLSearchParams({view:'decision',findingId:id})),{signal:current.signal,cache:'no-store'},fetch,10_000);
   if(!response.ok||typeof body.revision!=='string'||!body.record||typeof body.record!=='object'||(body.record as Record<string,unknown>).id!==id)throw new Error('source');
   if(current.signal.aborted||reader.current!==current)return;
   if(firstRevision.current&&firstRevision.current!==body.revision)changed.current=true;
   if(!firstRevision.current)firstRevision.current=body.revision;
   setContext(body as unknown as FindingDecisionContext);setRevision(previous=>previous||String(body.revision));setBlocked(false);setNotice('');
  }catch{if(!current.signal.aborted&&reader.current===current)setFailed(true);}
  finally{if(!current.signal.aborted&&reader.current===current)setLoading(false);}
 },[id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);reader.current?.abort();writer.current?.abort();onBusy(false);};},[load,onBusy]);
 const available=!!context&&findingDecisionAvailable(context,operation,actor),stale=!!context&&revision!==context.revision,needsEvidence=findingEvidenceOperations.includes(operation),ready=!!context&&!loading&&!failed&&!blocked&&!stale&&available;
 const dismiss=()=>{if(!sending.current)close(changed.current);};
 async function submit(){
  if(!ready||sending.current)return;sending.current=true;setBusy(true);onBusy(true);setNotice('');const current=new AbortController();writer.current=current;
  try{
   const {response,body}=await requestJsonWithDeadline(withBasePath('/api/findings'),{method:'POST',signal:current.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action:'transition',findingId:id,operation,note,confirmation,decisionMode:'reviewed',expectedRevision:revision,expectedUpdatedAt:context?.record.updated_at,...(needsEvidence?{evidenceMode:'library',evidenceSelection:choice}:{}),...(operation==='accept-risk'?{acceptUntil,acceptanceRationale:rationale}:{})})},fetch,15_000);
   if(current.signal.aborted)return;
   if(response.ok){close(true);return;}
   if(response.status===409||response.status>=500)setBlocked(true);
   setNotice(workflowSelectionMessage(body.code,tr)||(response.status>=500?(tr?'İşlemin sonucu doğrulanamadı. Taslağınız korundu; tekrar göndermeden önce güncel karar bağlamını yükleyin.':'The outcome could not be confirmed. Your draft is retained; refresh decision context before another attempt.'):response.status===409?(tr?'Karar kaydedilmedi. Kaynak değişmiş veya yönetişim koşulu sağlanmamış olabilir. Taslağınız korundu; güncel bağlamı inceleyin.':'Decision was not saved. The source may have changed or a governance condition may be unmet. Your draft is retained; review current context.'):response.status===403?(tr?'Bu karar için yetkiniz yok. Atama ve bağımsız inceleme koşullarını kontrol edin.':'You cannot make this decision. Check assignment and independent review requirements.'):(tr?'Karar kaydedilemedi. Notu, kanıtı, onay ifadesini ve risk/kontrol bağlantılarını kontrol edin.':'Decision was not saved. Check the note, evidence, confirmation and risk/control links.')));
  }catch{if(!current.signal.aborted){setBlocked(true);setNotice(tr?'İşlemin sonucu doğrulanamadı. Taslağınız korundu; tekrar göndermeden önce güncel karar bağlamını yükleyin.':'The outcome could not be confirmed. Your draft is retained; refresh decision context before another attempt.');}}
  finally{sending.current=false;if(!current.signal.aborted){setBusy(false);onBusy(false);}}
 }
 const r=context?.record,lang=tr?'tr':'en',title=tr?'CAPA işlemi':'CAPA action';
 return <FindingDialog label={title} busy={busy} onClose={dismiss}><form className="finding-action finding-decision" onSubmit={e=>{e.preventDefault();void submit();}}>
  <header><div><small>{r?String(r.code):title}</small><h3>{r?String(r.title):title}</h3></div><button type="button" disabled={busy} aria-label={tr?'Kapat':'Close'} onClick={dismiss}>×</button></header>
  <section className="finding-decision-context" aria-label={tr?'Karar bağlamı':'Decision context'}>
   <button type="button" disabled={busy||loading} onClick={()=>void load()}>{tr?'Karar bağlamını yenile':'Refresh decision context'}</button>
   {loading&&<p role="status">{tr?'Güncel bulgu yükleniyor…':'Loading current finding…'}</p>}
   {failed&&<p role="alert">{tr?'Karar bağlamı yüklenemedi. Taslağınız korundu; tekrar deneyin.':'Decision context could not be loaded. Your draft is retained; retry.'}</p>}
   {r&&!loading&&!failed&&<><dl>{[['status',tr?'Durum':'Status'],['owner',tr?'Aksiyon sahibi':'Action owner'],['reviewer',tr?'Bağımsız doğrulayıcı':'Independent reviewer'],['due_date',tr?'Termin':'Due'],['source_title',tr?'Kaynak':'Source'],['source_ref',tr?'Kaynak referansı':'Source reference'],['risk_ref',tr?'Risk bağlantısı':'Risk link'],['control_ref',tr?'Kontrol bağlantısı':'Control link']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='status'?findingLabel(String(r[key]),lang):String(r[key]||'—')}</dd></div>)}</dl>
    <details><summary>{tr?'Bulgu ve aksiyon planını incele':'Review finding and action plan'}</summary>{[['description',tr?'Bulgu':'Finding'],['root_cause',tr?'Kök neden':'Root cause'],['corrective_action',tr?'Düzeltici aksiyon':'Corrective action'],['preventive_action',tr?'Önleyici aksiyon':'Preventive action']].map(([key,label])=><div key={key}><h4>{label}</h4><p>{String(r[key])}</p></div>)}</details>
    {!available&&<p role="alert">{tr?'Bu işlem güncel durumda veya rolünüz için kullanılamıyor. Güncel sonucu kontrol edip pencereyi kapatabilirsiniz.':'This action is unavailable in the current state or for your role. Review the current outcome and close this dialog.'}</p>}
    {stale&&available&&<p role="alert">{tr?'Bulgu değişti. Güncel planı inceledikten sonra yeni bağlamı kullanıp onayı tekrar girin.':'The finding changed. Inspect the current plan, adopt the new context and confirm again.'} <button type="button" disabled={busy} onClick={()=>{setRevision(context!.revision);setConfirmation('');setNotice('');}}>{tr?'Güncel bağlamı kullan':'Use current context'}</button></p>}</>}
  </section>
  {notice&&<p className="finding-dialog-notice" role="alert">{notice}</p>}
  <fieldset disabled={busy} className="finding-action-fields"><legend>{tr?'Karar':'Decision'}</legend>
   <label>{tr?'Açıklama':'Note'}<textarea aria-label={tr?'Açıklama':'Note'} required minLength={5} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
   {needsEvidence&&<WorkflowEvidencePicker tr={tr} value={choice} onChange={setChoice}/>}
   {operation==='accept-risk'&&<><label>{tr?'Kabul bitişi':'Acceptance expiry'}<input aria-label={tr?'Kabul bitişi':'Acceptance expiry'} type="date" required min={new Date().toISOString().slice(0,10)} max={addDays(new Date().toISOString().slice(0,10),180)} value={acceptUntil} onChange={e=>setAcceptUntil(e.target.value)}/></label><label>{tr?'Risk kabul gerekçesi':'Risk acceptance rationale'}<textarea aria-label={tr?'Risk kabul gerekçesi':'Risk acceptance rationale'} required minLength={20} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/></label></>}
   <label>{tr?'Onay ifadesi':'Confirmation phrase'}<input aria-label={tr?'Onay ifadesi':'Confirmation phrase'} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/><small>{findingDecisionPhrases[operation]}</small></label>
  </fieldset>
  <footer><button type="button" disabled={busy} className="secondary" onClick={dismiss}>{tr?'İptal':'Cancel'}</button><button type="submit" disabled={busy||!ready||(needsEvidence&&(!choice.evidenceId||!choice.versionId))}>{busy?(tr?'Kaydediliyor…':'Saving…'):(tr?'İşlemi uygula':'Apply action')}</button></footer>
 </form></FindingDialog>;
}
