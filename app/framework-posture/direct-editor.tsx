'use client';
import {useState} from 'react';
import {EntityCombobox} from '../entity-combobox';
import {navigateToFornost} from '../navigation-focus';
import {postureRequest,usePosture} from './client';
import {implementationLabels} from './requirements';
import type {DirectDocument,Implementation,Requirement} from './types';

const values=Object.keys(implementationLabels) as Implementation[];
export function directPayload(name:string,row:Requirement){return {action:'save-requirement',name,ref:row.ref,revision:row.direct?.revision||'',implementation:row.direct?.implementation||'open',evidenceIds:row.direct?.evidenceIds||[],policyIds:row.direct?.policyIds||[]};}
export function DirectError({error,tr,onReload}:{error:string;tr:boolean;onReload:()=>void}){
 if(!error)return null;
 return <p role="alert">{error==='409'?(tr?'Madde veya kaynak değişti. Güncel sürümü yükleyin.':'Requirement or source changed. Load the latest version.'):error==='403'?(tr?'Bu işlem için yetki ve bağımsız doğrulayıcı gerekir; katkı verenler kendi maddelerini doğrulayamaz.':'This action requires permission and an independent reviewer; contributors cannot verify their own requirement.'):(tr?'İşlem kaydedilemedi. Tekrar deneyin.':'Could not save. Please retry.')}{error==='409'&&<button type="button" onClick={onReload}>{tr?'Yenile':'Reload'}</button>}</p>;
}
export function ImplementationCell({name,row,tr,write,onSave,onReload}:{name:string;row:Requirement;tr:boolean;write:boolean;onSave:()=>void;onReload:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const value=row.direct?.implementation||'open';
 return <div className="posture-implementation"><select aria-label={row.ref+' · '+(tr?'Uygulama Durumu':'Implementation status')} value={value} disabled={!write||busy||row.applicability==='excluded'} onChange={async e=>{
  const implementation=e.target.value;setBusy(true);setError('');
  try{await postureRequest({},undefined,{...directPayload(name,row),implementation});onSave();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}>{values.map(v=><option key={v} value={v}>{implementationLabels[v][tr?0:1]}</option>)}</select>
 <DirectError error={error} tr={tr} onReload={onReload}/></div>;
}
export function DirectEditor({name,row,tr,write,onSave,onReload}:{name:string;row:Requirement;tr:boolean;write:boolean;onSave:()=>void;onReload:()=>void}){
 const [revision,setRevision]=useState(0),[evidence,setEvidence]=useState(row.direct?.evidenceIds||[]),[policies,setPolicies]=useState(row.direct?.policyIds||[]);
 const [pick,setPick]=useState<'evidence'|'policy'|null>(null),[choice,setChoice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 const {data,error:loadError}=usePosture<{documents:DirectDocument[]}>(write?{documents:'1'}:null,revision);
 const documents=data?.documents||row.direct?.sources||[];
 const dirty=JSON.stringify(evidence)!==JSON.stringify(row.direct?.evidenceIds||[])||JSON.stringify(policies)!==JSON.stringify(row.direct?.policyIds||[]);
 const linked=documents.filter(d=>(d.kind==='evidence'?evidence:policies).includes(d.id));
 async function save(){setBusy(true);setError('');try{await postureRequest({},undefined,{...directPayload(name,row),evidenceIds:evidence,policyIds:policies});onSave();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="posture-direct" aria-label={tr?'Doğrudan madde kanıtları':'Direct requirement sources'}>
  <h4>{tr?'Doğrudan Kanıt ve Politika':'Direct evidence and policies'}</h4>
  <p>{tr?'Kontrol bağlantısı isteğe bağlıdır. Onaylı ve güncel kanıt veya yayındaki politika, maddeye uygunluğu bağımsız olarak doğrulandığında uyuma katılır.':'Control linking is optional. Current approved evidence or a published policy counts toward compliance after independent verification of its relevance to this requirement.'}</p>
  <fieldset disabled={busy}>
   <div className="posture-editor-actions">{write&&(['evidence','policy'] as const).map(kind=><button key={kind} type="button" aria-expanded={pick===kind} onClick={()=>{setPick(pick===kind?null:kind);setChoice('');}}>{kind==='evidence'?(tr?'+ Kanıt Bağla (EVD)':'+ Link evidence (EVD)'):(tr?'+ Politika Bağla (POL)':'+ Link policy (POL)')}</button>)}</div>
   {pick&&<EntityCombobox key={pick} tr={tr} label={pick==='evidence'?(tr?'Kanıt seç':'Select evidence'):(tr?'Politika seç':'Select policy')} options={documents.filter(d=>d.kind===pick&&!(pick==='evidence'?evidence:policies).includes(d.id))} value={choice} state={loadError?'error':data?'ready':'loading'} retry={()=>setRevision(v=>v+1)} onChange={id=>{setChoice(id);if(id){if(pick==='evidence')setEvidence(old=>[...old,id]);else setPolicies(old=>[...old,id]);setPick(null);setChoice('');}}}/>}
   <ul className="posture-direct-sources">{linked.map(d=><li key={d.id}><button type="button" onClick={()=>navigateToFornost({module:d.kind==='evidence'?'Kanıtlar':'Politika Merkezi',kind:'record',ref:d.id})}>{d.code} · {d.title}</button><small>{d.eligible?(tr?'Güncel ve onaylı':'Current and approved'):(tr?'Onay / güncellik bekliyor':'Awaiting approval / currency')}</small>{write&&<button type="button" aria-label={d.code+' · '+(tr?'Bağı kaldır':'Unlink')} onClick={()=>d.kind==='evidence'?setEvidence(evidence.filter(id=>id!==d.id)):setPolicies(policies.filter(id=>id!==d.id))}>{tr?'Bağı kaldır':'Unlink'}</button>}</li>)}</ul>
   {!linked.length&&<p>{tr?'Henüz doğrudan kanıt veya politika bağlı değil.':'No direct evidence or policy linked yet.'}</p>}
   {write&&<button type="button" className="primary" disabled={!dirty} onClick={save}>{tr?'Madde kaynaklarını kaydet':'Save requirement sources'}</button>}
  </fieldset>
  {row.direct?.verified?<p role="status">{tr?'Madde bağımsız doğrulandı':'Requirement independently verified'} · {row.direct.verifiedBy}</p>:row.direct?.implementation==='implemented'&&<p>{tr?'İnsan Doğrulayıcı Onayı Bekliyor':'Awaiting human verifier approval'}</p>}
  {write&&!dirty&&row.direct?.implementation==='implemented'&&row.direct.sources.some(d=>d.eligible)&&!row.direct.verified&&row.applicability!=='excluded'&&<details><summary>{tr?'Maddeyi bağımsız doğrula':'Independently verify requirement'}</summary>
   <label>{tr?'Maddeye uygunluk ve doğrulama gerekçesi':'Requirement relevance and verification rationale'}<textarea value={note} maxLength={2000} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
   <button type="button" disabled={busy||note.trim().length<10} onClick={async()=>{setBusy(true);setError('');try{await postureRequest({},undefined,{action:'verify-requirement',name,ref:row.ref,revision:row.direct?.revision,note});onSave();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{tr?'Doğrula ve Uyumlu Olarak Kaydet':'Verify and record as compliant'}</button></details>}
  <DirectError error={error} tr={tr} onReload={onReload}/>
 </section>;
}
