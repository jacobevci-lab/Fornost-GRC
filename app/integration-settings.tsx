"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";

type Lang="tr"|"en";
type Kind="ticketing"|"email"|"identity";
type Form={provider:string;enabled:boolean;secret:string;config:Record<string,string|boolean>};
const defaults:Record<Kind,Form>={
 ticketing:{provider:"jira",enabled:false,secret:"",config:{baseUrl:"",username:"",projectKey:"",issueType:"Task"}},
 email:{provider:"smtp-bridge",enabled:false,secret:"",config:{bridgeUrl:"",smtpHost:"",smtpPort:"587",username:"",sender:"",secure:true}},
 identity:{provider:"entra-oidc",enabled:false,secret:"",config:{issuer:"",clientId:"",tenantId:"",redirectUri:"",groupsClaim:"groups"}},
};
const providers:Record<Kind,{value:string;label:string}[]>={
 ticketing:[{value:"jira",label:"Jira Cloud / Data Center"},{value:"servicenow",label:"ServiceNow"},{value:"azure-devops",label:"Azure DevOps Boards"},{value:"github-issues",label:"GitHub Issues"},{value:"webhook",label:"Generic Webhook"}],
 email:[{value:"smtp-bridge",label:"SMTP Relay Bridge"},{value:"microsoft-graph-mail",label:"Microsoft Graph Mail"},{value:"email-api",label:"HTTP Email API"}],
 identity:[{value:"entra-oidc",label:"Microsoft Entra ID (OIDC)"},{value:"okta-oidc",label:"Okta (OIDC)"},{value:"generic-oidc",label:"Generic OIDC"},{value:"saml",label:"SAML 2.0"},{value:"ldap",label:"LDAP"},{value:"ldaps",label:"LDAPS"}],
};
const fieldMap:Record<string,{key:string;label:string;placeholder?:string;type?:string}[]>={
 jira:[{key:"baseUrl",label:"Jira URL",placeholder:"https://company.atlassian.net"},{key:"username",label:"User Email"},{key:"projectKey",label:"Project Key"},{key:"issueType",label:"Issue Type"}],
 servicenow:[{key:"baseUrl",label:"Instance URL",placeholder:"https://company.service-now.com"},{key:"username",label:"Username"},{key:"table",label:"Target Table",placeholder:"incident"}],
 "azure-devops":[{key:"baseUrl",label:"Organization API URL",placeholder:"https://dev.azure.com/company"},{key:"organization",label:"Organization"},{key:"project",label:"Project"},{key:"workItemType",label:"Work Item Type",placeholder:"Task"}],
 "github-issues":[{key:"repository",label:"Repository",placeholder:"owner/repository"},{key:"baseUrl",label:"API URL",placeholder:"https://api.github.com"}],
 webhook:[{key:"endpoint",label:"Webhook URL",placeholder:"https://..."}],
 "smtp-bridge":[{key:"bridgeUrl",label:"Secure SMTP Bridge URL",placeholder:"https://mail-bridge.company/api/send"},{key:"smtpHost",label:"SMTP Host"},{key:"smtpPort",label:"SMTP Port",type:"number"},{key:"username",label:"Username"},{key:"sender",label:"Sender Email",type:"email"}],
 "microsoft-graph-mail":[{key:"endpoint",label:"Graph Base URL",placeholder:"https://graph.microsoft.com"},{key:"sender",label:"Sender Mailbox",type:"email"}],
 "email-api":[{key:"endpoint",label:"Email API URL"},{key:"sender",label:"Sender Email",type:"email"}],
 "entra-oidc":[{key:"issuer",label:"Issuer",placeholder:"https://login.microsoftonline.com/TENANT/v2.0"},{key:"tenantId",label:"Tenant ID"},{key:"clientId",label:"Client ID"},{key:"redirectUri",label:"Redirect URI"},{key:"groupsClaim",label:"Groups Claim"}],
 "okta-oidc":[{key:"issuer",label:"Issuer",placeholder:"https://company.okta.com/oauth2/default"},{key:"clientId",label:"Client ID"},{key:"redirectUri",label:"Redirect URI"},{key:"groupsClaim",label:"Groups Claim"}],
 "generic-oidc":[{key:"issuer",label:"Issuer"},{key:"clientId",label:"Client ID"},{key:"redirectUri",label:"Redirect URI"},{key:"groupsClaim",label:"Groups Claim"}],
 saml:[{key:"metadataUrl",label:"IdP Metadata URL"},{key:"entityId",label:"SP Entity ID"},{key:"acsUrl",label:"ACS URL"}],
 ldap:[{key:"bridgeUrl",label:"IAM Bridge URL"},{key:"directoryUrl",label:"LDAP URL",placeholder:"ldap://directory.company.local:389"},{key:"baseDn",label:"Base DN"},{key:"bindDn",label:"Bind DN"},{key:"userFilter",label:"User Filter",placeholder:"(sAMAccountName={username})"}],
 ldaps:[{key:"bridgeUrl",label:"IAM Bridge URL"},{key:"directoryUrl",label:"LDAPS URL",placeholder:"ldaps://directory.company.local:636"},{key:"baseDn",label:"Base DN"},{key:"bindDn",label:"Bind DN"},{key:"userFilter",label:"User Filter",placeholder:"(sAMAccountName={username})"}],
};

