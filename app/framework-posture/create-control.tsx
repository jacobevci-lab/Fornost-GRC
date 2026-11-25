'use client';
import {useState} from 'react';
import {withBasePath} from '../base-path';
import type {Control} from './types';

export function CreateControl({tr,onCreated,initialTitle=''}:{tr:boolean;initialTitle?:string;onCreated:(control:Control)=>void}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  const [ref,setRef]=useState(''),[title,setTitle]=useState(initialTitle),[owner,setOwner]=useState(''),[frequency,setFrequency]=useState('');
  async function create(){
    setBusy(true);setError(false);
    const implementation='Uygulama Hazırlığında';
    try{
      const response=await fetch(withBasePath('/api/grc'),{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({module:'Kontroller',data:{controlRef:ref.trim(),controlTitle:title.trim(),owner:owner.trim(),frequency:frequency.trim(),implementation,status:'Taslak'}})});
      if(!response.ok)throw new Error();
      const {id,code}=await response.json();
      onCreated({id,code,title:title.trim(),implementation});
      setOpen(false);setRef('');setTitle('');setOwner('');setFrequency('');
    }catch{setError(true);}finally{setBusy(false);}
  }
  return <div><button type="button" aria-expanded={open} disabled={busy} onClick={()=>setOpen(!open)}>{tr?'Yeni kontrol oluştur':'Create new control'}</button>
    {open&&<fieldset className="posture-fields" disabled={busy}><legend>{tr?'Kontrol Kütüphanesinde taslak oluştur':'Create a draft in the Control Library'}</legend>
      <label>{tr?'Kontrol referansı':'Control reference'}<input maxLength={160} value={ref} onChange={e=>setRef(e.target.value)}/></label>
      <label>{tr?'Kontrol başlığı':'Control title'}<input maxLength={240} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>{tr?'Kontrol sahibi':'Control owner'}<input maxLength={160} value={owner} onChange={e=>setOwner(e.target.value)}/></label>
      <label>{tr?'Sıklık':'Frequency'}<input maxLength={80} value={frequency} onChange={e=>setFrequency(e.target.value)}/></label>
      <button type="button" disabled={![ref,title,owner,frequency].every(s=>s.trim())} onClick={create}>{tr?'Taslağı oluştur':'Create draft'}</button>
      {error&&<p role="alert">{tr?'İşlem doğrulanamadı. Tekrar denemeden önce kütüphaneyi kontrol edin.':'Creation could not be verified. Check the library before retrying.'}</p>}
    </fieldset>}</div>;
}
