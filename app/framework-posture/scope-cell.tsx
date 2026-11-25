'use client';
import {useState} from 'react';
import {postureRequest} from './client';
import {ISO} from './catalog';
import {applicabilityLabel} from './requirements';
import type {Applicability,Requirement} from './types';

type Props={name:string;row:Requirement;tr:boolean;write:boolean;onEdit:()=>void;onSave:()=>void;onReload:()=>void};
export function ScopeCell({name,row,tr,write,onEdit,onSave,onReload}:Props){
  const [draft,setDraft]=useState<Applicability|null>(null);
  const [reason,setReason]=useState(row.reason),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const value=draft??row.applicability;
  const options:Applicability[]=[...(row.applicability==='undecided'?['undecided' as const]:[]),row.applicability==='required'?'required':'included',...(name===ISO&&!row.annex?[]:['excluded' as const])];
  function edit(next:Applicability){onEdit();setDraft(next);setReason(next===row.applicability?row.reason:'');setError('');}
  async function save(){
    setBusy(true);setError('');
    try {
      await postureRequest({},undefined,{action:'save',name,ref:row.ref,revision:row.revision,applicability:value,reason:reason.trim(),links:row.links});
      setDraft(null);onSave();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="posture-scope-cell">
    {write?<select aria-label={row.ref+' · '+(tr?'SoA kapsam':'SoA scope')} value={value} disabled={busy}
      onChange={e=>edit(e.target.value as Applicability)}>{options.map(k=><option key={k} value={k}>{applicabilityLabel(k,tr)}</option>)}</select>:<span>{applicabilityLabel(value,tr)}</span>}
    {name===ISO&&!row.annex&&<small>{tr?'Zorunlu · ISO 27001 Madde 4–10':'Mandatory · ISO 27001 Clauses 4–10'}</small>}
    {draft===null && row.reason && <details><summary>{tr?'Gerekçe':'Rationale'}</summary><p>{row.reason}</p>
      {write&&<button type="button" onClick={()=>edit(row.applicability)}>{tr?'Gerekçeyi düzenle':'Edit rationale'}</button>}</details>}
    {draft!==null&&<div className="posture-scope-draft"><label>{draft==='excluded'?(tr?'Hariç Tutma Gerekçesi':'Exclusion rationale'):(tr?'Karar gerekçesi':'Decision rationale')}{draft==='excluded'?' *':''}
      <textarea autoFocus={draft==='excluded'} required={draft==='excluded'} disabled={busy} maxLength={2000} rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {draft==='excluded'&&<small>{tr?'Kaydedince bu madde yerel uyum oranının hesabından çıkar.':'Saving removes this requirement from the local compliance calculation.'}</small>}
      <button type="button" disabled={busy || (draft==='excluded'&&!reason.trim()) || (draft===row.applicability && reason.trim()===row.reason)}
        onClick={save}>{tr?'Kapsamı kaydet':'Save scope'}</button>
      <button type="button" disabled={busy} onClick={()=>{setDraft(null);setError('');}}>{tr?'Vazgeç':'Cancel'}</button></div>}
    {error&&<p role="alert">{error==='409'?(tr?'Madde değişti. Güncel sürümü yükleyin.':'Requirement changed. Load the latest version.'):(tr?'Kaydedilemedi. Tekrar deneyin.':'Could not save. Please retry.')}
      {error==='409'&&<button type="button" onClick={onReload}>{tr?'Yenile':'Reload'}</button>}</p>}
  </div>;
}
