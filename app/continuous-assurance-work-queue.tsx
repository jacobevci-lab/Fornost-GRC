"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import { assuranceWorkAgeHours, assuranceWorkSlaHours, assuranceWorkSlaState, summarizeAssuranceQueue } from "./assurance-work-queue-metrics";
import ContinuousAssuranceTimeline from "./continuous-assurance-timeline";
import "./continuous-assurance-work-queue.css";
import "./assurance-work-queue-operations.css";

type Lang = "tr" | "en";
type WorkItem = {
  id:string;
  findingId:string;
  ruleId:string;
  action:string;
  status:string;
  findingTitle:string;
  severity:string;
  owner:string;
  dueDate:string;
  ruleName:string;
  controlRefs:string;
  createdAt?:string;
  updatedAt:string;
  actor:string;
  reviewedBy?:string;
  reviewedAt?:string;
  reviewNote?:string;
  resultRef?:string;
  resultCode?:string;
  completedAt?:string;
};
type Summary = { total:number; pendingReview:number; awaitingRetest:number; capaPromotion:number; retest:number; failedRetest:number; retestError:number; completed:number; rejected:number };
type ReviewState = { item:WorkItem; decision:"approve"|"reject"; note:string };
type ReviewResponse = { message?:string; error?:string; code?:string; findingId?:string };
type QueueFilter = "active"|"review"|"retest"|"attention"|"all";
const emptySummary:Summary={total:0,pendingReview:0,awaitingRetest:0,capaPromotion:0,retest:0,failedRetest:0,retestError:0,completed:0,rejected:0};

function openPromotedCapa(code:string){
  const findingCode=String(code||"").trim();
  if(!findingCode)return false;
  return navigateToFornost({
    module:"Bulgular ve CAPA",
    ref:findingCode,
    source:"continuous-assurance-work-queue",
    filter:{findingRef:findingCode},
  });
}

