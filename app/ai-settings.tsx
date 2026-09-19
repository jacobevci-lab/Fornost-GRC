"use client";

import { useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import FornostAiPolicy from "./fornost-ai-policy";

type Lang = "tr" | "en";
type ProviderKind = "openai-compatible" | "ollama";
type TrustZone = "external" | "private" | "local";
type Classification = "Public" | "Internal" | "Confidential";
type ProviderProfile = {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  enabled: boolean;
  temperature: number;
  timeoutMs: number;
  maxTokens: number;
  secret: string;
  hasSecret: boolean;
  trustZone: TrustZone;
  maxDataClassification: Classification;
};
type ProviderSettings = ProviderProfile & { fallback: ProviderProfile };
type AiStatus = { operational:boolean;operatingState:"ready"|"restricted"|"emergency-stop";operatingMessage:string;capabilities:Record<string,boolean> };
type AiControl = { id:string;label:string;status:"ready"|"attention"|"missing";detail:string };

const profileDefaults: ProviderProfile = { provider:"ollama",baseUrl:"",model:"",enabled:false,temperature:.2,timeoutMs:60000,maxTokens:1200,secret:"",hasSecret:false,trustZone:"private",maxDataClassification:"Confidential" };
const defaults: ProviderSettings = { ...profileDefaults,provider:"openai-compatible",trustZone:"external",maxDataClassification:"Internal",fallback:{...profileDefaults} };

export default function AiSettings({lang}:{lang:Lang}){
  const tr=lang==="tr",[settings,setSettings]=useState(defaults),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[models,setModels]=useState<string[]>([]),[available,setAvailable]=useState<boolean|null>(null),[status,setStatus]=useState<AiStatus|null>(null),[controls,setControls]=useState<AiControl[]>([]);
  const load=useCallback(async()=>{setBusy(true);const [providerResponse,statusResponse,metricsResponse]=await Promise.all([fetch(withBasePath("/api/ai/providers"),{cache:"no-store"}).catch(()=>null),fetch(withBasePath("/api/ai/status"),{cache:"no-store"}).catch(()=>null),fetch(withBasePath("/api/ai/metrics?days=7"),{cache:"no-store"}).catch(()=>null)]),body=await providerResponse?.json().catch(()=>({}))||{};if(providerResponse?.ok)setSettings({...defaults,...body,secret:"",fallback:{...defaults.fallback,...(body.fallback||{}),secret:""}});else setNotice(String(body.error||(tr?"AI ayarları okunamadı.":"AI settings could not be loaded.")));if(statusResponse?.ok)setStatus(await statusResponse.json());if(metricsResponse?.ok){const metrics=await metricsResponse.json();setControls(Array.isArray(metrics.controls)?metrics.controls:[])}setBusy(false);},[tr]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load]);
  const update=(key:keyof ProviderProfile,value:unknown)=>setSettings(current=>({...current,[key]:value}));
  const updateFallback=(key:keyof ProviderProfile,value:unknown)=>setSettings(current=>({...current,fallback:{...current.fallback,[key]:value}}));
  async function save(test=false){if(busy)return;setBusy(true);setNotice("");const response=await fetch(withBasePath("/api/ai/providers"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(settings)}).catch(()=>null),body=await response?.json().catch(()=>({}))||{};if(!response?.ok){setNotice(String(body.error||(tr?"AI ayarları kaydedilemedi.":"AI settings could not be saved.")));setBusy(false);return}setSettings(current=>({...current,secret:"",hasSecret:body.hasSecret===true,fallback:{...current.fallback,secret:"",hasSecret:body.fallbackHasSecret===true}}));setNotice(tr?"AI sağlayıcı ayarları kaydedildi.":"AI provider settings saved.");if(test){const testResponse=await fetch(withBasePath("/api/ai/providers"),{method:"POST"}).catch(()=>null),testBody=await testResponse?.json().catch(()=>({}))||{};setNotice(String(testResponse?.ok?(testBody.message||(tr?"Sağlayıcı zinciri doğrulandı.":"Provider chain verified.")):(testBody.error||testBody.message||(tr?"Bağlantı testi başarısız.":"Connection test failed."))));setModels(testResponse?.ok&&Array.isArray(testBody.models)?testBody.models:[]);setAvailable(testResponse?.ok&&typeof testBody.selectedModelAvailable==="boolean"?testBody.selectedModelAvailable:null)}setBusy(false)}
  const refreshStatus=async()=>{await load()};
  return <div className="ai-settings-page">
    <section className="ai-settings-status"><div><small>FORNOST AI CONTROL PLANE</small><h3>{tr?"Sağlayıcı ve veri sınırı":"Provider and data boundary"}</h3><p>{tr?"Model erişimi, veri sınıfı, yedek sağlayıcı ve çalışma sınırlarını merkezi olarak yönetin.":"Centrally govern model access, data classification, fallback provider and operating boundaries."}</p></div><span className={settings.enabled?"ready":"off"}>{settings.enabled?(tr?"Etkin":"Enabled"):(tr?"Kapalı":"Disabled")}</span></section>
    <section className="ai-control-summary" aria-label={tr?"AI operasyon özeti":"AI operating summary"}>
      <article className={status?.operatingState||"missing"}><small>{tr?"Çalışma durumu":"Operating state"}</small><b>{status?.operatingState==="emergency-stop"?(tr?"Acil durdurma":"Emergency stop"):status?.operatingState==="ready"?(tr?"Hazır":"Ready"):(tr?"Kısıtlı":"Restricted")}</b><span>{status?.operatingMessage||(tr?"Durum okunamadı":"Status unavailable")}</span></article>
      <article><small>{tr?"Yetenek kapıları":"Capability gates"}</small><b>{status?Object.values(status.capabilities).filter(Boolean).length:0}/{status?Object.keys(status.capabilities).length:0}</b><span>{tr?"Etkin / tanımlı yetenek":"Enabled / defined capabilities"}</span></article>
      <article><small>{tr?"Kontrol hazırlığı":"Control readiness"}</small><b>{controls.filter(control=>control.status==="ready").length}/{controls.length}</b><span>{tr?"Son 7 günlük güvence görünümü":"Last 7-day assurance view"}</span></article>
      <article className={controls.some(control=>control.status!=="ready")?"attention":"ready"}><small>{tr?"Müdahale gereken":"Needs attention"}</small><b>{controls.filter(control=>control.status!=="ready").length}</b><span>{tr?"Eksik veya dikkat isteyen kontrol":"Missing or attention controls"}</span></article>
    </section>
    <div className="ai-settings-layout">
      <section className="settings-card ai-provider-card"><div className="settings-card-head"><div><h3>{tr?"Birincil AI Sağlayıcısı":"Primary AI Provider"}</h3><p>{tr?"Model gateway bağlantısı ve güvenli veri paylaşım politikası":"Model gateway connection and secure data-sharing policy"}</p></div><span>{settings.provider}</span></div><div className="settings-fields">
        <Select label="Provider" value={settings.provider} set={value=>update("provider",value)} options={[["openai-compatible","OpenAI Compatible / Local Chatbot"],["ollama","Ollama"]]}/>
        <Field label="Base URL" value={settings.baseUrl} set={value=>update("baseUrl",value)} placeholder="http://10.10.10.50:11434"/>
        <Field label="Model" value={settings.model} set={value=>update("model",value)} placeholder="qwen3:14b"/>
        <Field label="API Key" type="password" value={settings.secret} set={value=>update("secret",value)} placeholder={settings.hasSecret?(tr?"Kayıtlı · değiştirmek için yeni değer girin":"Saved · enter a new value to replace"):tr?"Opsiyonel":"Optional"}/>
        <Select label={tr?"Güven bölgesi":"Trust zone"} value={settings.trustZone} set={value=>{update("trustZone",value);if(value==="external"&&settings.maxDataClassification==="Confidential")update("maxDataClassification","Internal")}} options={[["external",tr?"Harici / internet":"External / internet"],["private",tr?"Özel ağ / on-prem":"Private network / on-prem"],["local",tr?"Aynı sunucu / loopback":"Same host / loopback"]]}/>
        <Select label={tr?"En yüksek veri sınıfı":"Maximum data classification"} value={settings.maxDataClassification} set={value=>update("maxDataClassification",value)} options={[["Public","Public"],["Internal","Internal"],...(settings.trustZone==="external"?[]:[["Confidential","Confidential"]]) ] as [string,string][]}/>
        <Field label="Temperature" type="number" value={String(settings.temperature)} set={value=>update("temperature",Number(value))}/><Field label="Timeout (ms)" type="number" value={String(settings.timeoutMs)} set={value=>update("timeoutMs",Number(value))}/><Field label="Max tokens" type="number" value={String(settings.maxTokens)} set={value=>update("maxTokens",Number(value))}/>
        <label className="setting-toggle"><input type="checkbox" checked={settings.enabled} onChange={event=>update("enabled",event.target.checked)}/><i/><span>{tr?"Fornost AI model çağrılarını etkinleştir":"Enable Fornost AI model calls"}</span></label>
      </div></section>
      <section className="settings-card ai-fallback-card"><div className="settings-card-head"><div><h3>{tr?"Yedek Sağlayıcı":"Fallback Provider"}</h3><p>{tr?"Birincil sağlayıcı kullanılamadığında kontrollü devralma":"Controlled failover when the primary provider is unavailable"}</p></div><span>{settings.fallback.enabled?(tr?"Hazır":"Ready"):(tr?"Kapalı":"Off")}</span></div><div className="settings-fields">
        <label className="setting-toggle wide"><input type="checkbox" checked={settings.fallback.enabled} onChange={event=>updateFallback("enabled",event.target.checked)}/><i/><span>{tr?"Otomatik fallback kullan":"Use automatic fallback"}</span></label>
        {settings.fallback.enabled&&<><Select label="Provider" value={settings.fallback.provider} set={value=>updateFallback("provider",value)} options={[["openai-compatible","OpenAI Compatible"],["ollama","Ollama"]]}/><Field label="Base URL" value={settings.fallback.baseUrl} set={value=>updateFallback("baseUrl",value)}/><Field label="Model" value={settings.fallback.model} set={value=>updateFallback("model",value)}/><Field label="API Key" type="password" value={settings.fallback.secret} set={value=>updateFallback("secret",value)} placeholder={settings.fallback.hasSecret?(tr?"Kayıtlı":"Saved"):(tr?"Opsiyonel":"Optional")}/><Select label={tr?"Güven bölgesi":"Trust zone"} value={settings.fallback.trustZone} set={value=>updateFallback("trustZone",value)} options={[["external",tr?"Harici / internet":"External / internet"],["private",tr?"Özel ağ / on-prem":"Private network / on-prem"],["local",tr?"Aynı sunucu / loopback":"Same host / loopback"]]}/><Select label={tr?"En yüksek veri sınıfı":"Maximum data classification"} value={settings.fallback.maxDataClassification} set={value=>updateFallback("maxDataClassification",value)} options={[["Public","Public"],["Internal","Internal"],...(settings.fallback.trustZone==="external"?[]:[["Confidential","Confidential"]])] as [string,string][]}/></>}
      </div></section>
    </div>
    {available!==null&&<div className={`ai-provider-result ${available?"ok":"warn"}`}><b>{available?(tr?"Seçili model erişilebilir":"Selected model is available"):(tr?"Seçili model bulunamadı":"Selected model was not found")}</b><span>{models.length} {tr?"model keşfedildi":"models discovered"}</span></div>}
    {!!models.length&&<label className="ai-discovered-models"><span>{tr?"Keşfedilen modeller":"Discovered models"}</span><select value={settings.model} onChange={event=>update("model",event.target.value)}>{settings.model&&!models.includes(settings.model)&&<option value={settings.model}>{settings.model}</option>}{models.map(model=><option value={model} key={model}>{model}</option>)}</select></label>}
    {notice&&<div className="demo-data-message" aria-live="polite">{notice}</div>}
    <div className="ai-settings-actions"><button type="button" className="ghost" disabled={busy} onClick={()=>void save(false)}>{tr?"Kaydet":"Save"}</button><button type="button" className="primary" disabled={busy} onClick={()=>void save(true)}>{tr?"Kaydet ve Bağlantıyı Test Et":"Save and Test Connection"}</button></div>
    <section className="settings-card ai-policy-card"><div className="settings-card-head"><div><h3>{tr?"AI Operasyon Politikası":"AI Operating Policy"}</h3><p>{tr?"Emergency stop, yetenek kapıları ve rol bazlı Copilot erişimi":"Emergency stop, capability gates and role-based Copilot access"}</p></div><span>{tr?"İnsan onaylı":"Human governed"}</span></div><FornostAiPolicy onChanged={refreshStatus}/></section>
    <section className="settings-card ai-readiness-card"><div className="settings-card-head"><div><h3>{tr?"AI Güvence Kontrolleri":"AI Assurance Controls"}</h3><p>{tr?"Sağlayıcı, envanter, test, bilgi tabanı, geri bildirim, bütçe ve operasyon kontrolleri":"Provider, inventory, testing, knowledge, feedback, budget and operating controls"}</p></div><span>{controls.length}</span></div><div className="ai-readiness-list">{controls.map(control=><article className={control.status} key={control.id}><i/><div><b>{control.label}</b><span>{control.detail}</span></div></article>)}</div></section>
    <div className="security-note"><b>{tr?"On-prem bağlantı sınırı":"On-prem connection boundary"}</b><p>{tr?"Özel ağ sağlayıcıları için FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true; aynı sunucu loopback erişimi için ayrıca FORNOST_AI_ALLOW_LOOPBACK=true gerekir.":"Private-network providers require FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true; same-host loopback access additionally requires FORNOST_AI_ALLOW_LOOPBACK=true."}</p></div>
    <div className="security-note"><b>{tr?"Güvenli mimari":"Secure architecture"}</b><p>{tr?"AI veritabanına doğrudan yazmaz. Taslak ve öneriler Action Gateway, RBAC, insan onayı ve audit kaydı üzerinden trusted backend API'lerine aktarılır.":"AI never writes directly to the database. Drafts and recommendations pass through the Action Gateway, RBAC, human approval and audit logging before trusted backend APIs."}</p></div>
  </div>
}

function Field({label,value,set,type="text",placeholder=""}:{label:string;value:string;set:(value:string)=>void;type?:string;placeholder?:string}){return <label className="setting-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} autoComplete={type==="password"?"new-password":undefined} onChange={event=>set(event.target.value)}/></label>}
function Select({label,value,set,options}:{label:string;value:string;set:(value:string)=>void;options:[string,string][]}){return <label className="setting-field"><span>{label}</span><select value={value} onChange={event=>set(event.target.value)}>{options.map(([key,text])=><option value={key} key={key}>{text}</option>)}</select></label>}