export default function IntegrationSettings({lang,kind}:{lang:Lang;kind:Kind}){
 const tr=lang==="tr",[forms,setForms]=useState(defaults),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[testEmail,setTestEmail]=useState("");
 useEffect(()=>{(async()=>{const r=await fetch(withBasePath("/api/integrations"),{cache:"no-store"});if(!r.ok)return;const j=await r.json();setForms(current=>{const next={...current};for(const row of j.integrations||[]){const kind=row.kind as Kind;next[kind]={...next[kind],provider:row.provider,enabled:!!row.enabled,secret:"",config:{...next[kind].config,...row.config}}}return next})})().catch(()=>{})},[]);
 const setForm=(kind:Kind,patch:Partial<Form>)=>setForms(x=>({...x,[kind]:{...x[kind],...patch}}));
 const setConfig=(kind:Kind,key:string,value:string|boolean)=>setForms(x=>({...x,[kind]:{...x[kind],config:{...x[kind].config,[key]:value}}}));
 async function save(kind:Kind,e:FormEvent){e.preventDefault();setBusy(`${kind}:save`);setMessage("");const form=forms[kind],r=await fetch(withBasePath("/api/integrations"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({kind,...form})}),j=await r.json().catch(()=>({}));setBusy("");setMessage(r.ok?(tr?"Entegrasyon ayarları güvenli biçimde kaydedildi.":"Integration settings saved securely."):j.error||"Error");if(r.ok)setForm(kind,{secret:""})}
 async function action(kind:Kind,name:"test"|"send-test"){setBusy(`${kind}:${name}`);setMessage("");const r=await fetch(withBasePath("/api/integrations"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,action:name,to:testEmail})}),j=await r.json().catch(()=>({}));setBusy("");setMessage(r.ok?j.message:j.error||"Error")}
 const metadata={
  ticketing:{eyebrow:tr?"İŞ AKIŞI BAĞLANTISI":"WORKFLOW CONNECTION",title:tr?"Ticketing sağlayıcısı":"Ticketing provider",desc:tr?"Aksiyon ve gap kayıtlarını kurumsal iş takip sistemine gönderin.":"Send actions and gap records to your enterprise work tracking system."},
  email:{eyebrow:tr?"BİLDİRİM KANALI":"NOTIFICATION CHANNEL",title:tr?"E-posta gönderim altyapısı":"Email delivery infrastructure",desc:tr?"Risk hatırlatmaları ve sistem bildirimleri için gönderim kanalını yönetin.":"Manage delivery for risk reminders and system notifications."},
  identity:{eyebrow:tr?"KİMLİK FEDERASYONU":"IDENTITY FEDERATION",title:tr?"Kurumsal kimlik sağlayıcısı":"Enterprise identity provider",desc:tr?"SSO ve dizin entegrasyonunu güvenli bağlantı profiliyle yönetin.":"Manage SSO and directory integration through a secure connection profile."},
 }[kind];
 return <section className="integration-hub integration-page"><header><div><small>{metadata.eyebrow}</small><h3>{metadata.title}</h3><p>{metadata.desc}</p></div><span>{forms[kind].enabled?(tr?"Etkin":"Enabled"):(tr?"Yapılandırılmadı":"Not configured")}</span></header>{message&&<div className="integration-message">{message}</div>}<div className="integration-grid">
  {kind==="ticketing"&&<IntegrationCard kind="ticketing" title={tr?"İş Takibi / Ticketing":"Work Tracking / Ticketing"} desc={tr?"GRC gap ve aksiyonlarından izlenebilir ticket üretin.":"Create traceable tickets from GRC gaps and actions."} form={forms.ticketing} tr={tr} busy={busy} setForm={setForm} setConfig={setConfig} save={save} test={()=>action("ticketing","test")} wide/>}
  {kind==="email"&&<IntegrationCard kind="email" title={tr?"E-posta / SMTP":"Email / SMTP"} desc={tr?"Risk bildirimleri ve test e-postaları için güvenli gönderim kanalı.":"Secure delivery for risk notifications and test messages."} form={forms.email} tr={tr} busy={busy} setForm={setForm} setConfig={setConfig} save={save} test={()=>action("email","test")} wide extra={<label className="integration-field"><span>{tr?"Test Alıcısı":"Test Recipient"}</span><input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="name@company.com"/><button type="button" className="integration-test-mail" disabled={!forms.email.enabled||!testEmail||!!busy} onClick={()=>action("email","send-test")}>{busy==="email:send-test"?(tr?"Gönderiliyor…":"Sending…"):(tr?"Test E-postası Gönder":"Send Test Email")}</button></label>}/>}
  {kind==="identity"&&<IntegrationCard kind="identity" title={tr?"IAM / SSO Federasyonu":"IAM / SSO Federation"} desc={tr?"Entra, Okta, OIDC, SAML ve şirket içi LDAP/LDAPS profilleri.":"Entra, Okta, OIDC, SAML and on-prem LDAP/LDAPS profiles."} form={forms.identity} tr={tr} busy={busy} setForm={setForm} setConfig={setConfig} save={save} test={()=>action("identity","test")} wide note={tr?"LDAP/LDAPS, güvenlik nedeniyle platformdan ham TCP ile bağlanmaz; şirket içi IAM bridge üzerinden doğrulanır. Entra/Okta profilleri OIDC discovery ile test edilir.":"LDAP/LDAPS uses an on-prem IAM bridge instead of raw TCP. Entra/Okta profiles are verified through OIDC discovery."}/>}
 </div></section>;
}

