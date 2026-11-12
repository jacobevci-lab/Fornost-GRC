"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { withBasePath } from "./base-path";
import type { Lang } from "./identity-access-model";
export type ProfileSummary={status:"loading"|"error"|"empty"|"saved";provider?:string};
type Profile={provider:string;enabled:boolean;config:Record<string,string|boolean>;updated_at:string;updated_by:string;hasSecret:boolean};
type Draft={provider:string;config:Profile["config"];secret:string};
const providers:Record<string,string>={"entra-oidc":"Microsoft Entra ID (OIDC)","okta-oidc":"Okta (OIDC)","generic-oidc":"OpenID Connect",saml:"SAML 2.0",ldap:"LDAP",ldaps:"LDAPS"};
const oidc=["issuer","clientId","redirectUri","groupsClaim"],ldap=["bridgeUrl","directoryUrl","baseDn","bindDn","userFilter"];
const fields:Record<string,string[]>={"entra-oidc":["issuer","tenantId","clientId","redirectUri","groupsClaim"],"okta-oidc":oidc,"generic-oidc":oidc,saml:["metadataUrl","entityId","acsUrl"],ldap,ldaps:ldap};
const labels:Record<string,string>={issuer:"Issuer URL",tenantId:"Tenant ID",clientId:"Client ID",redirectUri:"Redirect URI",groupsClaim:"Groups claim",metadataUrl:"IdP metadata URL",entityId:"SP entity ID",acsUrl:"ACS URL",bridgeUrl:"IAM bridge URL",directoryUrl:"Directory URL",baseDn:"Base DN",bindDn:"Bind DN",userFilter:"User filter"};
const empty:Draft={provider:"entra-oidc",config:{},secret:""};
function validProfile(value:unknown):value is Profile{
 if(!value||typeof value!=="object")return false;const row=value as Profile;
 return Object.hasOwn(providers,row.provider)&&typeof row.enabled==="boolean"&&typeof row.updated_at==="string"&&typeof row.updated_by==="string"&&typeof row.hasSecret==="boolean"&&!!row.config&&typeof row.config==="object"&&!Array.isArray(row.config)&&Object.values(row.config).every(v=>typeof v==="string"||typeof v==="boolean");
}
export default function IdentityProfilePanel({lang,onSummary}:{lang:Lang;onSummary:(summary:ProfileSummary)=>void}){
 const tr=lang==="tr",[stored,setStored]=useState<Profile|null>(null),[draft,setDraft]=useState<Draft>(empty),[initial,setInitial]=useState<Draft>(empty);
 const [loading,setLoading]=useState(true),[readError,setReadError]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[discard,setDiscard]=useState(false),[testResult,setTestResult]=useState<"passed"|"failed"|null>(null);
 const sequence=useRef(0),operation=useRef(false),dirty=JSON.stringify(draft)!==JSON.stringify(initial);
 const load=useCallback(async()=>{
  const current=++sequence.current;setLoading(true);setReadError(false);setTestResult(null);onSummary({status:"loading"});
  try{
   const response=await fetch(withBasePath("/api/integrations"),{cache:"no-store",signal:AbortSignal.timeout(15000)}),body=await response.json();
   if(!response.ok||!Array.isArray(body.integrations))throw Error("Unavailable");
   const row=body.integrations.find((item:{kind?:string})=>item?.kind==="identity");if(row&&!validProfile(row))throw Error("Invalid profile");
   if(sequence.current!==current)return;
   const next=row?{provider:row.provider,config:row.config,secret:""}:empty;
   setStored(row||null);setDraft(next);setInitial(next);onSummary({status:row?"saved":"empty",provider:row?providers[row.provider]:undefined});
  }catch{if(sequence.current===current){setReadError(true);onSummary({status:"error"});}}
  finally{if(sequence.current===current)setLoading(false);}
 },[onSummary]);
 useEffect(()=>{const task=setTimeout(()=>void load(),0);return()=>{clearTimeout(task);sequence.current+=1}},[load]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=""}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn)},[dirty]);
 const blocked=loading||readError||busy;
 function reload(){if(dirty){setDiscard(true);return;}setMessage("");void load();}
 async function save(event:FormEvent){
  event.preventDefault();if(blocked||operation.current)return;operation.current=true;setBusy(true);setMessage("");setTestResult(null);
  try{
   const response=await fetch(withBasePath("/api/integrations"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"identity",...draft,enabled:stored?.enabled||false,expectedUpdatedAt:stored?.updated_at||""}),signal:AbortSignal.timeout(15000)}),body=await response.json();
   if(!response.ok||body.ok!==true){setMessage(body.error||(tr?"Profil kaydedilemedi.":"Profile could not be saved."));if(response.status===409){setReadError(true);onSummary({status:"error"});}return;}
   setMessage(tr?"Profil kaydedildi. Bu işlem SSO oturum açmayı etkinleştirmez.":"Profile saved. This does not enable SSO sign-in.");await load();
  }catch{setMessage(tr?"Kaydetme sonucu doğrulanamadı. Tekrar denemeden önce profili yenileyin.":"Save result could not be verified. Refresh the profile before retrying.");setReadError(true);onSummary({status:"error"});}
  finally{operation.current=false;setBusy(false);}
 }
 async function test(){
  if(blocked||dirty||!stored||operation.current)return;operation.current=true;setBusy(true);setMessage("");setTestResult(null);
  try{
   const response=await fetch(withBasePath("/api/integrations"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"identity",action:"test",expectedUpdatedAt:stored.updated_at}),signal:AbortSignal.timeout(15000)}),body=await response.json();
   if(response.ok&&body.ok===true)setTestResult("passed");else{setTestResult("failed");setMessage(body.error||(tr?"Profil kontrolü başarısız.":"Profile check failed."));if(response.status===409){setReadError(true);onSummary({status:"error"});}}
  }catch{setTestResult("failed");setMessage(tr?"Kontrol sonucu doğrulanamadı.":"The check result could not be verified.");}
  finally{operation.current=false;setBusy(false);}
 }
 return <section className="iad-profile iad-surface">
  <header className="iad-profile-header"><div><h3>{tr?"Kurumsal kimlik profili":"Corporate identity profile"}</h3><p>{tr?"Entra, Okta, OIDC, SAML ve LDAP/LDAPS bağlantı bilgileri.":"Connection settings for Entra, Okta, OIDC, SAML and LDAP/LDAPS."}</p></div><button type="button" disabled={loading||busy} onClick={reload}>{tr?"Profili yenile":"Refresh profile"}</button></header>
  <div className="iad-notice"><strong>{tr?"Bu ekranda profil yönetimi ve bağlantı ön kontrolü yapılır.":"This screen manages profiles and connection preflight checks."}</strong><p>{tr?"Profil kaydı veya başarılı metaveri kontrolü, SSO ile oturum açıldığını kanıtlamaz. Yerleşik OIDC/SAML giriş akışı, MFA ve SCIM bu ayarlardan etkinleşmez. Yerel hesaplar ayrı yönetilir.":"Saving a profile or passing a metadata check does not prove SSO sign-in. Native OIDC/SAML login, MFA and SCIM are not enabled by these settings. Local accounts are managed separately."}</p></div>
  {message&&<p className="iad-notice" role="status">{message}</p>}
  {readError&&<p className="iad-notice error" role="alert">{tr?"Güncel profil doğrulanamadı. Kaydetme ve test kapalı; yenileyerek tekrar deneyin.":"The current profile could not be verified. Save and test are blocked; refresh to retry."}</p>}
  {discard&&<div className="iad-notice" role="group" aria-label={tr?"Profil değişiklikleri":"Profile changes"}><p>{tr?"Yenilemek kaydedilmemiş profil değişikliklerini bırakır.":"Refreshing discards unsaved profile changes."}</p><button type="button" onClick={()=>setDiscard(false)}>{tr?"Düzenlemeye dön":"Keep editing"}</button><button type="button" onClick={()=>{setDiscard(false);setMessage("");void load()}}>{tr?"Değişiklikleri bırak ve yenile":"Discard and refresh"}</button></div>}
  {loading?<p role="status">{tr?"Profil okunuyor…":"Loading profile…"}</p>:<form onSubmit={save}><fieldset disabled={blocked||discard}><label>{tr?"Sağlayıcı":"Provider"}<select aria-label={tr?"Sağlayıcı":"Provider"} value={draft.provider} onChange={e=>{setDraft({provider:e.target.value,config:{},secret:""});setTestResult(null);setMessage("")}}>{Object.entries(providers).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="iad-fields">{fields[draft.provider].map(key=><label key={key}>{labels[key]}<input value={String(draft.config[key]||"")} autoComplete="off" maxLength={2048} onChange={e=>{setDraft({...draft,config:{...draft.config,[key]:e.target.value}});setTestResult(null)}}/></label>)}<label>Client secret / Bind secret<input type="password" autoComplete="new-password" maxLength={4096} value={draft.secret} placeholder={stored?.hasSecret&&draft.provider===stored.provider?(tr?"Kayıtlı sır korunur; değiştirmek için yazın":"Saved secret retained; enter to replace"):(tr?"Kaydedildikten sonra gösterilmez":"Never shown after saving")} onChange={e=>{setDraft({...draft,secret:e.target.value});setTestResult(null)}}/></label></div>
   <p>{draft.provider.includes("oidc")?(tr?"Kontrol: discovery belgesine erişim ve authorization_endpoint alanı. İstemci sırrı, giriş dönüşü, grup eşleme ve MFA doğrulanmaz.":"Check: discovery document retrieval and authorization_endpoint. Client secret, login callback, group mapping and MFA are not verified."):draft.provider==="saml"?(tr?"Kontrol: metaveri belgesine erişim ve EntityDescriptor işareti. İmza, kullanıcı oturumu ve yetki eşlemesi doğrulanmaz.":"Check: metadata retrieval and EntityDescriptor marker. Signatures, user sign-in and permission mapping are not verified."):(tr?"Kontrol: IAM bridge sağlık uç noktası. LDAP bind, kullanıcı araması ve giriş doğrulanmaz; doğrudan LDAP bağlantısı kurulmaz.":"Check: IAM bridge health endpoint. LDAP bind, user lookup and sign-in are not verified; there is no direct LDAP connection.")}</p>
  </fieldset>
  {testResult==="passed"&&<p className="iad-notice" role="status">{tr?"Ön kontrol geçti. Kullanıcı oturumu, rol ve MFA doğrulanmadı.":"Preflight passed. User sign-in, role and MFA remain unverified."}</p>}
  {stored&&<p className="iad-footnote">{tr?"Son kayıt":"Last saved"}: {new Date(stored.updated_at).toLocaleString(tr?"tr-TR":"en-GB")} · {stored.updated_by}</p>}
  <footer><span>{dirty?(tr?"Kaydedilmemiş değişiklikler var":"Unsaved changes"):stored?(tr?"Kayıtlı profil":"Saved profile"):(tr?"Yeni profil":"New profile")}</span><div><button type="button" disabled={blocked||dirty||!stored||discard} onClick={()=>void test()}>{tr?"Metaveri / bridge kontrolü":"Metadata / bridge check"}</button><button className="primary" disabled={blocked||discard||(!dirty&&!!stored)}>{busy?(tr?"İşleniyor…":"Working…"):(tr?"Profili kaydet":"Save profile")}</button></div></footer>
 </form>}
 </section>;
}