export default function ContinuousAssuranceWorkQueue({lang,onOpenAutomation}:{lang:Lang;onOpenAutomation:()=>void}){
  const tr=lang==="tr",[items,setItems]=useState<WorkItem[]>([]),[summary,setSummary]=useState<Summary>(emptySummary),[loading,setLoading]=useState(true),[canReview,setCanReview]=useState(false),[reviewing,setReviewing]=useState<ReviewState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[filter,setFilter]=useState<QueueFilter>("active"),[detailsOpen,setDetailsOpen]=useState(false);
  const load=useCallback(async()=>{
    const [queueResponse,authResponse]=await Promise.all([
      fetch(withBasePath("/api/continuous-assurance"),{cache:"no-store",headers:{accept:"application/json"}}),
      fetch(withBasePath("/api/auth"),{cache:"no-store",headers:{accept:"application/json"}}),
    ]);
    if(queueResponse.ok){const data=await queueResponse.json();setItems(Array.isArray(data.items)?data.items:[]);setSummary(data.summary||emptySummary)}
    if(authResponse.ok){const auth=await authResponse.json();setCanReview(auth?.user?.role==="Admin")}
  },[]);
  useEffect(()=>{let live=true;(async()=>{try{await load()}catch{}finally{if(live)setLoading(false)}})();return()=>{live=false}},[load]);
  async function submitReview(){
    if(!reviewing)return;
    const review=reviewing;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(withBasePath("/api/continuous-assurance"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"review-work-item",workItemId:review.item.id,decision:review.decision,note:review.note})});
      const data=await response.json().catch(()=>({})) as ReviewResponse;
      setMessage(response.ok?(data.message||(tr?"İnceleme tamamlandı.":"Review completed.")):(data.error||(tr?"İnceleme tamamlanamadı.":"Review failed.")));
      if(response.ok){
        setReviewing(null);
        await load();
        if(review.decision==="approve"&&review.item.action==="capa-promotion"&&data.code)openPromotedCapa(data.code);
      }
    }finally{setBusy(false)}
  }
  const queueHealth=useMemo(()=>summarizeAssuranceQueue(items),[items]);
  const visible=useMemo(()=>items.filter(item=>{
    if(filter==="all")return true;
    if(filter==="review")return item.status==="pending-review";
    if(filter==="retest")return item.status==="approved-awaiting-retest";
    if(filter==="attention")return item.status==="failed-retest"||item.status==="retest-error"||assuranceWorkSlaState(item)==="breached";
    return ["pending-review","approved-awaiting-retest","failed-retest","retest-error"].includes(item.status);
  }).slice(0,25),[items,filter]);
  const statusLabel=(status:string)=>tr?({"pending-review":"İnceleme bekliyor","approved-awaiting-retest":"Re-test bekliyor","failed-retest":"Re-test başarısız","retest-error":"Re-test hatası",completed:"Tamamlandı",rejected:"Reddedildi"} as Record<string,string>)[status]||status:({"pending-review":"Pending review","approved-awaiting-retest":"Awaiting re-test","failed-retest":"Re-test failed","retest-error":"Re-test error",completed:"Completed",rejected:"Rejected"} as Record<string,string>)[status]||status;
  const slaLabel=(item:WorkItem)=>{const state=assuranceWorkSlaState(item),age=Math.round(assuranceWorkAgeHours(item)),sla=assuranceWorkSlaHours(item);if(state==="breached")return tr?`SLA aşıldı · ${age} sa / ${sla} sa`:`SLA breached · ${age}h / ${sla}h`;if(state==="due-soon")return tr?`SLA yaklaşıyor · ${age} sa / ${sla} sa`:`SLA due soon · ${age}h / ${sla}h`;if(state==="within-sla")return tr?`SLA içinde · ${age} sa / ${sla} sa`:`Within SLA · ${age}h / ${sla}h`;return tr?"İş tamamlandı":"Work closed"};
  return <section className="assurance-work-queue" aria-label={tr?"Sürekli güvence iş kuyruğu":"Continuous assurance work queue"}>
    <header><div><small>{tr?"BENİM İŞLERİM · GÜVENCE":"MY WORK · ASSURANCE"}</small><h4>{tr?"Öncelikli güvence işleri":"Priority assurance work"}</h4><p>{tr?"İnceleme, CAPA ve re-test gerektiren işleri tek yerden tamamlayın.":"Complete review, CAPA and re-test work from one focused queue."}</p></div><button type="button" onClick={onOpenAutomation}>{tr?"Kanıt Otomasyonu":"Evidence Automation"}<span>→</span></button></header>
    {message&&<div className="assurance-work-message" onClick={()=>setMessage("")}>{message}<b>×</b></div>}
    <div className="assurance-work-summary"><span><b>{loading?"…":summary.pendingReview}</b><small>{tr?"İnceleme":"Review"}</small></span><span><b>{summary.awaitingRetest}</b><small>{tr?"Re-test bekliyor":"Awaiting re-test"}</small></span><span><b>{summary.failedRetest+summary.retestError}</b><small>{tr?"Dikkat":"Attention"}</small></span><span><b>{summary.completed}</b><small>{tr?"Tamamlanan":"Completed"}</small></span></div>
    <div className="assurance-work-filters">{(["active","review","retest","attention","all"] as QueueFilter[]).map(value=><button key={value} type="button" className={filter===value?"active":""} onClick={()=>setFilter(value)}>{tr?({active:"Aktif",review:"İnceleme",retest:"Re-test",attention:"Dikkat",all:"Tümü"} as Record<QueueFilter,string>)[value]:({active:"Active",review:"Review",retest:"Re-test",attention:"Attention",all:"All"} as Record<QueueFilter,string>)[value]}</button>)}<button type="button" className={detailsOpen?"active":""} aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(value=>!value)}>{detailsOpen?(tr?"Operasyon detayını gizle":"Hide operations"):(tr?"Operasyon detayı":"Operations")}</button></div>
    {detailsOpen&&<div className="assurance-ops" aria-label={tr?"Güvence kuyruk operasyon metrikleri":"Assurance queue operations metrics"}>
      <article className={queueHealth.breached?"critical":""}><b>{queueHealth.breached}</b><small>{tr?"SLA ihlali":"SLA breached"}</small></article>
      <article className={queueHealth.dueSoon?"attention":""}><b>{queueHealth.dueSoon}</b><small>{tr?"SLA yaklaşıyor":"SLA due soon"}</small></article>
      <article><b>{queueHealth.oldestPendingHours}h</b><small>{tr?"En eski bekleyen":"Oldest pending"}</small></article>
      <article><b>{queueHealth.averageReviewHours}h</b><small>{tr?"Ort. inceleme":"Avg. review"}</small></article>
      <article><b>{queueHealth.withinSlaPercent}%</b><small>{tr?"SLA içinde":"Within SLA"}</small></article>
    </div>}
    {visible.length?<div className="assurance-work-list">{visible.map(item=>{const slaState=assuranceWorkSlaState(item);return <article key={item.id} className={`work-${item.status}`}>
      <div className="assurance-work-kind"><span className={item.action==="capa-promotion"?"capa":"retest"}>{item.action==="capa-promotion"?"CAPA":(tr?"Re-test":"Re-test")}</span><small>{item.controlRefs||item.ruleId}</small></div>
      <div className="assurance-work-main"><b>{item.findingTitle||item.findingId}</b><small>{item.ruleName||item.ruleId}</small>{(item.resultCode||item.resultRef)&&<em>{tr?"Sonuç: ":"Result: "}{item.resultCode||item.resultRef}</em>}<em className={`assurance-work-sla ${slaState}`}>{slaLabel(item)}</em></div>
      <div className="assurance-work-meta"><span className={`work-status ${item.status}`}>{statusLabel(item.status)}</span><span className={`severity ${item.severity||"medium"}`}>{item.severity||"—"}</span><small>{item.owner||"—"}{item.dueDate?` · ${item.dueDate}`:""}</small></div>
      <div className="assurance-work-actions">
        {item.status==="pending-review"&&canReview&&<><button type="button" className="approve" onClick={()=>setReviewing({item,decision:"approve",note:""})}>{tr?"Onayla":"Approve"}</button><button type="button" className="reject" onClick={()=>setReviewing({item,decision:"reject",note:""})}>{tr?"Reddet":"Reject"}</button></>}
        {item.status==="approved-awaiting-retest"&&<button type="button" onClick={onOpenAutomation}>{tr?"Re-test Çalıştır":"Run Re-test"}</button>}
        {(item.status==="failed-retest"||item.status==="retest-error")&&<button type="button" onClick={onOpenAutomation}>{tr?"Kontrolü İncele":"Inspect Control"}</button>}
        {item.status==="completed"&&item.action==="capa-promotion"&&item.resultCode&&<button type="button" onClick={()=>openPromotedCapa(item.resultCode||"")}>{tr?"CAPA'yı Aç":"Open CAPA"}</button>}
      </div>
    </article>})}</div>:<div className="assurance-work-empty">{loading?(tr?"Güvence işleri yükleniyor…":"Loading assurance work…"):(tr?"Bu filtrede yapmanız gereken bir güvence işi yok.":"There is no assurance work requiring your action in this filter.")}</div>}
    {detailsOpen&&<ContinuousAssuranceTimeline lang={lang}/>} 
    {reviewing&&<div className="assurance-review-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setReviewing(null)}}><section className="assurance-review-dialog" role="dialog" aria-modal="true" aria-label={tr?"Güvence işini incele":"Review assurance work"}><header><div><small>{reviewing.decision==="approve"?(tr?"ONAY":"APPROVAL"):(tr?"RET":"REJECTION")}</small><h4>{reviewing.item.findingTitle}</h4></div><button type="button" disabled={busy} onClick={()=>setReviewing(null)}>×</button></header><p>{reviewing.item.action==="capa-promotion"?(tr?"Onay, bu adayı Bulgular & CAPA yaşam döngüsüne aktarır.":"Approval promotes this candidate into the Findings & CAPA lifecycle."):(tr?"Onaydan sonra bir sonraki kontrol çalışması re-test olarak değerlendirilir ve bağlı risk yeniden hesaplanır.":"After approval, the next control run is evaluated as the re-test and the linked risk is recalculated.")}</p><label>{tr?"İnceleme notu":"Review note"}<textarea autoFocus value={reviewing.note} onChange={event=>setReviewing({...reviewing,note:event.target.value})} placeholder={reviewing.decision==="reject"?(tr?"Ret gerekçesi (zorunlu)…":"Rejection reason (required)…"):(tr?"Onay notu (isteğe bağlı)…":"Approval note (optional)…")}/></label><footer><button type="button" disabled={busy} onClick={()=>setReviewing(null)}>{tr?"Vazgeç":"Cancel"}</button><button type="button" className={reviewing.decision==="approve"?"approve":"reject"} disabled={busy||(reviewing.decision==="reject"&&reviewing.note.trim().length<10)} onClick={submitReview}>{busy?(tr?"İşleniyor…":"Processing…"):(reviewing.decision==="approve"?(tr?"Onayla":"Approve"):(tr?"Reddet":"Reject"))}</button></footer></section></div>}
  </section>;
}
