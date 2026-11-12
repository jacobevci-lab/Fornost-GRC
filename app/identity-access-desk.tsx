"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { withBasePath } from "./base-path";
import { ACCESS_MODULES, canReadModule, FULL_ACCESS, NO_ACCESS, type ModuleAccess } from "./module-access";
import ModuleAccessEditor from "./module-access-editor";
import IdentityProfilePanel, { type ProfileSummary } from "./identity-profile-panel";
import { accountError, accountEvent, moduleLabel, modulePermission, roleLabel, scopeLabel, validDirectory, type AccessEvent, type Lang, type LocalUser } from "./identity-access-model";
import "./identity-access-desk.css";

type View="users"|"profile"|"roles"|"history";
type Draft={name:string;email:string;password:string;role:LocalUser["role"];moduleAccess:ModuleAccess};
type Confirmation={user:LocalUser;action:"delete"|"status"|"sessions"};
const dateLabel=(date:string,lang:Lang)=>new Date(date).toLocaleString(lang==="tr"?"tr-TR":"en-GB");

export default function IdentityAccessDesk({lang}:{lang:Lang}){
 const tr=lang==="tr",[view,setView]=useState<View>("users"),[users,setUsers]=useState<LocalUser[]>([]),[events,setEvents]=useState<AccessEvent[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[updated,setUpdated]=useState("");
 const [selectedId,setSelectedId]=useState(""),[query,setQuery]=useState(""),[role,setRole]=useState(""),[status,setStatus]=useState("");
 const [editor,setEditor]=useState<LocalUser|"new"|null>(null),[confirmation,setConfirmation]=useState<Confirmation|null>(null),[emailConfirm,setEmailConfirm]=useState("");
 const [busy,setBusy]=useState(false),[profile,setProfile]=useState<ProfileSummary>({status:"loading"});
 const sequence=useRef(0),mutation=useRef(false);
 const load=useCallback(async()=>{
  const current=++sequence.current;setLoading(true);setError("");
  try{const response=await fetch(withBasePath("/api/users"),{cache:"no-store",signal:AbortSignal.timeout(15000)}),body:unknown=await response.json();
   if(!response.ok||!validDirectory(body))throw Error("Unavailable");
   if(sequence.current===current){setUsers(body.users);setEvents(body.events);setUpdated(new Date().toISOString());}
  }catch{if(sequence.current===current)setError(tr?"Kullanıcı listesi okunamadı. Yenileyerek tekrar deneyin.":"The user list could not be loaded. Refresh to retry.");}
  finally{if(sequence.current===current)setLoading(false);}
 },[tr]);
 useEffect(()=>{const task=setTimeout(()=>void load(),0);return()=>{clearTimeout(task);sequence.current+=1}},[load]);
 const visible=users.filter(user=>(!role||user.role===role)&&(!status||user.status===status)&&`${user.name} ${user.email}`.toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang)));
 const selected=visible.find(user=>user.id===selectedId)||visible[0];
 const blocked=busy||loading||!!error;
 function clearFilters(){setQuery("");setRole("");setStatus("");setConfirmation(null);}
 function ask(user:LocalUser,action:Confirmation["action"]){setConfirmation({user,action});setEmailConfirm("");setMessage("");}
 async function write(method:"POST"|"PATCH"|"DELETE",data:Record<string,unknown>,user?:LocalUser,sessions=false):Promise<string|null>{
  if(mutation.current||loading||error)return tr?"Önce listeyi yenileyin.":"Refresh the list first.";
  mutation.current=true;setBusy(true);setMessage("");
  try{
   const response=await fetch(withBasePath(sessions?"/api/users/sessions":"/api/users"),{method,headers:{"content-type":"application/json"},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)}),body=await response.json();
   if(!response.ok||body.ok!==true){const text=accountError(body,lang);setMessage(text);if([404,409].includes(response.status)&&body.code!=="duplicate"){setEditor(null);setConfirmation(null);await load();}return text;}
   const text=sessions?(tr?"Yerel oturumlar sonlandırıldı. Kullanıcı tekrar giriş yapabilir.":"Local sessions ended. The user can sign in again."):method==="DELETE"?(tr?`${user?.email} hesabı silindi. Erişim geçmişi saklandı.`:`Deleted ${user?.email}. Access history was retained.`):method==="POST"?(tr?"Yerel hesap oluşturuldu.":"Local account created."):body.accessChanged?(tr?"Erişim güncellendi ve kullanıcının yerel oturumları sonlandırıldı.":"Access updated and the user's local sessions ended."):(tr?"Hesap bilgileri kaydedildi.":"Account details saved.");
   setMessage(text);setEditor(null);setConfirmation(null);
   if(method==="POST"){clearFilters();setSelectedId(body.id);setView("users");}
   if(body.currentSessionRevoked||(body.accessChanged&&user?.own)){window.dispatchEvent(new Event("focus"));return null;}
   await load();return null;
  }catch{
   const text=tr?"İşlem sonucu doğrulanamadı. Tekrar denemeden önce güncel listeyi ve erişim geçmişini kontrol edin.":"The result could not be verified. Check the refreshed list and access history before retrying.";
   setMessage(text);setEditor(null);setConfirmation(null);await load();return text;
  }finally{mutation.current=false;setBusy(false);}
 }
 async function confirmAction(){
  if(!confirmation||blocked)return;
  const {user,action}=confirmation;
  if(action==="delete"){
   if(user.own||user.lastAdmin||emailConfirm!==user.email)return;
   await write("DELETE",{id:user.id,email:user.email,expectedRevision:user.revision},user);
  }else if(action==="sessions")await write("DELETE",{userId:user.id},user,true);
  else await write("PATCH",{id:user.id,name:user.name,role:user.role,moduleAccess:user.moduleAccess,status:user.status==="Active"?"Disabled":"Active",expectedRevision:user.revision},user);
 }
 const tabs:[View,string][]=[["users",tr?"Kullanıcılar":"Users"],["profile",tr?"Kurumsal giriş":"Corporate sign-in"],["roles",tr?"Roller ve kapsam":"Roles & scope"],["history",tr?"Erişim geçmişi":"Access history"]];
 return <section className="iad" aria-label={tr?"Erişim çalışma masası":"Access workspace"}>
  <div className="iad-toolbar"><div className="iad-tabs" role="group" aria-label={tr?"Kimlik görünümleri":"Identity views"}>{tabs.map(([key,label])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>{setView(key);setConfirmation(null)}}>{label}</button>)}</div><button type="button" className="primary" aria-label={tr?"Kullanıcı ekle":"Add user"} disabled={blocked} onClick={()=>{setMessage("");setEditor("new")}}>+ {tr?"Kullanıcı ekle":"Add user"}</button></div>
  {view!=="profile"&&<div className="iad-profile-strip"><span>{profile.status==="loading"?(tr?"Kimlik profili okunuyor…":"Loading identity profile…"):profile.status==="error"?(tr?"Kimlik profili durumu alınamadı.":"Identity profile status is unavailable."):profile.status==="empty"?(tr?"Kurumsal kimlik profili yapılandırılmadı.":"No corporate identity profile is configured."):`${profile.provider} · ${tr?"Profil kayıtlı; SSO oturumu doğrulanmadı.":"Profile saved; SSO sign-in is unverified."}`}</span><button type="button" onClick={()=>setView("profile")}>{tr?"Profili aç":"Open profile"} →</button></div>}
  {message&&<p className="iad-notice" role="status">{message}</p>}
  {view!=="profile"&&<>
   <div className="iad-directory-toolbar"><h3>{view==="history"?(tr?"Erişim değişiklikleri":"Access changes"):view==="roles"?(tr?"Rol ve erişim kapsamı":"Roles and access scope"):(tr?"Kullanıcılar":"Users")} <span>{loading?"…":error?"—":`${users.length} ${tr?"hesap":"accounts"}`}</span></h3><button type="button" disabled={busy||loading} onClick={()=>{setConfirmation(null);void load()}}>{tr?"Yenile":"Refresh"}</button></div>
   {error?<div role="alert" className="iad-notice error">{error}</div>:loading?<p className="iad-empty" role="status">{tr?"Kullanıcılar yükleniyor…":"Loading users…"}</p>:view==="history"?<section className="iad-surface iad-history"><p>{tr?"En son 20 hesap ve yerel oturum değişikliği. Bu liste giriş denemeleri günlüğü değildir.":"The latest 20 account and local-session changes. This is not a sign-in attempts log."}</p><EventList events={events} lang={lang}/></section>:<>
    <div className="iad-workspace">
     <section className="iad-register iad-surface">
      <div className="iad-filters"><label><span className="sr-only">{tr?"Kullanıcı ara":"Search users"}</span><input value={query} onChange={e=>{setQuery(e.target.value);setConfirmation(null)}} placeholder={tr?"Ad veya e-posta ara":"Search name or email"}/></label><label><span className="sr-only">{tr?"Rol filtresi":"Role filter"}</span><select aria-label={tr?"Rol filtresi":"Role filter"} value={role} onChange={e=>{setRole(e.target.value);setConfirmation(null)}}><option value="">{tr?"Tüm roller":"All roles"}</option>{["Admin","Editor","Viewer"].map(r=><option key={r} value={r}>{roleLabel(r,lang)}</option>)}</select></label><label><span className="sr-only">{tr?"Durum filtresi":"Status filter"}</span><select aria-label={tr?"Durum filtresi":"Status filter"} value={status} onChange={e=>{setStatus(e.target.value);setConfirmation(null)}}><option value="">{tr?"Tüm durumlar":"All statuses"}</option><option value="Active">{tr?"Aktif":"Active"}</option><option value="Disabled">{tr?"Devre dışı":"Disabled"}</option></select></label></div>
      {visible.length>0?<div className="iad-table-scroll"><table><caption className="sr-only">{tr?"Hesap seçerek erişimini ve işlemlerini inceleyin":"Select an account to review access and actions"}</caption><thead><tr>{[tr?"Kullanıcı":"User",tr?"Kaynak":"Source",tr?"Rol":"Role",tr?"Kapsam":"Scope",tr?"Durum":"Status"].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map(user=><tr key={user.id} className={user.id===selected?.id?"is-selected":""}><td><button type="button" className="iad-user-select" aria-pressed={user.id===selected?.id} onClick={()=>{setSelectedId(user.id);setConfirmation(null)}}><span className="iad-avatar" aria-hidden="true">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></button></td><td>{tr?"Yerel":"Local"}</td><td>{roleLabel(user.role,lang)}</td><td>{scopeLabel(user,lang)}</td><td><span className={`iad-badge ${user.status==="Active"?"active":""}`}>{user.status==="Active"?(tr?"Aktif":"Active"):(tr?"Devre dışı":"Disabled")}</span>{user.locked_until&&Date.parse(user.locked_until)>Date.parse(updated)&&<small>{tr?"Geçici kilit":"Temporary lock"}</small>}</td></tr>)}</tbody></table></div>:<div className="iad-empty"><h4>{users.length?(tr?"Filtreyle eşleşen kullanıcı yok":"No users match the filters"):(tr?"Henüz yerel hesap yok":"No local accounts yet")}</h4>{users.length>0&&<button type="button" onClick={clearFilters}>{tr?"Filtreleri temizle":"Clear filters"}</button>}</div>}
      <div className="iad-recent"><h4>{tr?"Son erişim değişiklikleri":"Recent access changes"}</h4><EventList events={events.slice(0,3)} lang={lang}/><button className="iad-link" type="button" onClick={()=>setView("history")}>{tr?"Son 20 değişikliği gör":"View latest 20 changes"} →</button></div>
     </section>
     <section className="iad-detail iad-surface" aria-label={tr?"Seçili kullanıcı":"Selected user"}>
      {!selected?<p>{tr?"İncelemek için bir kullanıcı seçin.":"Select a user to review access."}</p>:<>
       <div className="iad-detail-header"><span className="iad-avatar large" aria-hidden="true">{initials(selected.name)}</span><div><h3>{selected.name}</h3><p>{selected.email}</p><span className="iad-badge">{tr?"Yerel hesap":"Local account"}</span></div><button type="button" disabled={blocked} onClick={()=>{setMessage("");setEditor(selected)}}>{tr?"Düzenle":"Edit"}</button></div>
       <dl className="iad-metadata"><dt>{tr?"Rol":"Role"}</dt><dd>{roleLabel(selected.role,lang)}</dd><dt>{tr?"Durum":"Status"}</dt><dd>{selected.status==="Active"?(tr?"Aktif":"Active"):(tr?"Devre dışı":"Disabled")}</dd></dl>
       {Number(selected.failed_attempts||0)>0&&<p>{selected.failed_attempts} {tr?"hatalı giriş denemesi":"failed sign-in attempts"}{selected.locked_until&&Date.parse(selected.locked_until)>Date.parse(updated)?` · ${tr?"Kilit bitişi":"Locked until"}: ${dateLabel(selected.locked_until,lang)}`:""}</p>}
       <h4>{tr?"Erişim kapsamı":"Access scope"}</h4><dl className="iad-permissions">{ACCESS_MODULES.filter(m=>view==="roles"||canReadModule(selected,m)).map(module=><div key={module}><dt>{moduleLabel(module,lang)}</dt><dd>{modulePermission(selected,module,lang)}</dd></div>)}</dl>
       <p>{selected.role==="Admin"||selected.moduleAccess.mode==="full"?(tr?"Tüm çalışma alanına rol sınırları içinde erişir.":"Access to the full workspace within role limits."):(tr?"Diğer modüllere, ortak raporlara ve gelişmiş iş akışlarına erişimi yok. İzinli modüllerin tüm kayıtları görünür.":"Other modules, shared reports and advanced workflows are unavailable. All records in permitted modules are visible.")}</p>
       {view==="roles"&&<p>{tr?"Viewer yalnız okur. Editor, izinli alanları düzenler. Kayıt silme ve kimlik yönetimi Admin yetkisi gerektirir.":"Viewers can read. Editors can edit permitted areas. Record deletion and identity administration require Admin."}</p>}
       <div className="iad-account-actions"><button type="button" disabled={blocked} onClick={()=>ask(selected,"sessions")}>{tr?"Yerel oturumları kapat":"End local sessions"}</button><button type="button" disabled={blocked||selected.lastAdmin} onClick={()=>ask(selected,"status")}>{selected.status==="Active"?(tr?"Devre dışı bırak":"Disable account"):(tr?"Etkinleştir":"Activate account")}</button></div>
       <p className="iad-footnote">{tr?"Yetki değişikliği yerel oturumları sonlandırır. Harici kimlik sağlayıcısının oturumları burada kapatılmaz.":"Access changes end local sessions. External identity-provider sessions are not revoked here."}</p>
       <button type="button" className="iad-danger" disabled={blocked||selected.own||selected.lastAdmin} onClick={()=>ask(selected,"delete")}>{tr?"Hesabı sil":"Delete account"}</button>
       {(selected.own||selected.lastAdmin)&&<p className="iad-footnote">{selected.lastAdmin?(tr?"Son aktif yönetici devre dışı bırakılamaz veya silinemez.":"The last active administrator cannot be disabled or deleted."):(tr?"Kendi hesabınızı silemezsiniz.":"You cannot delete your own account.")}</p>}
       {confirmation?.user.id===selected.id&&<div className="iad-confirm" role="group" aria-label={tr?"İşlem onayı":"Confirm account action"}>
        <p>{confirmation.action==="delete"?(tr?`${selected.email} silinecek ve yerel oturumları kapatılacak. Erişim geçmişi saklanır.`:`Delete ${selected.email} and end its local sessions? Access history is retained.`):confirmation.action==="sessions"?(tr?`${selected.email} hesabının tüm yerel oturumları sonlandırılacak; tekrar giriş yapabilir.`:`End all local sessions for ${selected.email}? They can sign in again.`):selected.status==="Active"?(tr?`${selected.email} devre dışı bırakılacak ve yerel oturumları kapatılacak.`:`Disable ${selected.email} and end its local sessions?`):(tr?`${selected.email} yeniden giriş yapabilecek.`:`Allow ${selected.email} to sign in again?`)}</p>
        {confirmation.action==="delete"&&<label>{tr?"Onay için e-posta adresini yazın":"Type the email address to confirm"}<input value={emailConfirm} autoComplete="off" onChange={e=>setEmailConfirm(e.target.value)}/></label>}
        <div className="iad-account-actions"><button type="button" disabled={busy} onClick={()=>setConfirmation(null)}>{tr?"Vazgeç":"Cancel"}</button><button type="button" className={confirmation.action==="delete"?"iad-danger":"primary"} disabled={blocked||(confirmation.action==="delete"&&emailConfirm!==selected.email)} onClick={()=>void confirmAction()}>{busy?(tr?"İşleniyor…":"Working…"):(tr?"İşlemi onayla":"Confirm action")}</button></div>
       </div>}
      </>}
     </section>
    </div>
   </>}
   {updated&&!error&&<p className="iad-updated">{tr?"Son okuma":"Last read"}: {dateLabel(updated,lang)}</p>}
  </>}
  <div hidden={view!=="profile"}><IdentityProfilePanel lang={lang} onSummary={setProfile}/></div>
  {editor&&<AccountEditor key={editor==="new"?"new":editor.id} user={editor==="new"?undefined:editor} lang={lang} busy={busy} onClose={()=>setEditor(null)} onSave={draft=>write(editor==="new"?"POST":"PATCH",editor==="new"?{...draft,moduleAccess:draft.role==="Admin"?FULL_ACCESS:draft.moduleAccess}:{id:editor.id,name:draft.name,role:draft.role,moduleAccess:draft.role==="Admin"?FULL_ACCESS:draft.moduleAccess,status:editor.status,expectedRevision:editor.revision},editor==="new"?undefined:editor)}/>}
 </section>;
}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join("").toLocaleUpperCase("tr-TR");}
function EventList({events,lang}:{events:AccessEvent[];lang:Lang}){return events.length?<ul className="iad-events">{events.map(event=><li key={event.id}><div><strong>{accountEvent(event.after_json,lang)}</strong><span>{event.email}</span><small>{lang==="tr"?"İşlemi yapan":"Actor"}: {event.actor}</small></div><time dateTime={event.created_at}>{dateLabel(event.created_at,lang)}</time></li>)}</ul>:<p>{lang==="tr"?"Henüz kayıtlı erişim değişikliği yok.":"No recorded access changes yet."}</p>;}
function AccountEditor({user,lang,busy,onClose,onSave}:{user?:LocalUser;lang:Lang;busy:boolean;onClose:()=>void;onSave:(draft:Draft)=>Promise<string|null>}){
 const tr=lang==="tr",dialog=useRef<HTMLDialogElement>(null);
 const [initial]=useState<Draft>(()=>({name:user?.name||"",email:user?.email||"",password:"",role:user?.role||"Viewer",moduleAccess:user?.moduleAccess||NO_ACCESS}));
 const [draft,setDraft]=useState(initial),[error,setError]=useState(""),[discard,setDiscard]=useState(false);
 const dirty=JSON.stringify(draft)!==JSON.stringify(initial);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close()},[]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=""}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn)},[dirty]);
 function close(){if(busy)return;if(dirty)setDiscard(true);else onClose();}
 async function submit(event:FormEvent){event.preventDefault();if(busy||discard)return;setError("");const result=await onSave(draft);if(result)setError(result);}
 return <dialog ref={dialog} className="iad-dialog" aria-labelledby="iad-editor-title" onCancel={e=>{e.preventDefault();close()}}><form onSubmit={submit}>
  <header><div><h3 id="iad-editor-title">{user?(tr?"Kullanıcıyı düzenle":"Edit user"):(tr?"Yerel kullanıcı ekle":"Add local user")}</h3><p>{user?.email||(tr?"Rolü ve erişebileceği modülleri belirleyin.":"Choose a role and permitted modules.")}</p></div><button type="button" disabled={busy} onClick={close} aria-label={tr?"Kapat":"Close"}>×</button></header>
  <fieldset disabled={busy||discard}><div className="iad-fields"><label>{tr?"Ad soyad":"Full name"}<input name="name" required maxLength={120} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>{!user&&<><label>{tr?"E-posta":"Email"}<input name="email" type="email" required maxLength={254} autoComplete="off" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label><label>{tr?"İlk giriş parolası":"Initial password"}<input name="password" type="password" required minLength={12} autoComplete="new-password" value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label></>}<label>{tr?"Rol":"Role"}<select aria-label={tr?"Rol":"Role"} name="role" value={draft.role} disabled={user?.lastAdmin} onChange={e=>{const role=e.target.value as Draft["role"];setDraft({...draft,role,moduleAccess:role==="Admin"?FULL_ACCESS:draft.moduleAccess})}}>{["Viewer","Editor","Admin"].map(role=><option key={role} value={role}>{roleLabel(role,lang)}</option>)}</select></label></div>
   {!user&&<p>{tr?"En az 12 karakter; büyük/küçük harf, sayı ve özel karakter. Bu sürüm ilk girişte parola değişimini zorunlu tutmaz.":"At least 12 characters including uppercase, lowercase, number and symbol. This version does not enforce a first-login password change."}</p>}
   {user?.lastAdmin&&<p>{tr?"Son aktif yöneticinin rolü düşürülemez.":"The last active administrator cannot be demoted."}</p>}
   <ModuleAccessEditor value={draft.moduleAccess} role={draft.role} lang={lang} onChange={moduleAccess=>setDraft({...draft,moduleAccess})}/>
   <p className="iad-notice">{user?`${roleLabel(user.role,lang)} → ${roleLabel(draft.role,lang)} · ${scopeLabel(draft,lang)}`:`${roleLabel(draft.role,lang)} · ${scopeLabel(draft,lang)}`}{user&&<><br/>{tr?"Rol veya kapsam değişirse yerel oturumları kapatılır.":"Role or scope changes end local sessions."}</>}</p>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
  {discard&&<div className="iad-notice" role="group" aria-label={tr?"Kaydedilmemiş değişiklikler":"Unsaved changes"}><p>{tr?"Kaydedilmemiş değişiklikleri bırakmak istiyor musunuz?":"Discard unsaved changes?"}</p><button type="button" onClick={()=>setDiscard(false)}>{tr?"Düzenlemeye dön":"Keep editing"}</button><button type="button" onClick={onClose}>{tr?"Değişiklikleri bırak":"Discard changes"}</button></div>}
  <footer><button type="button" disabled={busy} onClick={close}>{tr?"Vazgeç":"Cancel"}</button><button className="primary" disabled={busy||discard||!draft.name.trim()||(!!user&&!dirty)}>{busy?(tr?"Kaydediliyor…":"Saving…"):user?(tr?"Değişiklikleri kaydet":"Save changes"):(tr?"Hesap oluştur":"Create account")}</button></footer>
 </form></dialog>;
}
