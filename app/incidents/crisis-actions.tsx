'use client';
import {useRef,useState} from 'react';
import {withBasePath} from '../base-path';
import {requestJsonWithDeadline} from '../bounded-json-request';
import WorkflowDialog from '../findings/dialog';
import {WorkflowEvidencePicker,workflowSelectionMessage} from '../workflow-selection-fields';
import {localInput,noticeLabel} from './crisis';
import {incidentLabel} from './labels';
import type {Incident} from './case-workspace';
export async function postCrisis(row:Incident,action:string,data:Record<string,unknown>){
 return requestJsonWithDeadline(withBasePath('/api/incidents'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,incidentId:row.id,expectedUpdatedAt:row.updatedAt,action})},fetch,20000);
}
export function CrisisActionDialog({mode,row,tr,close,refresh}:{mode:'notice'|'evidence';row:Incident;tr:boolean;close:()=>void;refresh:()=>Promise<void>}){
 const [decision,setDecision]=useState(row.notificationDecision==='pending'?'':row.notificationDecision),[reason,setReason]=useState(row.notificationRationale||''),[regime,setRegime]=useState(row.notificationRegime||''),[scope,setScope]=useState(row.notificationScope||''),[awareness,setAwareness]=useState('');
 const [upload,setUpload]=useState(false),[choice,setChoice]=useState({evidenceId:'',versionId:''}),[file,setFile]=useState<File|null>(null),[title,setTitle]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const writing=useRef(false);
 const heading=mode==='notice'?(tr?'Bildirim Kararını Kaydet':'Record notification decision'):(tr?'Müdahale Kanıtı Ekle':'Add response evidence');
 async function submit(){
  if(writing.current)return;writing.current=true;setBusy(true);setError('');
  try{
   let result;
   if(mode==='notice'){
    result=await postCrisis(row,'record-notification',{decision,rationale:reason,scope,regime,awarenessAt:awareness?new Date(awareness).toISOString():null});
   }else if(upload){
    if(!file)return;
    const data=new FormData();for(const [k,v] of Object.entries({incidentId:row.id,expectedUpdatedAt:row.updatedAt,evidenceTitle:title,owner:row.owner,period:new Date().toISOString().slice(0,10)}))data.set(k,v);data.set('file',file);
    result=await requestJsonWithDeadline(withBasePath('/api/evidence'),{method:'POST',body:data},fetch,60000);
   }else result=await postCrisis(row,'link-evidence',{evidenceMode:'library',evidenceSelection:choice});
   if(!result.response.ok){setError(workflowSelectionMessage(result.body.code,tr)||(result.response.status===409?(tr?'Olay değişti veya bu sürüm zaten bağlı. Dosyayı yenileyip kontrol edin.':'The case changed or this version is already linked. Refresh and check the case.'):(tr?'Kaydedilemedi. Alanları ve yetkinizi kontrol edin.':'Could not save. Check the fields and your access.')));return;}
   await refresh();close();
  }catch{setError(tr?'Sonuç doğrulanamadı. Tekrar göndermeden önce olay geçmişini kontrol edin.':'The outcome could not be confirmed. Check case history before retrying.');}
  finally{writing.current=false;setBusy(false);}
 }
 return <WorkflowDialog className="incident-overlay" label={heading} busy={busy} onClose={close}><form className="incident-form" onSubmit={e=>{e.preventDefault();void submit();}}>
  <header><div><small>{row.code}</small><h3>{heading}</h3></div><button type="button" aria-label={tr?'Kapat':'Close'} disabled={busy} onClick={close}>×</button></header>
  <fieldset disabled={busy} className="incident-form-grid">{mode==='notice'?<>
    <label>{tr?'Bildirim kararı':'Notification decision'}<select aria-label={tr?'Bildirim kararı':'Notification decision'} required value={decision} onChange={e=>setDecision(e.target.value)}><option value="">—</option>{['required','not-required'].map(s=><option key={s} value={s}>{incidentLabel(s,tr?'tr':'en')}</option>)}</select></label>
    <label>{tr?'Değerlendirilen mevzuat':'Applicable law'}<select aria-label={tr?'Değerlendirilen mevzuat':'Applicable law'} required value={regime} onChange={e=>setRegime(e.target.value)}><option value="">—</option>{['kvkk','gdpr','both'].map(s=><option key={s} value={s}>{noticeLabel(s==='both'?'bothRegimes':s,tr)}</option>)}</select></label>
    <label>{tr?'Değerlendirilen bildirim kapsamı':'Notification scope assessed'}<select aria-label={tr?'Değerlendirilen bildirim kapsamı':'Notification scope assessed'} required value={scope} onChange={e=>setScope(e.target.value)}><option value="">—</option>{['authority','individuals','both'].map(s=><option key={s} value={s}>{noticeLabel(s,tr)}</option>)}</select></label>
    {row.personalData&&!row.awarenessAt&&<label>{tr?'İhlalin öğrenildiği zaman (biliniyorsa)':'Breach awareness time (if known)'}<input type="datetime-local" max={localInput()} value={awareness} onChange={e=>setAwareness(e.target.value)}/></label>}
    <label className="wide">{tr?'Karar gerekçesi':'Decision rationale'}<textarea required minLength={20} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  </>:<>
    <div className="ic-views wide" role="group" aria-label={tr?'Kanıt kaynağı':'Evidence source'}>{[false,true].map(v=><button type="button" key={String(v)} aria-pressed={v===upload} onClick={()=>setUpload(v)}>{v?(tr?'Dosya yükle':'Upload file'):(tr?'Kanıt Kütüphanesi':'Evidence Library')}</button>)}</div>
    {upload?<><label className="wide">{tr?'Dosya (en fazla 10 MB)':'File (up to 10 MB)'}<input required type="file" onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f&&!title)setTitle(f.name);}}/></label><label className="wide">{tr?'Kanıt başlığı':'Evidence title'}<input required value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/></label></>:<WorkflowEvidencePicker tr={tr} value={choice} onChange={setChoice}/>}
  </>}</fieldset>{error&&<p role="alert">{error}</p>}<footer><button type="button" disabled={busy} className="secondary" onClick={close}>{tr?'Vazgeç':'Cancel'}</button><button disabled={busy||mode==='evidence'&&(upload?(!file||file.size>10*1024*1024):!choice.versionId)}>{tr?'Kaydet':'Save'}</button></footer></form></WorkflowDialog>;
}
