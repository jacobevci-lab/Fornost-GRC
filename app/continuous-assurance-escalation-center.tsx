"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {escalationListPage,canAcknowledgeEscalation} from "./assurance-escalation-list";
import {withBasePath} from "./base-path";
import {navigateToFornost} from "./navigation-focus";
import "./continuous-assurance-escalation-center.css";

type Lang="tr"|"en";
type Navigation={module:string;recordRef:string;filterKey:"ruleRef"|"findingRef"|"riskRef"|"controlRef"|"sourceRef"};
type Escalation={id:string;kind:string;severity:string;subjectRef:string;owner:string;title:string;detail:string;status:string;firstSeenAt:string;lastSeenAt:string;acknowledgedBy:string;acknowledgedAt:string;ackNote:string;resolvedAt:string;navigation?:Navigation|null};
type Summary={active:number;acknowledged:number;critical:number;high:number;medium:number;resolved30d:number};
type Policy={reminderDays:number;remindersEnabled:boolean;signals:number;connectorHealthAvailable?:boolean};
const empty:Summary={active:0,acknowledged:0,critical:0,high:0,medium:0,resolved30d:0};

function openEscalationRecord(item:Escalation){const target=item.navigation;if(!target?.module||!target.recordRef||!target.filterKey)return false;return navigateToFornost({module:target.module,ref:target.recordRef,source:"assurance-escalation-center",filter:{[target.filterKey]:target.recordRef}})}
function recordLabel(item:Escalation,tr:boolean){const target=item.navigation?.module||"";if(item.kind==="connector-reliability")return tr?"Connector'ı Aç":"Open Connector";if(target==="Risk Assessment")return tr?"Riski Aç":"Open Risk";if(target==="Kontroller")return tr?"Kontrolü Aç":"Open Control";if(target==="Kanıt Otomasyonu")return tr?"Kuralı Aç":"Open Rule";if(target==="Bulgular ve CAPA")return tr?"CAPA'yı Aç":"Open CAPA";return tr?"Kayda Git":"Open Record"}

