"use client";
import { useCallback,useEffect,useState } from "react";
import { withBasePath } from "./base-path";

type Policy={enabled:boolean;mode:"redact"|"block";tckn:boolean;iban:boolean;paymentCard:boolean;email:boolean;phone:boolean;injectionDetection:boolean;injectionAction:"neutralize"|"block"};
type Event={id:string;actor:string;operation:string;direction:string;action:string;categories:string[];findingCount:number;createdAt:string};
const labels:Record<string,string>={tckn:"TCKN",iban:"IBAN","payment-card":"Ödeme kartı",email:"E-posta",phone:"Telefon",secret:"Secret/token","prompt-injection":"Prompt injection"};

export default function FornostAiDataProtection(){
 const [policy,setPolicy]=useState<Policy|null>(null),[events,setEvents]=useState<Event[]>([]),[summary,setSummary]=useState({events:0,findings:0,blocked:0}),[confirmation,setConfirmation]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const response=await fetch(withBasePath("/api/ai/data-protection"),{cache:"no-store"});const body=await response.json().catch(()=>({}));if(response.ok){setPolicy(body.policy);setEvents(Array.isArray(body.recent)?body.recent:[]);setSummary(body.summary||{events:0,findings:0,blocked:0});}},[]);
 useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(timer);},[load]);
 async function save(){if(!policy||busy)return;setBusy(true);const response=await fetch(withBasePath("/api/ai/data-protection"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...policy,confirmation})});const body=await response.json().catch(()=>({}));setNotice(response.ok?"AI veri koruma politikası uygulandı.":String(body.error||"Politika kaydedilemedi."));if(response.ok){setConfirmation("");await load();}setBusy(false);}
 if(!policy)return <section className="ai-panel"><p>Veri koruma politikası yükleniyor…</p></section>;
 const toggle=(key:keyof Policy)=><input type="checkbox" checked={Boolean(policy[key])} onChange={e=>setPolicy({...policy,[key]:e.target.checked})}/>;
 return <div className="ai-data-protection">
  <section className="ai-panel"><div className="ai-panel-heading"><div><span className="ai-kicker">AI DATA PROTECTION GATEWAY</span><h3>Modelden önce ve sonra hassas veri kontrolü</h3><p>Ham içerik kaydedilmez. Olaylarda yalnız kategori, sayaç ve geri döndürülemez hash tutulur.</p></div><label className="ai-switch">{toggle("enabled")} Gateway etkin</label></div>
   <div className="ai-metric-grid"><article><strong>{summary.events}</strong><span>30 günlük olay</span></article><article><strong>{summary.findings}</strong><span>Bulgu</span></article><article><strong>{summary.blocked}</strong><span>Engellenen</span></article></div>
   <div className="ai-control-grid"><label>Aksiyon<select value={policy.mode} onChange={e=>setPolicy({...policy,mode:e.target.value as Policy["mode"]})}><option value="redact">Maskele ve devam et</option><option value="block">İsteği engelle</option></select></label><label>Prompt injection<select value={policy.injectionAction} onChange={e=>setPolicy({...policy,injectionAction:e.target.value as Policy["injectionAction"]})}><option value="neutralize">Etkisizleştir</option><option value="block">İsteği engelle</option></select></label></div>
   <div className="ai-check-grid"><label>{toggle("tckn")} TCKN</label><label>{toggle("iban")} IBAN</label><label>{toggle("paymentCard")} Ödeme kartı</label><label>{toggle("email")} E-posta</label><label>{toggle("phone")} Telefon</label><label>{toggle("injectionDetection")} Prompt injection</label></div>
   <div className="ai-confirm-row"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="VERİ KORUMAYI UYGULA"/><button type="button" disabled={busy||confirmation!=="VERİ KORUMAYI UYGULA"} onClick={()=>void save()}>{busy?"Uygulanıyor…":"Politikayı uygula"}</button></div>{notice&&<p className="ai-notice">{notice}</p>}
  </section>
  <section className="ai-panel"><div className="ai-panel-heading"><div><span className="ai-kicker">GÜVENLİ OLAY AKIŞI</span><h3>Son veri koruma olayları</h3></div></div><div className="ai-event-list">{events.length?events.map(event=><article key={event.id}><div><strong>{event.operation}</strong><span>{event.direction} · {new Date(event.createdAt).toLocaleString("tr-TR")}</span></div><div className="ai-event-tags">{event.categories.map(category=><span key={category}>{labels[category]||category}</span>)}<b>{event.action==="blocked"?"Engellendi":"Maskelendi"} · {event.findingCount}</b></div></article>):<p>Henüz veri koruma olayı yok.</p>}</div></section>
 </div>;
}
