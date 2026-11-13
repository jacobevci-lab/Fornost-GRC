"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {withBasePath} from './base-path';
import './workflow-cancel.css';

export default function WorkflowCancelButton({endpoint,id,revision,label,tr,onSaved}:{endpoint:string;id:string;revision:string;label:string;tr:boolean;onSaved:()=>void|Promise<unknown>}){
  const [open,setOpen]=useState(false);
  return <><button type="button" onClick={()=>setOpen(true)}>{tr?'Kaydı iptal et':'Cancel record'}</button>{open&&createPortal(<Cancellation endpoint={endpoint} id={id} revision={revision} label={label} tr={tr} close={()=>setOpen(false)} saved={onSaved}/>,document.body)}</>;
}
function Cancellation({endpoint,id,revision,label,tr,close,saved}:{endpoint:string;id:string;revision:string;label:string;tr:boolean;close:()=>void;saved:()=>void|Promise<unknown>}){
  const ref=useRef<HTMLDialogElement>(null),pending=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[]);
  return <dialog ref={ref} className="workflow-cancel" onCancel={e=>{e.preventDefault();if(!pending.current)close()}} aria-label={tr?'Kayıt iptali':'Record cancellation'}><form onSubmit={async e=>{
    e.preventDefault();if(pending.current)return;const data=new FormData(e.currentTarget);pending.current=true;setBusy(true);setError('');
    try{const r=await fetch(withBasePath(endpoint),{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({action:'cancel-record',recordId:id,expectedUpdatedAt:revision,reason:data.get('reason'),note:data.get('note'),confirmation:data.get('confirmation')})});
      if(!r.ok){setError(r.status===409?(tr?'Kayıt değişti veya artık iptal edilemiyor. Pencereyi kapatıp güncel kaydı açın.':'The record changed or is no longer eligible. Close this dialog and reload the record.'):(tr?'İptal tamamlanamadı. Yetkinizi, gerekçeyi ve onay ifadesini kontrol edin.':'Cancellation failed. Check your access, reason and confirmation.'));return;}
      await saved();close();
    }catch{setError(tr?'Sonuç doğrulanamadı. Yeniden denemeden önce kaydı yenileyin.':'The outcome is unknown. Reload the record before retrying.');}
    finally{pending.current=false;setBusy(false);}
  }}><h3>{tr?'Kaydı iptal et':'Cancel record'} · {label}</h3><p>{tr?'Hatalı, mükerrer veya test kaydını iptal edin. Geçmiş, dosyalar ve bağlantılar korunur; iptal bir doğrulama veya başarılı kapanış değildir.':'Cancel erroneous, duplicate or test intake. History, files and links remain; cancellation is not verification or successful closure.'}</p>
    <fieldset disabled={busy}><label>{tr?'İptal nedeni':'Reason'}<select name="reason" aria-label={tr?"İptal nedeni":"Reason"} required><option value="invalid">{tr?'Hatalı kayıt':'Invalid intake'}</option><option value="duplicate">{tr?'Mükerrer kayıt':'Duplicate'}</option><option value="test">{tr?'Test kaydı':'Test record'}</option></select></label>
    <label>{tr?'Açıklama (en az 20 karakter)':'Explanation (at least 20 characters)'}<textarea name="note" required minLength={20} maxLength={2000}/></label>
    <label>{tr?'Onaylamak için İPTAL ET yazın':'Type İPTAL ET to confirm'}<input name="confirmation" required autoComplete="off" pattern="İPTAL ET"/></label></fieldset>
    {error&&<p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={close}>{tr?'Vazgeç':'Back'}</button><button disabled={busy}>{tr?'İptali kaydet':'Confirm cancellation'}</button></footer>
  </form></dialog>;
}