export default function ContinuousAssuranceEscalationCenter({lang}:{lang:Lang}){
 const tr=lang==="tr",[records,setRecords]=useState<Escalation[]>([]),[summary,setSummary]=useState<Summary>(empty),[policy,setPolicy]=useState<Policy>({reminderDays:15,remindersEnabled:true,signals:0}),[role,setRole]=useState("Viewer"),[filter,setFilter]=useState("open"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [query,setQuery]=useState(""),[page,setPage]=useState(1),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
 const [selected,setSelected]=useState<Escalation|null>(null),[note,setNote]=useState("");
 const readRequest=useRef<AbortController|null>(null),writeRequest=useRef<AbortController|null>(null),live=useRef(true),writing=useRef(false);
 const load=useCallback(async()=>{
  readRequest.current?.abort();
  const controller=new AbortController();readRequest.current=controller;
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const[e,a]=await Promise.all([fetch(withBasePath("/api/continuous-assurance/escalations"),{cache:"no-store",signal:controller.signal}),fetch(withBasePath("/api/auth"),{cache:"no-store",signal:controller.signal})]);
   if(!e.ok)throw new Error("Unavailable");
   const d=await e.json(),identity=a.ok?await a.json():null;
   if(!Array.isArray(d.records)||!d.summary||!d.policy)throw new Error("Invalid response");
   if(!live.current||readRequest.current!==controller)return null;
   return {records:d.records as Escalation[],summary:d.summary as Summary,policy:d.policy as Policy,role:String(identity?.user?.role||"Viewer")};
  }catch{return live.current&&readRequest.current===controller?{error:true as const}:null;}
  finally{clearTimeout(timer);}
 },[]);
 const apply=useCallback((result:Awaited<ReturnType<typeof load>>)=>{
  if(!result||!live.current)return;
  if("error" in result){setLoadError(true);setRecords([]);}
  else {setRecords(result.records);setSummary(result.summary);setPolicy(result.policy);setRole(result.role);}
  setLoading(false);
 },[]);
 const refresh=()=>{setLoading(true);setLoadError(false);setRole("Viewer");return load().then(apply);};
 useEffect(()=>{live.current=true;void load().then(apply);return()=>{live.current=false;readRequest.current?.abort();writeRequest.current?.abort();}},[load,apply]);
 async function acknowledge(item:Escalation){
  if(writing.current||loading||loadError||!canAcknowledgeEscalation(role,item.status,note))return;
  writing.current=true;setBusy(true);setMessage("");
  const controller=new AbortController();writeRequest.current=controller;
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetch(withBasePath("/api/continuous-assurance/escalations"),{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify({action:"acknowledge",id:item.id,note:note.trim()})});
   if(!live.current)return;
   if(r.ok){setSelected(null);setNote("");setMessage(tr?"Uyarı takibe alındı.":"Alert acknowledged.");await refresh();}
   else {setMessage(r.status===409?(tr?"Kayıt durumu değişmiş. Liste yenilendi; tekrar kontrol edin.":"The record changed. The list was refreshed; review its current status."):(tr?"İşlem kaydedilemedi. Yetkinizi ve bağlantınızı kontrol edin.":"Could not save. Check your access and connection."));if(r.status===409||r.status===401||r.status===403){setSelected(null);await refresh();}}
  }catch{if(live.current){setMessage(tr?"İşlemin sonucu doğrulanamadı. Tekrar kaydetmeden önce yenilenen listede durumu kontrol edin.":"The result could not be confirmed. Check the refreshed status before saving again.");setSelected(null);await refresh();}}
  finally{clearTimeout(timer);writing.current=false;if(live.current)setBusy(false);}
 }
 const result=useMemo(()=>escalationListPage(records,filter,query,page,lang),[records,filter,query,page,lang]);
 const visible=loading||loadError?[]:result.rows,ready=!loading&&!loadError;
 const canEdit=role==="Admin"||role==="Editor";
 const filters=[{id:"open",tr:"Açık",en:"Open"},{id:"critical",tr:"Kritik",en:"Critical"},{id:"ack",tr:"Acknowledge",en:"Acknowledged"},{id:"connector-reliability",tr:"Connector",en:"Connector"},{id:"risk-review",tr:"Risk Review",en:"Risk Review"},{id:"exception-expiry",tr:"Exception",en:"Exception"},{id:"mandatory-retest",tr:"Re-test",en:"Re-test"},{id:"all",tr:"Tümü",en:"All"}];
 return <section className="assurance-escalation-center">
  <header><div><small>ASSURANCE ESCALATION CENTER</small><h4>{tr?"Güvence uyarıları ve takip merkezi":"Assurance alerts & follow-up"}</h4><p>{tr?"Connector güvenilirliği, geciken risk kararları, exception süreleri ve re-test sonuçlarını tekilleştirilmiş, kalıcı ve aksiyonlanabilir sinyallere dönüştürür.":"Turn connector reliability, overdue risk decisions, exception deadlines and re-test outcomes into deduplicated, durable and actionable signals."}</p></div><button disabled={busy||loading} onClick={()=>void refresh()}>{tr?"Yenile":"Refresh"}</button></header>
  {message&&<div className="aec-message" role="status">{message}<button type="button" aria-label={tr?"Mesajı kapat":"Dismiss message"} onClick={()=>setMessage("")}>×</button></div>}
  {loadError&&<p role="alert" className="aec-message">{tr?"Uyarılar yüklenemedi. Yenile düğmesiyle tekrar deneyin.":"Could not load alerts. Use Refresh to try again."}</p>}
  <div className="aec-metrics"><article className={ready?(summary.critical?"critical":"healthy"):""}><b>{ready?summary.critical:"—"}</b><span>{tr?"Kritik açık":"Critical open"}</span></article><article className={ready?(summary.high?"attention":"healthy"):""}><b>{ready?summary.high:"—"}</b><span>{tr?"Yüksek açık":"High open"}</span></article><article><b>{ready?summary.active:"—"}</b><span>{tr?"Aksiyon bekliyor":"Needs action"}</span></article><article><b>{ready?summary.acknowledged:"—"}</b><span>{tr?"Takibe alındı":"Acknowledged"}</span></article><article><b>{ready?summary.resolved30d:"—"}</b><span>{tr?"30 günde çözüldü":"Resolved in 30d"}</span></article><article><b>{ready?(policy.remindersEnabled?`${policy.reminderDays}d`:"OFF"):"—"}</b><span>{tr?"Reminder politikası":"Reminder policy"}</span></article></div>
  <div className="aec-toolbar"><div>{filters.map(item=><button key={item.id} className={filter===item.id?"active":""} aria-pressed={filter===item.id} onClick={()=>{setFilter(item.id);setPage(1)}}>{tr?item.tr:item.en}</button>)}</div><small>{ready?policy.signals:"—"} {tr?"canlı koşul":"live conditions"}{policy.connectorHealthAvailable===false?` · ${tr?"connector health okunamadı":"connector health unavailable"}`:""}</small></div>
  <label className="aec-search">{tr?"Uyarı, kayıt veya sorumlu ara":"Search alert, record or owner"}<input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}}/></label>
  {ready&&records.length>=500&&<p className="aec-message">{tr?"İlk 500 kayıt gösteriliyor; arama bu kayıtlar üzerinde çalışır.":"Showing the first 500 records; search covers these records."}</p>}
  {selected&&<form className="aec-followup" onSubmit={event=>{event.preventDefault();void acknowledge(selected)}}>
   <h5>{tr?"Takip notu":"Follow-up note"} · {selected.title}</h5>
   <label>{tr?"Aksiyon / takip notu (10–1200 karakter)":"Action / follow-up note (10–1200 characters)"}<textarea autoFocus rows={3} minLength={10} maxLength={1200} required disabled={busy} value={note} onChange={event=>setNote(event.target.value)}/></label>
   <small>{note.trim().length}/1200</small><div><button type="submit" disabled={busy||loading||loadError||!canAcknowledgeEscalation(role,selected.status,note)}>{busy?(tr?"Kaydediliyor…":"Saving…"):(tr?"Takibe al":"Acknowledge")}</button><button type="button" disabled={busy} onClick={()=>{setSelected(null);setNote("")}}>{tr?"Vazgeç":"Cancel"}</button></div>
  </form>}
  <div className="aec-list" aria-busy={loading}>{visible.map(item=>{const actionLabel=recordLabel(item,tr);return <article key={item.id} className={`${item.severity} ${item.status}`}><div className="aec-severity"><b>{item.severity.toUpperCase()}</b><small>{item.kind.replaceAll("-"," ")}</small></div><div className="aec-copy"><span><b>{item.title}</b><em>{item.status}</em></span><p>{item.detail}</p><small>{item.subjectRef} · {item.owner||"unassigned"} · {new Date(item.lastSeenAt).toLocaleString(tr?"tr-TR":"en-GB")}</small>{item.status==="acknowledged"&&<small>{tr?"Takip":"Follow-up"}: {item.acknowledgedBy} · {item.ackNote}</small>}</div><div className="aec-actions">{item.navigation&&<button aria-label={actionLabel} onClick={()=>openEscalationRecord(item)}>{actionLabel}</button>}{item.status==="active"&&canEdit&&<button disabled={busy} onClick={()=>{setSelected(item);setNote("");setMessage("")}}>{tr?"Takibe Al":"Acknowledge"}</button>}</div></article>})}{!visible.length&&<p className="aec-empty">{loading?(tr?"Uyarılar yükleniyor…":"Loading alerts…"):loadError?(tr?"Veri alınamadı.":"Data unavailable."):(tr?"Arama ve filtreyle eşleşen uyarı yok.":"No alerts match the search and filter.")}</p>}</div>
  {ready&&<footer className="aec-pagination"><span>{result.start}–{result.end} / {result.total}</span><button type="button" disabled={result.page<=1} onClick={()=>setPage(result.page-1)}>{tr?"Önceki":"Previous"}</button><span>{result.page}/{result.pages}</span><button type="button" disabled={result.page>=result.pages} onClick={()=>setPage(result.page+1)}>{tr?"Sonraki":"Next"}</button></footer>}
 </section>;
}