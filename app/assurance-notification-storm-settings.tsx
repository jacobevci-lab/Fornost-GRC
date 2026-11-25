"use client";
import {FormEvent,useEffect,useState} from "react";
import {withBasePath} from "./base-path";
import "./assurance-notification-storm-settings.css";

type Lang="tr"|"en";
type StormPolicy={windowMinutes:number;highMaxPerRecipient:number;mediumMaxPerRecipient:number};
function readPolicy(value:unknown):StormPolicy|null{
 if(!value||typeof value!=="object")return null;
 const p=value as StormPolicy;
 return [p.windowMinutes,p.highMaxPerRecipient,p.mediumMaxPerRecipient].every(Number.isInteger)?p:null;
}

export default function AssuranceNotificationStormSettings({lang}:{lang:Lang}){
 const tr=lang==="tr",[policy,setPolicy]=useState<StormPolicy|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[reload,setReload]=useState(0);
 const loadError=tr?"Gönderim sıklığı ayarları yüklenemedi.":"Delivery frequency settings could not be loaded.";
 useEffect(()=>{let active=true;const controller=new AbortController();fetch(withBasePath("/api/continuous-assurance/notifications"),{cache:"no-store",headers:{accept:"application/json"},signal:controller.signal}).then(async response=>({response,body:await response.json().catch(()=>null)})).then(({response,body})=>{
  if(!active)return;const loaded=readPolicy(body?.storm?.policy);if(response.ok&&loaded){setPolicy(loaded);setMessage("")}else setMessage(String(body?.error||loadError));setLoading(false);
 }).catch(()=>{if(active){setMessage(loadError);setLoading(false)}});return()=>{active=false;controller.abort()}},[loadError,reload]);
 async function save(e:FormEvent){
  e.preventDefault();if(busy||!policy)return;setBusy(true);setMessage("");
  const response=await fetch(withBasePath("/api/continuous-assurance/notifications"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({section:"storm",...policy})}).catch(()=>null),body=await response?.json().catch(()=>null),saved=readPolicy(body?.stormPolicy);
  if(response?.ok&&saved){setPolicy(saved);setMessage(tr?"Gönderim sıklığı kaydedildi.":"Delivery frequency saved.")}else setMessage(String(body?.error||(tr?"Ayarlar kaydedilemedi.":"Settings could not be saved.")));setBusy(false);
 }
 return <section className="assurance-storm-console"><header><div><small>{tr?"GÖNDERİM SINIRLARI":"DELIVERY LIMITS"}</small><h3>{tr?"Alıcı başına bildirim sıklığı":"Notification frequency per recipient"}</h3><p>{tr?"Bir kişiye kısa sürede çok sayıda bildirim gitmesini önleyin. Kritik bildirimler bu sınırlara takılmaz; diğer bildirimler süre dolunca gönderilir.":"Limit repeated notifications to the same person. Critical notifications bypass these limits; other notifications are deferred until the window resets."}</p></div></header>
  {message&&<div className="storm-message" role="status">{message}</div>}
  {loading?<div className="storm-message" role="status">{tr?"Ayarlar yükleniyor…":"Loading settings…"}</div>:!policy?<div className="storm-message"><button type="button" className="ghost" onClick={()=>{setLoading(true);setReload(x=>x+1)}}>{tr?"Yeniden dene":"Retry"}</button></div>:
  <div className="storm-grid"><form onSubmit={save} className="storm-policy"><header><div><small>{tr?"ALICI BAZLI SINIR":"RECIPIENT RATE POLICY"}</small><b>{tr?"Önceliğe göre gönderim sınırı":"Delivery limits by priority"}</b></div></header><div className="storm-fields"><label><span>{tr?"Zaman aralığı (dk)":"Rolling window (min)"}</span><input disabled={busy} required type="number" min="15" max="1440" value={policy.windowMinutes} onChange={e=>setPolicy({...policy,windowMinutes:Number(e.target.value)})}/></label><label><span>{tr?"Yüksek öncelik / alıcı":"High max / recipient"}</span><input disabled={busy} required type="number" min="1" max="100" value={policy.highMaxPerRecipient} onChange={e=>setPolicy({...policy,highMaxPerRecipient:Number(e.target.value)})}/></label><label><span>{tr?"Orta öncelik / alıcı":"Medium max / recipient"}</span><input disabled={busy} required type="number" min="1" max="100" value={policy.mediumMaxPerRecipient} onChange={e=>setPolicy({...policy,mediumMaxPerRecipient:Number(e.target.value)})}/></label><div className="storm-critical"><strong>{tr?"Kritik":"Critical"}</strong><span>{tr?"Gönderim sınırı uygulanmaz":"Exempt from frequency limits"}</span></div></div><footer><small>{tr?"Orta öncelik sınırı, yüksek öncelik sınırını geçemez.":"The Medium limit cannot exceed the High limit."}</small><button className="primary" disabled={busy}>{busy?(tr?"Kaydediliyor…":"Saving…"):(tr?"Politikayı Kaydet":"Save Policy")}</button></footer></form></div>}</section>;
}
