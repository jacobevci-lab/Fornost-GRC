'use client';
import {useState} from 'react';
import {type Access,type Directory,request,useData,issue} from './client';
import {Register} from './workspace';
import type {DirectoryRule} from './directory';
const roles={'group-admin':['Grup Admin','Group admin'],'group-ciso':['Grup CISO','Group CISO'],'entity-manager':['İştirak yöneticisi','Entity manager'],contributor:['Katılımcı','Contributor']};
const entityTypes={holding:['Holding','Holding'],company:['Ana şirket','Parent company'],subsidiary:['İştirak','Subsidiary'],unit:['İş birimi','Business unit']};
type Role=keyof typeof roles;
export function OrganizationAdmin({tr}:{tr:boolean}){
 const {data,error,reload}=useData<Access>('enterprise/scope?manage=1'),[message,msg]=useState(''),[busy,setBusy]=useState(false);
 const [person,setPerson]=useState(''),[role,setRole]=useState<Role>('contributor'),[grants,setGrants]=useState<string[]>([]);
 if(!data||!data.manage)return <p>{error?issue(tr,null):data?(tr?'Grup yöneticisi yetkisi gerekli.':'Group administrator access required.'):(tr?'Yükleniyor…':'Loading…')}</p>;
 const selected=data.users.find(x=>x.id===person);
 async function save(body:object,done:()=>void){if(busy)return;setBusy(true);try{await request('enterprise/scope',body);msg(tr?'Kaydedildi.':'Saved.');done();reload();window.dispatchEvent(new Event('fornost:org-updated'))}catch(e){msg(issue(tr,e))}finally{setBusy(false)}}
 return <div className="ec-stack"><section className="ec-panel"><h3>{tr?'Kurum hiyerarşisi':'Organization hierarchy'}</h3><ul>{data.entities.map(e=><li key={e.id}><b>{e.name}</b> · {entityTypes[e.kind as keyof typeof entityTypes]?.[tr?0:1]} {e.parent_id&&' · '+data.entities.find(p=>p.id===e.parent_id)?.name}</li>)}</ul>
 <form className="ec-toolbar" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void save({action:'entity',...Object.fromEntries(new FormData(form))},()=>form.reset())}}>
 <label>{tr?'Kurum adı':'Entity name'}<input name="name" maxLength={120} required/></label><label>{tr?'Tür':'Type'}<select name="kind">{(['company','subsidiary','unit'] as const).map(k=><option value={k} key={k}>{entityTypes[k][tr?0:1]}</option>)}</select></label><label>{tr?'Üst kurum':'Parent entity'}<select name="parent">{data.entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><button disabled={busy}>{tr?'Kurum ekle':'Add entity'}</button></form>
 <p>{tr?'İlk bağlı kurum eklenince, kapsam atanmamış yönetici dışı kullanıcılar kayıt göremez. Mevcut kayıtlar Holding kapsamındadır.':'After adding the first entity, non-admin users need an explicit scope. Existing records belong to the holding.'}</p></section>
 <section className="ec-panel"><h3>{tr?'Kullanıcı kapsamı':'User scope'}</h3><form className="ec-editor" onSubmit={e=>{e.preventDefault();if(selected)void save({action:'grant',user:person,role,entities:role.startsWith('group-')?[]:grants,revision:selected.revision||''},()=>setPerson(''))}}>
 <label>{tr?'Kullanıcı':'User'}<select required value={person} onChange={e=>{const u=data.users.find(u=>u.id===e.target.value);setPerson(e.target.value);setRole((u?.role||(u?.platformRole==='Admin'?'group-admin':'contributor')) as Role);setGrants(JSON.parse(u?.memberships||'[]'))}}><option value="">{tr?'Seçin':'Select'}</option>{data.users.filter(u=>u.id!==data.self).map(u=><option value={u.id} key={u.id}>{u.name} · {u.email}</option>)}</select></label>
 <label>{tr?'Kurum rolü':'Organization role'}<select value={role} onChange={e=>setRole(e.target.value as Role)}>{Object.entries(roles).filter(([k])=>k!=='group-admin'||selected?.platformRole==='Admin').map(([k,l])=><option value={k} key={k}>{l[tr?0:1]}</option>)}</select></label>
 {!role.startsWith('group-')&&<fieldset><legend>{tr?'Yetkili kurumlar ve alt birimleri':'Authorized entities and descendants'}</legend>{data.entities.map(e=><label key={e.id}><input type="checkbox" checked={grants.includes(e.id)} onChange={v=>setGrants(v.target.checked?[...grants,e.id]:grants.filter(id=>id!==e.id))}/>{e.name}</label>)}</fieldset>}
 <button disabled={!selected||busy}>{tr?'Yetkiyi kaydet':'Save grant'}</button></form></section>{message&&<p role="status">{message}</p>}
 <Register tr={tr} access={data}/></div>;
}
export function DirectoryAdmin({tr}:{tr:boolean}){
 const access=useData<Access>('enterprise/scope'),dir=useData<Directory>('enterprise/directory');
 const [draft,setDraft]=useState<{revision:string;rules:DirectoryRule[]}|null>(null),[token,setToken]=useState(''),[message,msg]=useState(''),[busy,setBusy]=useState(false);
 const d=dir.data,org=access.data,idx=tr?0:1;
 if(!d||!org)return <p role="status">{dir.error||access.error?issue(tr,null):tr?'Yükleniyor…':'Loading…'}</p>;
 const rules=draft?.rules??d.rules,change=(rules:DirectoryRule[])=>setDraft({revision:draft?.revision??d.revision,rules});
 async function submit(action:'rules'|'rotate'|'revoke'){
  if(!d||busy)return;setBusy(true);msg('');try{
   const v=await request<{token?:string}>('enterprise/directory',{action,revision:action==='rules'?(draft?.revision??d.revision):d.tokenRevision,...(action==='rules'?{rules}:{})});
   if(action==='rules')setDraft(null);else setToken(v.token||'');dir.reload();msg(tr?'Kaydedildi.':'Saved.');
  }catch(e){msg(issue(tr,e));dir.reload()}finally{setBusy(false)}
 }
 async function test(form:FormData){
  setBusy(true);try{
   const core='urn:ietf:params:scim:schemas:core:2.0:User',ext='urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
   const r=await request<{result:string;role:Role;entities:string[]}>('scim/v2/preview',{schemas:[core,ext],userName:form.get('name'),groups:String(form.get('group')).split(',').map(x=>x.trim()).filter(Boolean).map(value=>({value})),[ext]:{department:form.get('department')}},'POST',token);
   msg(r.result==='matched'?(tr?'Önizleme · ':'Preview · ')+roles[r.role][idx]+' · '+r.entities.map(id=>org?.entities.find(e=>e.id===id)?.name).join(', '):r.result==='conflict'?(tr?'Rol kuralları çakışıyor.':'Conflicting role rules.'):(tr?'Eşleşen kural yok.':'No matching rule.'));
  }catch(e){msg(issue(tr,e))}finally{setBusy(false)}
 }
 return <section className="ec-panel"><h3>{tr?'SSO rol eşleme ve SCIM provizyonlama simülasyonu':'SSO role mapping and SCIM provisioning simulation'}</h3>
 <form className="ec-editor" onSubmit={e=>{e.preventDefault();void submit('rules')}}>{rules.map((r,i)=>{
 const update=(patch:Partial<DirectoryRule>)=>change(rules.map((old,n)=>n===i?{...old,...patch}:old));
 return <fieldset className="ec-toolbar" key={i}><label>{tr?'Eşleme alanı':'Attribute'}<select value={r.attribute} onChange={e=>update({attribute:e.target.value as DirectoryRule['attribute']})}><option value="department">{tr?'Departman':'Department'}</option><option value="group">{tr?'Grup':'Group'}</option></select></label>
 <label>{tr?'Dizin değeri':'Directory value'}<input required maxLength={160} value={r.value} onChange={e=>update({value:e.target.value})}/></label><label>{tr?'Kurum':'Entity'}<select value={r.entity} onChange={e=>update({entity:e.target.value})}>{org.entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
 <label>{tr?'Rol':'Role'}<select value={r.role} onChange={e=>update({role:e.target.value as DirectoryRule['role']})}>{(['entity-manager','contributor'] as const).map(k=><option key={k} value={k}>{roles[k][idx]}</option>)}</select></label><button type="button" onClick={()=>change(rules.filter((_,n)=>n!==i))}>{tr?'Kaldır':'Remove'}</button></fieldset>})}
 <div><button type="button" onClick={()=>change([...rules,{attribute:'group',value:'',entity:'root',role:'contributor'}])}>{tr?'+ Eşleme kuralı':'+ Mapping rule'}</button> <button disabled={!draft||busy}>{tr?'Kuralları kaydet':'Save rules'}</button></div></form>
 <h4>SCIM 2.0 Bearer Token</h4><p>{tr?'Bu anahtar yalnızca provizyonlama simülasyonuna erişir. Yeni anahtar eskisinin erişimini sonlandırır.':'This key accesses the provisioning simulation. Generating a new key revokes the previous one.'}</p>
 <button disabled={busy} onClick={()=>void submit('rotate')}>{d.tokenRevision?(tr?'Anahtarı yenile':'Rotate token'):(tr?'Anahtar üret':'Generate token')}</button> {d.tokenRevision&&<button disabled={busy} onClick={()=>void submit('revoke')}>{tr?'Anahtarı iptal et':'Revoke token'}</button>}
 <form className="ec-editor" onSubmit={e=>{e.preventDefault();void test(new FormData(e.currentTarget))}}><label>{tr?'Oturuma özel anahtar (kopyalamak için seçin)':'Session-only token (select to copy)'}<input type="password" required value={token} autoComplete="off" onChange={e=>setToken(e.target.value)}/></label>
 <label>{tr?'Örnek kullanıcı':'Sample user'}<input required name="name" type="email"/></label><label>{tr?'Departman':'Department'}<input name="department"/></label><label>{tr?'Gruplar (virgülle)':'Groups (comma-separated)'}<input name="group"/></label><button disabled={busy||!token||!!draft}>{tr?'Bağlantıyı Test Et':'Test connection'}</button></form>
 {message&&<p role="status">{message}</p>}</section>;
}
