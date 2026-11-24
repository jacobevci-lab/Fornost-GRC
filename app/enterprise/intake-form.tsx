'use client';
import {useState} from 'react';
import {type Access,type Kind,issue,request,useData} from './client';
import {intakeFields,optionLabels} from './intake-fields';
import {FairFields} from './fair-panel';
export function IntakeForm({kind,access,tr,onClose,onCreated}:{kind:Kind;access:Access;tr:boolean;onClose:()=>void;onCreated:(code:string)=>void}){
 const [entity,setEntity]=useState(access.scope.selected||access.entities[0]?.id||''),[values,setValues]=useState<Record<string,unknown>>({}),[token,setToken]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const {data:people,error:peopleError}=useData<{people:{id:string;name:string;email:string;reviewer:boolean}[]}>(`enterprise/records?view=people&kind=${kind}&entity=${encodeURIComponent(entity)}`);
 const {data:projection}=useData<{nodes:{kind:string;recordId:string;code:string;title:string;entity:string}[];complete:boolean}>('enterprise/records?view=overview');
 const update=(key:string,value:unknown)=>{setValues(v=>({...v,[key]:value}));setToken(crypto.randomUUID())};
 return <form className="ec-editor ec-intake" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await request<{code:string}>('enterprise/records',{kind,entity,requestId:token,values});onCreated(result.code)}catch(err){setError(issue(tr,err))}finally{setBusy(false)}}} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onClose()}}}>
 <h3>{tr?'Yeni kapsam kaydı':'New scoped record'}</h3><p>{tr?'Kayıt size atanır. Onay ve kapatma, bağımsız insan doğrulaması gerektiren mevcut yaşam döngüsünde yürütülür.':'The record is assigned to you. Approval and closure follow the existing lifecycle with independent human verification.'}</p>
 <fieldset disabled={busy} className="ec-intake-grid"><label>{tr?'Kayıt kapsamı':'Record scope'}<select required value={entity} onChange={e=>{setEntity(e.target.value);setValues({});setToken(crypto.randomUUID())}}>{access.entities.filter(e=>!access.scope.selected||e.id===access.scope.selected).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
 {intakeFields[kind].map(f=><label key={f.key}>{tr?f.tr:f.en}{f.type==='select'?<select required value={String(values[f.key]??'')} onChange={e=>update(f.key,e.target.value)}><option value="">{tr?'Seçin':'Select'}</option>{f.options?.map(o=><option key={o} value={o}>{optionLabels[o]?.[tr?0:1]||o}</option>)}</select>:
 f.type==='person'?<select required value={String(values[f.key]??'')} disabled={!people} onChange={e=>update(f.key,e.target.value)}><option value="">{tr?'Yetkili kişi seçin':'Select an authorized person'}</option>{people?.people.filter(p=>f.key!=='reviewer'||p.reviewer).filter(p=>f.key!=='testOwner'||p.id!==access.self).map(p=><option key={p.id} value={p.email}>{p.name} · {p.email}</option>)}</select>:
 f.type==='asset'?<select required value={String(values[f.key]??'')} onChange={e=>update(f.key,e.target.value)}><option value="">{tr?'Varlık seçin':'Select an asset'}</option>{projection?.nodes.filter(n=>n.kind==='asset'&&n.entity===entity).map(n=><option key={n.recordId} value={n.recordId}>{n.code} · {n.title}</option>)}</select>:
 f.type==='date'||f.type==='number'?<input required type={f.type} min={f.type==='number'?0:undefined} step={f.type==='number'?'any':undefined} value={String(values[f.key]??'')} onChange={e=>update(f.key,e.target.value)}/>:<textarea required maxLength={3000} value={String(values[f.key]??'')} onChange={e=>update(f.key,e.target.value)}/>}</label>)}
 {kind==='risk'&&<FairFields tr={tr} value={values.fairLite} update={v=>update('fairLite',v)}/>}</fieldset>
 {peopleError&&<p role="alert">{tr?'Yetkili kişiler yüklenemedi.':'Authorized people could not be loaded.'}</p>}
 {projection&&!projection.complete&&<p>{tr?'Bağlantı seçenekleri sınırlı. Önce hedef iştiraki seçin.':'Link options are limited. Select the target entity first.'}</p>}
 {error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy||!!peopleError}>{busy?(tr?'Oluşturuluyor…':'Creating…'):(tr?'Oluştur':'Create')}</button> <button type="button" disabled={busy} onClick={onClose}>{tr?'Vazgeç':'Cancel'}</button>
 </form>;
}
