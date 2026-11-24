'use client';
import {useEffect,useState} from 'react';
import {type Access,type Kind,issue,labels,request,useData} from './client';
import {FairDetail,FairFields} from './fair-panel';
import {auditTypes} from '../audit-engagement';
import type {Estimate} from './fair';
export function ScopeSelect({tr}:{tr:boolean}){
 const {data,error,reload}=useData<Access>('enterprise/scope'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{window.addEventListener('fornost:org-updated',reload);return ()=>window.removeEventListener('fornost:org-updated',reload)},[reload]);
 if(error)return <small role="alert">{tr?'Kapsam okunamadı':'Scope unavailable'}</small>;
 if(!data)return null;
 async function select(id:string){setBusy(true);try{await request('enterprise/scope',{action:'select',entity:id||null});window.location.reload()}catch(e){setMessage(issue(tr,e));setBusy(false)}}
 return <label className="ec-selector"><span>{tr?'Kurumsal çalışma alanı':'Enterprise workspace'}</span><select disabled={busy} value={data.scope.selected??''} onChange={e=>void select(e.target.value)}>
 <option value="">{data.scope.group?(tr?'Tüm Kurum (Konsolide Görünüm)':'All entities (consolidated)'):(tr?'Yetkili kapsamlarım':'My authorized scopes')}</option>
 {data.entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>{message&&<small role="alert">{message}</small>}</label>;
}
const fieldLabels:Record<string,[string,string]>={description:['Açıklama','Description'],service:['Hizmet','Service'],contact:['İletişim','Contact'],audience:['Hedef kitle','Audience'],audit_type:['Denetim türü','Audit type'],business_impact:['İş etkisi','Business impact']};
const states:Record<string,[string,string]>={draft:['Taslak','Draft'],open:['Açık','Open'],closed:['Kapalı','Closed'],declared:['Beyan edildi','Declared'],triage:['İlk değerlendirme','Triage'],contained:['Sınırlandırıldı','Contained'],resolved:['Çözüldü','Resolved'],archived:['Arşivlendi','Archived'],active:['Aktif','Active'],approved:['Onaylandı','Approved'],published:['Yayında','Published'],review:['İncelemede','In review'],in_review:['İncelemede','In review'],verification:['Doğrulamada','In verification'],retired:['Emekli','Retired'],onboarding:['Kabul sürecinde','Onboarding'],suspended:['Askıda','Suspended'],rejected:['Reddedildi','Rejected'],cancelled:['İptal edildi','Cancelled']};
const enStatus:Record<string,string>={'Açık':'Open','Kapalı':'Closed','Aktif':'Active','Başlanmadı':'Not started','Planlanan':'Planned','Taslak':'Draft','İncelemede':'In review','Askıda':'Suspended','Arşivlendi':'Archived','Onaylandı':'Approved','Tamamlandı':'Completed','Devam Ediyor':'In progress','Değerlendiriliyor':'In assessment','İyileştirme Gerekli':'Improvement required','Aksiyon Devam Ediyor':'Action in progress','Kabul Edildi':'Accepted','Bakımda':'Under maintenance','Devre Dışı':'Disabled','Sonlandırıldı':'Terminated'};
type Row={source:string;field:string|null;field_value:string;id:string;code:string|null;title:string;status:string;org_entity_id:string;note:string;revision:string;estimate:string|null};
export function Register({tr,access}:{tr:boolean;access:Access}){
 const [kind,setKind]=useState<Kind>(access.readable[0]||'risk'),[page,setPage]=useState(0),[editing,edit]=useState<Row|null>(null);
 const {data,error,reload}=useData<{rows:Row[];more:boolean}>(`enterprise/records?kind=${kind}&offset=${page*100}`);
 const [native,setNative]=useState(''),[note,setNote]=useState(''),[entity,setEntity]=useState(''),[estimate,setEstimate]=useState<unknown>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 if(!access.readable.length)return <p>{tr?'Yetkili modül yok.':'No permitted modules.'}</p>;
 async function save(){if(!editing||busy)return;setBusy(true);try{
  await request('enterprise/records',{kind,id:editing.id,entity,note,revision:editing.revision,...(editing.field&&native!==editing.field_value?{fieldEdit:{source:editing.source,field:editing.field,previous:editing.field_value,value:native}}:{}),...(kind==='risk'?{fairLite:estimate,previousEstimate:editing.estimate}:{})},'PATCH');
  edit(null);reload();setMessage(tr?'Kayıt güncellendi.':'Record updated.');
 }catch(e){setMessage(issue(tr,e));reload()}finally{setBusy(false)}}
 return <section className="ec-panel"><div className="ec-toolbar"><h3>{tr?'Kapsam kayıtları':'Scoped records'}</h3>
 <select aria-label={tr?'Modül':'Module'} value={kind} onChange={e=>{setKind(e.target.value as Kind);setPage(0);edit(null);setMessage('')}}>{access.readable.map(k=><option value={k} key={k}>{labels[k][tr?0:1]}</option>)}</select><button onClick={()=>{edit(null);reload()}}>{tr?'Yenile':'Refresh'}</button></div>
 {error?<p role="alert">{issue(tr,null)}</p>:!data?<p role="status">{tr?'Yükleniyor…':'Loading…'}</p>:!data.rows.length?<p>{tr?'Bu kapsamda kayıt yok.':'No records in this scope.'}</p>:<div className="ec-scroll"><table><thead><tr>{(tr?['Kayıt','Kurum','Durum','']:['Record','Entity','Status','']).map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td><b>{row.code}</b> {row.title}</td><td>{access.entities.find(e=>e.id===row.org_entity_id)?.name}</td><td>{states[row.status]?.[tr?0:1]||(!tr&&enStatus[row.status])||row.status}</td><td><button onClick={()=>{edit(row);setNative(row.field_value);setNote(row.note);setEntity(row.org_entity_id);setEstimate(row.estimate?JSON.parse(row.estimate):null);setMessage('')}}>{tr?'Aç':'Open'}</button></td></tr>)}</tbody></table></div>}
 {(page>0||data?.more)&&<div className="ec-toolbar"><button disabled={!page} onClick={()=>{edit(null);setPage(page-1)}}>←</button><span>{page+1}</span><button disabled={!data?.more} onClick={()=>{edit(null);setPage(page+1)}}>→</button></div>}
 {editing&&<form className="ec-editor" onSubmit={e=>{e.preventDefault();void save()}}><h4>{editing.code} {editing.title}</h4><fieldset disabled={busy||!access.writable.includes(kind)}>
 {access.manage&&<label>{tr?'Kayıt kapsamı':'Record scope'}<select value={entity} onChange={e=>setEntity(e.target.value)}>{access.entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}
 {editing.field&&<label>{fieldLabels[editing.field]?.[tr?0:1]}{editing.field==='audit_type'?<select value={native} onChange={e=>setNative(e.target.value)}>{auditTypes.map(([t,en])=><option key={t} value={t}>{tr?t:en}</option>)}</select>:<textarea maxLength={1000} value={native} onChange={e=>setNative(e.target.value)}/>}</label>}
 <label>{tr?'Kayıt çalışma notu':'Record working note'}<textarea maxLength={4000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 {kind==='risk'&&<FairFields tr={tr} value={estimate} update={setEstimate}/>}</fieldset>
 {kind==='risk'&&<FairDetail tr={tr} value={estimate as Estimate}/>}
 {access.writable.includes(kind)&&<button className="primary" disabled={busy}>{tr?'Kaydet':'Save'}</button>} <button type="button" onClick={()=>edit(null)}>{tr?'Kapat':'Close'}</button></form>}
 {message&&<p role="status">{message}</p>}</section>;
}
export function ScopedWorkspace(){
 const {data,error,reload}=useData<Access>('enterprise/scope'),[tr,setTr]=useState(()=>typeof window==='undefined'||localStorage.getItem('fornost-grc-language')!=='en'),[dark,setDark]=useState(()=>typeof window!=='undefined'&&localStorage.getItem('fornost-grc-theme-v5')==='dark');
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.lang=tr?'tr':'en'},[dark,tr]);
 return <main className="ec-shell"><header className="ec-toolbar"><h1>{tr?'Kurumsal çalışma alanı':'Enterprise workspace'}</h1><ScopeSelect tr={tr}/><button onClick={()=>{localStorage.setItem('fornost-grc-language',tr?'en':'tr');setTr(!tr)}}>{tr?'EN':'TR'}</button><button onClick={()=>{localStorage.setItem('fornost-grc-theme-v5',dark?'light':'dark');setDark(!dark)}}>{tr?(dark?'Açık tema':'Koyu tema'):(dark?'Light theme':'Dark theme')}</button><button onClick={async()=>{await request('auth',{action:'logout'});location.reload()}}>{tr?'Çıkış':'Sign out'}</button></header>
 {data?<Register tr={tr} access={data}/>:error?<button onClick={reload}>{tr?'Tekrar dene':'Retry'}</button>:<p>{tr?'Yükleniyor…':'Loading…'}</p>}</main>;
}
