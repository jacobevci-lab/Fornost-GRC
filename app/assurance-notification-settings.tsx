"use client";

import {FormEvent,useEffect,useState} from "react";
import {withBasePath} from "./base-path";
import "./assurance-notification-settings.css";

type Lang="tr"|"en";
type Policy={criticalSlaMinutes:number;highSlaMinutes:number;mediumSlaMinutes:number;maxAttempts:number};
function readPolicy(value:unknown):Policy|null{
 if(!value||typeof value!=="object")return null;
 const p=value as Policy;
 return [p.criticalSlaMinutes,p.highSlaMinutes,p.mediumSlaMinutes,p.maxAttempts].every(Number.isInteger)?p:null;
}

export default function AssuranceNotificationSettings({lang}:{lang:Lang}){
 const tr=lang==="tr",[policy,setPolicy]=useState<Policy|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[reload,setReload]=useState(0);
 const loadError=tr?"Bildirim ayarları yüklenemedi.":"Notification settings could not be loaded.";
 useEffect(()=>{let active=true;const controller=new AbortController();fetch(withBasePath("/api/continuous-assurance/notifications"),{cache:"no-store",headers:{accept:"application/json"},signal:controller.signal}).then(async response=>({response,body:await response.json().catch(()=>null)})).then(({response,body})=>{
  if(!active)return;const loaded=readPolicy(body?.policy);if(response.ok&&loaded){setPolicy(loaded);setMessage("")}else setMessage(String(body?.error||loadError));setLoading(false);
 }).catch(()=>{if(active){setMessage(loadError);setLoading(false)}});return()=>{active=false;controller.abort()}},[loadError,reload]);
 async function savePolicy(e:FormEvent){
  e.preventDefault();if(busy||!policy)return;setBusy(true);setMessage("");
  const response=await fetch(withBasePath("/api/continuous-assurance/notifications"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(policy)}).catch(()=>null),body=await response?.json().catch(()=>null),saved=readPolicy(body?.policy);
  if(response?.ok&&saved){setPolicy(saved);setMessage(tr?"Bildirim ayarları kaydedildi.":"Notification settings saved.")}else setMessage(String(body?.error||(tr?"Ayarlar kaydedilemedi.":"Settings could not be saved.")));setBusy(false);
 }
 return <section className="assurance-notification-console">
  <header><div><small>{tr?"BİLDİRİM AYARLARI":"NOTIFICATION SETTINGS"}</small><h3>{tr?"Teslim süresi ve yeniden deneme":"Delivery timing and retries"}</h3><p>{tr?"Bildirim önceliğine göre hedef teslim süresini ve başarısız gönderimlerde deneme sınırını belirleyin.":"Set delivery deadlines by notification priority and the retry limit for failed deliveries."}</p></div></header>
  {message&&<div className="assurance-notification-message" role="status">{message}</div>}
  {loading?<div className="assurance-notification-message" role="status">{tr?"Ayarlar yükleniyor…":"Loading settings…"}</div>:!policy?<div className="assurance-notification-message"><button type="button" className="ghost" onClick={()=>{setLoading(true);setReload(x=>x+1)}}>{tr?"Yeniden dene":"Retry"}</button></div>:
  <div className="assurance-notification-grid">
   <form className="assurance-notification-policy" onSubmit={savePolicy}><header><div><small>{tr?"TESLİM POLİTİKASI":"DELIVERY POLICY"}</small><b>{tr?"Öncelik bazlı süre ve deneme sınırı":"Priority deadlines and retry limit"}</b></div></header><div>
    <label><span>{tr?"Kritik öncelik SLA (dk)":"Critical SLA (min)"}</span><input disabled={busy} required type="number" min="15" max="10080" value={policy.criticalSlaMinutes} onChange={e=>setPolicy({...policy,criticalSlaMinutes:Number(e.target.value)})}/></label>
    <label><span>{tr?"Yüksek öncelik SLA (dk)":"High SLA (min)"}</span><input disabled={busy} required type="number" min="30" max="20160" value={policy.highSlaMinutes} onChange={e=>setPolicy({...policy,highSlaMinutes:Number(e.target.value)})}/></label>
    <label><span>{tr?"Orta öncelik SLA (dk)":"Medium SLA (min)"}</span><input disabled={busy} required type="number" min="60" max="43200" value={policy.mediumSlaMinutes} onChange={e=>setPolicy({...policy,mediumSlaMinutes:Number(e.target.value)})}/></label>
    <label><span>{tr?"Maksimum deneme sayısı":"Max attempts"}</span><input disabled={busy} required type="number" min="1" max="10" value={policy.maxAttempts} onChange={e=>setPolicy({...policy,maxAttempts:Number(e.target.value)})}/></label>
   </div><footer><small>{tr?"Hedef süreler kritik ≤ yüksek ≤ orta öncelik sırasını izlemelidir.":"Delivery deadlines must follow Critical ≤ High ≤ Medium."}</small><button className="primary" disabled={busy}>{busy?(tr?"Kaydediliyor…":"Saving…"):(tr?"Politikayı Kaydet":"Save Policy")}</button></footer></form>
  </div>}
 </section>;
}
