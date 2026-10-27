"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from './base-path';
import {requestJsonWithDeadline} from './bounded-json-request';
import {useRecordDialog} from './use-record-dialog';
import {WorkflowEvidencePicker,workflowSelectionMessage} from './workflow-selection-fields';
import {policyDecisionAvailable,policyDecisionNames,policyDecisionPhrases,policyEvidenceOperations,type PolicyDecisionContext,type PolicyDecisionKind} from './policy-lifecycle/decisions';

export default function PolicyDecisionDialog({kind,id,operation,tr,actor,close}:{kind:PolicyDecisionKind;id:string;operation:string;tr:boolean;actor:{role:string;email:string};close:(saved:boolean)=>void}) {
  const [context,setContext]=useState<PolicyDecisionContext|null>(null),[revision,setRevision]=useState(''),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [note,setNote]=useState(''),[confirmation,setConfirmation]=useState(''),[choice,setChoice]=useState({evidenceId:'',versionId:''});
  const controller=useRef<AbortController|null>(null),closeRef=useRef(()=>{}),firstRevision=useRef(''),changed=useRef(false);
  useEffect(()=>{closeRef.current=()=>{if(!busy)close(changed.current)}},[close,busy]);
  const dismiss=useCallback(()=>closeRef.current(),[]),dialog=useRecordDialog(true,dismiss);
  const load=useCallback(async()=>{
    controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);setFailed(false);
    try {
      const {response,body}=await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle?'+new URLSearchParams({view:'decision',kind,id})),{signal:current.signal,cache:'no-store'},fetch,10_000);
      if(!response.ok||body.kind!==kind||typeof body.revision!=='string'||!body.record||!body.policy||!body.version)throw new Error('source');
      if(current.signal.aborted||controller.current!==current)return;
      if(firstRevision.current&&firstRevision.current!==body.revision)changed.current=true;
      if(!firstRevision.current)firstRevision.current=String(body.revision);
      setContext(body as unknown as PolicyDecisionContext);setRevision(previous=>previous||String(body.revision));setBlocked(false);setNotice('');
    } catch {if(!current.signal.aborted&&controller.current===current)setFailed(true)}
    finally {if(!current.signal.aborted&&controller.current===current)setLoading(false)}
  },[kind,id]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);controller.current?.abort()}},[load]);
  const stale=Boolean(context&&revision!==context.revision),needsEvidence=policyEvidenceOperations.includes(operation),available=Boolean(context&&policyDecisionAvailable(context,operation,actor));
  const ready=!!context&&!loading&&!failed&&!blocked&&!stale&&available;
  async function submit() {
    if(!ready||busy)return;setBusy(true);setNotice('');
    try {
      const {response,body}=await requestJsonWithDeadline(withBasePath('/api/policy-lifecycle'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:kind==='retire'?'retire-policy':`${kind}-action`,[kind==='version'?'versionId':kind==='exception'?'exceptionId':'policyId']:id,operation,note,confirmation,decisionMode:'reviewed',expectedRevision:revision,...(needsEvidence?{evidenceMode:'library',evidenceSelection:choice}:{})})},fetch,15_000);
      if(response.ok){close(true);return;}
      if(response.status===409)setBlocked(true);
      setNotice(workflowSelectionMessage(body.code,tr)||(response.status===409?(tr?'Karar kaydedilmedi. Kaynak değişmiş veya işlem engellenmiş olabilir. Taslağınız korundu; güncel bağlamı ve açık kampanya/istisnaları kontrol edin.':'Decision was not saved. The source may have changed or a blocker may remain. Your draft is retained; review current context and open campaigns/exceptions.'):response.status===403?(tr?'Bu karar için yetkiniz yok. Atanmış kişi ve bağımsız inceleme koşullarını kontrol edin.':'You cannot make this decision. Check assignment and independent review requirements.'):(tr?'Karar kaydedilemedi. Notu, seçilen kanıtı ve tam onay ifadesini kontrol edin.':'Decision was not saved. Check the note, evidence selection and exact confirmation.')));
    } catch {setBlocked(true);setNotice(tr?'İşlemin sonucu doğrulanamadı. Taslağınız korundu. Yeniden göndermeden önce güncel karar bağlamını yükleyin.':'The outcome could not be confirmed. Your draft is retained. Refresh decision context before trying again.')}
    finally {setBusy(false)}
  }
  const title=policyDecisionNames[operation]?.[tr?0:1]||operation;
  return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)dismiss()}}><div ref={dialog} data-escape-layer className="modal plm-modal plm-decision" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
    <div className="modal-head"><h2>{title}</h2><button data-escape-close disabled={busy} type="button" aria-label={tr?'Kapat':'Close'} onClick={dismiss}>×</button></div>
    <form onSubmit={e=>{e.preventDefault();void submit()}}>
      <section className="plm-decision-context" aria-label={tr?'Karar bağlamı':'Decision context'}>
        <button type="button" disabled={busy||loading} onClick={()=>void load()}>{tr?'Karar bağlamını yenile':'Refresh decision context'}</button>
        {loading&&<p role="status">{tr?'Güncel politika yükleniyor…':'Loading current policy…'}</p>}
        {failed&&<p role="alert">{tr?'Karar bağlamı yüklenemedi. Taslağınız korundu; tekrar deneyin.':'Decision context could not be loaded. Your draft is retained; retry.'}</p>}
        {context&&!loading&&!failed&&<><h3>{String(context.policy.code)} · {String(context.policy.title)}</h3><dl>
          <div><dt>{tr?'Durum':'Status'}</dt><dd>{String(context.record.status)}</dd></div><div><dt>{tr?'Politika sürümü':'Policy version'}</dt><dd>v{String(context.version.version_number)} · {String(context.version.effective_date)}</dd></div>
          <div><dt>{tr?'Sorumlu':'Owner'}</dt><dd>{String(context.record.owner||context.policy.owner)}</dd></div><div><dt>{tr?'Bağımsız inceleyen':'Independent reviewer'}</dt><dd>{String(context.record.reviewer||context.policy.reviewer)}</dd></div>
          <div><dt>{tr?'Hedef kitle':'Audience'}</dt><dd>{String(context.policy.audience)}</dd></div><div><dt>{tr?'Sınıf':'Classification'}</dt><dd>{String(context.policy.classification)}</dd></div>
          {kind==='exception'&&[['scope',tr?'Kapsam':'Scope'],['rationale',tr?'Gerekçe':'Rationale'],['compensating_control',tr?'Telafi kontrolü':'Compensating control'],['expires_at',tr?'Bitiş':'Expiry']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{String(context.record[key])}</dd></div>)}
        </dl><details><summary>{tr?'Karara bağlı politika içeriği':'Policy content for this decision'}</summary><p>{String(context.version.summary)}</p><p className="plm-decision-content">{String(context.version.content)}</p><p>{tr?'Kontrol / regülasyon / risk eşlemeleri':'Control / regulation / risk mappings'}: {[context.version.control_refs_json,context.version.regulation_refs_json,context.version.risk_refs_json].join(' · ')}</p><code>{String(context.version.content_sha256)}</code></details>
        {!available&&<p role="alert">{tr?'Bu işlem güncel durumda veya rolünüz için kullanılamıyor. Güncel sonucu kontrol edip pencereyi kapatabilirsiniz.':'This action is unavailable in the current state or for your role. Review the current outcome and close this dialog.'}</p>}
        {stale&&available&&<p role="alert">{tr?'Politika veya istisna değişti. Güncel ayrıntıları inceledikten sonra yeni bağlamı kullanıp onayı tekrar girin.':'The policy or exception changed. Inspect current details, adopt the new context and confirm again.'} <button type="button" disabled={busy} onClick={()=>{setRevision(context.revision);setConfirmation('');setNotice('')}}>{tr?'Güncel bağlamı kullan':'Use current context'}</button></p>}</>}
      </section>
      {notice&&<p role="alert">{notice}</p>}
      <fieldset className="plm-decision-fields" disabled={busy}><legend className="sr-only">{tr?'Karar':'Decision'}</legend>
        <label>{tr?'Karar / işlem notu':'Decision / action note'}<textarea aria-label={tr?'Karar / işlem notu':'Decision / action note'} required minLength={5} maxLength={1600} rows={4} value={note} onChange={e=>setNote(e.target.value)}/></label>
        {needsEvidence&&<WorkflowEvidencePicker tr={tr} value={choice} onChange={setChoice}/>}
        <label>{tr?'Tam onay ifadesi':'Exact confirmation'}: {policyDecisionPhrases[operation]}<input aria-label={`${tr?'Tam onay ifadesi':'Exact confirmation'}: ${policyDecisionPhrases[operation]}`} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      </fieldset>
      <footer><button type="button" disabled={busy} onClick={dismiss}>{tr?'Vazgeç':'Cancel'}</button><button type="submit" disabled={busy||!ready||(needsEvidence&&(!choice.evidenceId||!choice.versionId))}>{busy?(tr?'Kaydediliyor…':'Saving…'):(tr?'Uygula':'Apply')}</button></footer>
    </form>
  </div></div>;
}