function IntegrationCard({kind,title,desc,form,tr,busy,setForm,setConfig,save,test,extra,wide,note}:{kind:Kind;title:string;desc:string;form:Form;tr:boolean;busy:string;setForm:(k:Kind,p:Partial<Form>)=>void;setConfig:(k:Kind,key:string,value:string|boolean)=>void;save:(k:Kind,e:FormEvent)=>void;test:()=>void;extra?:React.ReactNode;wide?:boolean;note?:string}){
 const fields=useMemo(()=>fieldMap[form.provider]||[],[form.provider]);
 return <form className={`integration-card${wide?" integration-wide":""}`} onSubmit={e=>save(kind,e)}><header><div><h4>{title}</h4><p>{desc}</p></div><label className="integration-switch"><input type="checkbox" checked={form.enabled} onChange={e=>setForm(kind,{enabled:e.target.checked})}/><i/><span>{form.enabled?(tr?"Etkin":"Enabled"):(tr?"Kapalı":"Off")}</span></label></header><div className="integration-fields"><label className="integration-field wide"><span>{tr?"Sağlayıcı":"Provider"}</span><select value={form.provider} onChange={e=>setForm(kind,{provider:e.target.value,config:{}})}>{providers[kind].map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>{fields.map(field=><label className="integration-field" key={field.key}><span>{field.label}</span><input type={field.type||"text"} value={String(form.config[field.key]??"")} placeholder={field.placeholder} onChange={e=>setConfig(kind,field.key,e.target.value)}/></label>)}<label className="integration-field"><span>{kind==="identity"?(tr?"Client Secret / Bind Secret":"Client Secret / Bind Secret"):(tr?"API Token / Parola":"API Token / Password")}</span><input type="password" autoComplete="new-password" value={form.secret} onChange={e=>setForm(kind,{secret:e.target.value})} placeholder={tr?"Kaydedildikten sonra gösterilmez":"Never shown after saving"}/></label>{extra}{note&&<p className="integration-note wide">{note}</p>}</div><footer><button type="button" className="ghost" disabled={!form.enabled||!!busy} onClick={test}>{busy===`${kind}:test`?(tr?"Test ediliyor…":"Testing…"):(tr?"Bağlantıyı Test Et":"Test Connection")}</button><button className="primary" disabled={!!busy}>{busy===`${kind}:save`?(tr?"Kaydediliyor…":"Saving…"):(tr?"Kaydet":"Save")}</button></footer></form>;
}
