"use client";

import {assuranceSourceReady,type AssuranceQueueContext,type AssuranceSourceState} from "./assurance-queue-context";
import {matchesAssuranceQueueFilter,type AssuranceQueueFilter} from "./assurance-queue-filter";
import {assuranceQueueSummary} from "./assurance-queue-summary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJsonWithDeadline } from "./bounded-json-request";
import { canStartAssuranceReview, canReviewAssuranceWork, validAssuranceQueue, assuranceQueueComplete } from "./assurance-queue-access";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import { assuranceWorkAgeHours, assuranceWorkSlaHours, assuranceWorkSlaState, summarizeAssuranceQueue } from "./assurance-work-queue-metrics";
import ControlRunDetail from "./connectors/control-run-detail";
import { retestReasonText, type RetestOutcome } from "./assurance-retest";
import ContinuousAssuranceTimeline from "./continuous-assurance-timeline";
import "./continuous-assurance-work-queue.css";
import "./assurance-work-queue-operations.css";

type Lang = "tr" | "en";
type WorkItem = {
  sourceState?:AssuranceSourceState;
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
  targetControlRef?:string;
  createdAt?:string;
  updatedAt:string;
  actor:string;
  reviewedBy?:string;
  reviewedAt?:string;
  reviewNote?:string;
  resultRef?:string;
  resultCode?:string;
  completedAt?:string;
  retestOutcome?:RetestOutcome;
};
type Summary = { total:number; pendingReview:number; awaitingRetest:number; capaPromotion:number; retest:number; failedRetest:number; retestError:number; completed:number; rejected:number };
type ReviewState = { item:WorkItem; decision:"approve"|"reject"; note:string };
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

function openAutomationRule(ruleId:string){
  const ref=String(ruleId||"").trim();
  if(!ref)return false;
  return navigateToFornost({
    module:"Kanıt Otomasyonu",
    ref,
    source:"continuous-assurance-work-queue",
    filter:{ruleRef:ref},
  });
}

function openMappedControl(controlRef:string){
  const ref=String(controlRef||"").trim();
  if(!ref)return false;
  return navigateToFornost({
    module:"Kontroller",
    ref,
    source:"continuous-assurance-work-queue",
    filter:{controlRef:ref},
  });
}

export default function ContinuousAssuranceWorkQueue({lang,onOpenAutomation}:{lang:Lang;onOpenAutomation:()=>void}){
  const tr=lang==="tr",[items,setItems]=useState<WorkItem[]>([]),[summary,setSummary]=useState<Summary>(emptySummary),[loading,setLoading]=useState(true),[canReview,setCanReview]=useState(false),[reviewing,setReviewing]=useState<ReviewState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[filter,setFilter]=useState<QueueFilter>("active"),[detailsOpen,setDetailsOpen]=useState(false),[loadError,setLoadError]=useState(false),[canWrite,setCanWrite]=useState(false),[actorEmail,setActorEmail]=useState(""),[visibleLimit,setVisibleLimit]=useState(25),[resultItem,setResultItem]=useState<WorkItem|null>(null);
  const [query,setQuery]=useState("");
  const [queueComplete,setQueueComplete]=useState(false);
  const [queueContext,setQueueContext]=useState<AssuranceQueueContext>("full");
  const contextReady=queueContext!=="work-only";
  const [serverQuery,setServerQuery]=useState("");
  const [serverFilter,setServerFilter]=useState<AssuranceQueueFilter>("all");
  const requestedFilter=useRef<AssuranceQueueFilter>("all");
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const snapshot=useRef<{items:WorkItem[];summary:Summary;cursor:string|null;query:string;lang:Lang;context:AssuranceQueueContext;filter:AssuranceQueueFilter}>({items:[],summary:emptySummary,cursor:null,query:"",lang:"en",context:"full",filter:"all"});
  const [assessedAt,setAssessedAt]=useState(()=>new Date());
  useEffect(()=>{
    const update=()=>setAssessedAt(new Date());
    const timer=setInterval(update,30_000);
    const visible=()=>{if(document.visibilityState==="visible")update();};
    document.addEventListener("visibilitychange",visible);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[]);
  const reads=useRef<AbortController|null>(null),writes=useRef<AbortController|null>(null),sending=useRef(false);
  const load=useCallback(async(cursor?:string,search=snapshot.current.query,searchLanguage=snapshot.current.lang,scope=requestedFilter.current)=>{
    requestedFilter.current=scope;
    reads.current?.abort();const controller=new AbortController();reads.current=controller;
    setLoading(true);setLoadError(false);setReviewing(null);
    try{
      const params=new URLSearchParams();if(scope!=="all")params.set("filter",scope);if(cursor)params.set("cursor",cursor);if(search){params.set("q",search);params.set("lang",searchLanguage);}
      const [queue,auth]=await Promise.all([
        requestJsonWithDeadline(withBasePath(`/api/continuous-assurance${params.size?`?${params}`:""}`),{cache:"no-store",signal:controller.signal}),
        requestJsonWithDeadline(withBasePath("/api/auth"),{cache:"no-store",signal:controller.signal}),
      ]);
      const user=auth.body.user as {role?:unknown;email?:unknown}|undefined;
      if(!queue.response.ok||!auth.response.ok||!validAssuranceQueue(queue.body)||!user||typeof user.role!=="string"||typeof user.email!=="string")throw new Error("queue-unavailable");
      if(controller.signal.aborted)return;
      if(search){const echoed=queue.body.search as {query?:unknown;lang?:unknown}|undefined;if(!echoed||echoed.query!==search||echoed.lang!==searchLanguage)throw new Error("search-mismatch");}
      if((queue.body.filter??"all")!==scope)throw new Error("filter-mismatch");
      const context=(queue.body.context??"full") as AssuranceQueueContext;
      const pageItems=queue.body.items as WorkItem[];
      if(pageItems.some(item=>!matchesAssuranceQueueFilter(item.status,scope)))throw new Error("filter-record-mismatch");
      const previousIds=new Set(snapshot.current.items.map(item=>item.id));
      if(cursor&&(snapshot.current.cursor!==cursor||snapshot.current.query!==search||snapshot.current.lang!==searchLanguage||snapshot.current.context!==context||snapshot.current.filter!==scope||pageItems.some(item=>previousIds.has(item.id))))throw new Error("queue-changed-refresh-required");
      const combined=cursor?[...snapshot.current.items,...pageItems]:pageItems;
      const combinedSummary=assuranceQueueSummary(combined);
      const continuation=typeof queue.body.nextCursor==="string"?queue.body.nextCursor:null;
      snapshot.current={items:combined,summary:combinedSummary,cursor:continuation,query:search,lang:searchLanguage,context,filter:scope};
      setServerFilter(scope);setQueueContext(context);setServerQuery(search);setNextCursor(continuation);setAssessedAt(new Date());setQueueComplete(assuranceQueueComplete(queue.body));setItems(combined);setSummary(combinedSummary);
      if(!cursor)setVisibleLimit(25);
      setCanReview(context!=="work-only"&&user.role==="Admin");setCanWrite(context!=="work-only"&&["Admin","Editor"].includes(user.role));setActorEmail(user.email.trim().toLowerCase());
    }catch{if(!controller.signal.aborted){setLoadError(true);setCanReview(false);setCanWrite(false);setActorEmail("");}}
    finally{if(!controller.signal.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{const readRequests=reads,writeRequests=writes;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);readRequests.current?.abort();writeRequests.current?.abort();};},[load]);
  async function write(body:Record<string,unknown>,successMessage:string){
    if(sending.current||loading||loadError||!canWrite)return null;
    sending.current=true;setBusy(true);setMessage("");
    const controller=new AbortController();writes.current=controller;
    const uncertain=()=>{setReviewing(null);setMessage(tr?"İşlem sonucu doğrulanamadı. Tekrar göndermeden önce yenilenen kuyruğu kontrol edin.":"The result could not be confirmed. Check the refreshed queue before submitting again.");};
    try{
      const {response,body:data}=await requestJsonWithDeadline(withBasePath("/api/continuous-assurance"),{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify(body)});
      if(controller.signal.aborted)return null;
      if(response.status>=500){uncertain();await load();return null;}
      setMessage(response.ok?(typeof data.message==="string"?data.message:successMessage):(typeof data.error==="string"?data.error:(tr?"İşlem tamamlanamadı.":"Operation failed.")));
      if(response.ok||[401,403,409].includes(response.status)){setReviewing(null);await load();}
      return response.ok?data:null;
    }catch{if(!controller.signal.aborted){uncertain();await load();}return null;}
    finally{sending.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  async function submitReview(){
    if(!reviewing||!canReviewAssuranceWork(canReview?"Admin":"",actorEmail,reviewing.item,reviewing.decision,reviewing.note))return;
    const review=reviewing;
    const data=await write({action:"review-work-item",workItemId:review.item.id,decision:review.decision,note:review.note.trim()},tr?"İnceleme tamamlandı.":"Review completed.");
    if(data&&review.decision==="approve"&&review.item.action==="capa-promotion"&&typeof data.code==="string")openPromotedCapa(data.code);
  }
  async function requestAnotherTest(item:WorkItem){
    if(item.status!=="retest-error"||!assuranceSourceReady(item))return;
    await write({action:"queue-retest",findingId:item.findingId,previousWorkItemId:item.id},tr?"Yeni test bağımsız onay kuyruğunda. Onaydan sonraki çalışma değerlendirilecek.":"The new test is queued for independent approval. A run after approval will be evaluated.");
  }
  const queueHealth=useMemo(()=>summarizeAssuranceQueue(items,assessedAt),[items,assessedAt]);
  const matching=useMemo(()=>items.filter(item=>{
    const search=[item.id,item.findingTitle,item.findingId,item.ruleName,item.ruleId,item.owner,item.targetControlRef,item.controlRefs,item.resultCode].join(" ").toLocaleLowerCase(tr?"tr-TR":"en-US");
    if(!search.includes(query.trim().toLocaleLowerCase(tr?"tr-TR":"en-US")))return false;
    if(filter==="all")return true;
    if(filter==="review")return item.status==="pending-review";
    if(filter==="retest")return item.status==="approved-awaiting-retest";
    if(filter==="attention"&&!contextReady)return ["pending-review","approved-awaiting-retest","failed-retest","retest-error"].includes(item.status);
    if(filter==="attention")return item.status==="failed-retest"||item.status==="retest-error"||["breached","unknown"].includes(assuranceWorkSlaState(item,assessedAt));
    return ["pending-review","approved-awaiting-retest","failed-retest","retest-error"].includes(item.status);
  }),[items,filter,query,tr,assessedAt,contextReady]);
  const visible=matching.slice(0,visibleLimit);
  const statusLabel=(status:string)=>tr?({"pending-review":"İnceleme bekliyor","approved-awaiting-retest":"Re-test bekliyor","failed-retest":"Re-test başarısız","retest-error":"Re-test hatası",completed:"Tamamlandı",rejected:"Reddedildi"} as Record<string,string>)[status]||status:({"pending-review":"Pending review","approved-awaiting-retest":"Awaiting re-test","failed-retest":"Re-test failed","retest-error":"Re-test error",completed:"Completed",rejected:"Rejected"} as Record<string,string>)[status]||status;
  const slaLabel=(item:WorkItem)=>{if(!contextReady)return tr?"SLA değerlendirilmedi · bulgu/kural verisi eksik":"SLA not assessed · finding/rule context unavailable";if(!assuranceSourceReady(item)){const reason=({"missing-finding":tr?"kaynak bulgu eksik":"source finding is missing","missing-rule":tr?"kaynak kural eksik":"source rule is missing","rule-mismatch":tr?"bulgu ve işin kuralları uyuşmuyor":"finding and work rules do not match",unavailable:tr?"kaynak verisi kullanılamıyor":"source context unavailable"} as Partial<Record<AssuranceSourceState,string>>)[item.sourceState!];return `${tr?"SLA değerlendirilmedi":"SLA not assessed"} · ${reason}`;}const state=assuranceWorkSlaState(item,assessedAt),age=Math.round(assuranceWorkAgeHours(item,assessedAt)??0),sla=assuranceWorkSlaHours(item);if(state==="unknown")return tr?"SLA belirsiz · geçerli oluşturulma zamanı yok":"SLA unknown · no valid creation timestamp";if(state==="breached")return tr?`SLA aşıldı · ${age} sa / ${sla} sa`:`SLA breached · ${age}h / ${sla}h`;if(state==="due-soon")return tr?`SLA yaklaşıyor · ${age} sa / ${sla} sa`:`SLA due soon · ${age}h / ${sla}h`;if(state==="within-sla")return tr?`SLA içinde · ${age} sa / ${sla} sa`:`Within SLA · ${age}h / ${sla}h`;return tr?"İş tamamlandı":"Work closed"};
  return <section className="assurance-work-queue" aria-label={tr?"Sürekli güvence iş kuyruğu":"Continuous assurance work queue"}>
    <header><div><small>{tr?"BENİM İŞLERİM · GÜVENCE":"MY WORK · ASSURANCE"}</small><h4>{tr?"Öncelikli güvence işleri":"Priority assurance work"}</h4><p>{tr?"İnceleme, CAPA ve re-test gerektiren işleri tek yerden tamamlayın.":"Complete review, CAPA and re-test work from one focused queue."}</p></div><div className="assurance-work-header-actions"><button type="button" disabled={loading||busy} onClick={()=>void load()}>{tr?"Yenile":"Refresh"}</button><button type="button" onClick={onOpenAutomation}>{tr?"Kanıt Otomasyonu":"Evidence Automation"}<span>→</span></button></div></header>
    {loadError&&<div className="assurance-work-message" role="alert">{tr?"Güvence kuyruğu yüklenemedi. Yenileyerek tekrar deneyin.":"The assurance queue could not be loaded. Refresh to retry."}</div>}
    {!loading&&!loadError&&!queueComplete&&<p className="assurance-work-message assurance-queue-coverage" role="status">{tr?`Kısmi kuyruk: ${items.length} iş yüklendi. Arama ve filtreler bu kayıtlarla sınırlı; genel sayaçlar ve SLA metrikleri hesaplanmadı.`:`Partial queue: ${items.length} items loaded. Search and filters cover only these records; overall counters and SLA metrics were not assessed.`}</p>}
    {!loading&&!loadError&&queueContext!=="full"&&<p className="assurance-work-message assurance-context-warning" role="status">{queueContext==="work-only"?(tr?"Bulgu ve kural verileri kullanılamıyor. SLA hesaplanmadı; onay ve yeniden test işlemleri kapatıldı. Yöneticinizden veri kaynağını kontrol etmesini isteyin ve yenileyin.":"Finding and rule context is unavailable. SLA was not assessed; review and retest actions are disabled. Ask your administrator to check the data source, then refresh."):(tr?"CAPA bağlantı kodları kullanılamıyor. İş kayıtları yüklendi; CAPA bağlantıları için veri kaynağını kontrol edip yenileyin.":"CAPA reference codes are unavailable. Work items are loaded; check the data source and refresh to restore CAPA links.")}</p>}
    {message&&<div role="status" className="assurance-work-message" onClick={()=>setMessage("")}>{message}<b>×</b></div>}
    <div className="assurance-work-summary"><span><b>{loading||loadError||!queueComplete?"—":summary.pendingReview}</b><small>{tr?"İnceleme":"Review"}</small></span><span><b>{loading||loadError||!queueComplete?"—":summary.awaitingRetest}</b><small>{tr?"Re-test bekliyor":"Awaiting re-test"}</small></span><span><b>{loading||loadError||!queueComplete?"—":summary.failedRetest+summary.retestError}</b><small>{tr?"Dikkat":"Attention"}</small></span><span><b>{loading||loadError||!queueComplete?"—":summary.completed}</b><small>{tr?"Tamamlanan":"Completed"}</small></span></div>
    {!loading&&!loadError&&serverFilter!=="all"&&<p className="assurance-work-message" role="status">{tr?`Durum kapsamı: ${{active:"Aktif",review:"İnceleme",retest:"Re-test"}[serverFilter]}. Sayaçlar ve SLA değerleri yalnızca bu kapsamdaki işleri içerir.`:`Status scope: ${{active:"Active",review:"Review",retest:"Re-test"}[serverFilter]}. Counters and SLA metrics include only work in this scope.`}</p>}
    {filter==="attention"&&!queueComplete&&<p className="assurance-work-message" role="status">{tr?"Dikkat değerlendirmesi yüklenen kayıtları kapsar. Diğer işleri görmek için sonraki kayıtları yükleyin.":"Attention is assessed over loaded records. Load the next records to inspect remaining work."}</p>}
    {serverQuery&&<p className="assurance-work-message" role="status">{tr?`Sunucu araması: “${serverQuery}”. Sayaçlar ve SLA değerleri bu aramanın sonuçlarını kapsar.`:`Server search: “${serverQuery}”. Counters and SLA metrics cover these search results.`}</p>}
    <input maxLength={200} className="assurance-work-search" type="search" aria-label={tr?"Güvence işi ara":"Search assurance work"} placeholder={tr?"Bulgu, kural, kontrol veya sahip ara…":"Search finding, rule, control or owner…"} value={query} onChange={event=>{setQuery(event.target.value);setVisibleLimit(25)}}/>
    <div className="assurance-work-more"><button type="button" disabled={loading||busy||!query.trim()} onClick={()=>void load(undefined,query.trim(),lang)}>{serverFilter==="all"?(tr?"Tüm kayıtlarda ara":"Search all records"):(tr?"Bu kapsamda ara":"Search this scope")}</button>{serverQuery&&<button type="button" disabled={loading||busy} onClick={()=>{setQuery("");void load(undefined,"")}}>{tr?"Aramayı temizle":"Clear search"}</button>}</div>
    <div className="assurance-work-filters">{(["active","review","retest","attention","all"] as QueueFilter[]).map(value=><button key={value} type="button" className={filter===value?"active":""} disabled={busy||loading} onClick={()=>{setFilter(value);setVisibleLimit(25);void load(undefined,snapshot.current.query,snapshot.current.lang,value==="attention"?"all":value)}}>{tr?({active:"Aktif",review:"İnceleme",retest:"Re-test",attention:"Dikkat",all:"Tümü"} as Record<QueueFilter,string>)[value]:({active:"Active",review:"Review",retest:"Re-test",attention:"Attention",all:"All"} as Record<QueueFilter,string>)[value]}</button>)}<button type="button" className={detailsOpen?"active":""} aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(value=>!value)}>{detailsOpen?(tr?"Operasyon detayını gizle":"Hide operations"):(tr?"Operasyon detayı":"Operations")}</button></div>
    {!loading&&!loadError&&contextReady&&queueHealth.unknown>0&&<p className="assurance-work-message" role="status">{tr?`${queueHealth.unknown} aktif işin oluşturulma zamanı veya kaynak bağlantısı eksik ya da geçersiz. SLA oranı hesaplanmadı; işleri Dikkat filtresinde inceleyin.`:`${queueHealth.unknown} active items have missing or invalid timestamps or source links. SLA percentage was not assessed; inspect them in Attention.`}</p>}
    {detailsOpen&&<div className="assurance-ops" aria-label={tr?"Güvence kuyruk operasyon metrikleri":"Assurance queue operations metrics"}>
      <article className={contextReady&&queueHealth.breached?"critical":""}><b>{loading||loadError||!queueComplete||!contextReady?"—":queueHealth.breached}</b><small>{tr?"SLA ihlali":"SLA breached"}</small></article>
      <article className={contextReady&&queueHealth.dueSoon?"attention":""}><b>{loading||loadError||!queueComplete||!contextReady?"—":queueHealth.dueSoon}</b><small>{tr?"SLA yaklaşıyor":"SLA due soon"}</small></article>
      <article><b>{loading||loadError||!queueComplete||!contextReady||queueHealth.oldestPendingHours===null?"—":`${queueHealth.oldestPendingHours}h`}</b><small>{tr?"En eski bekleyen":"Oldest pending"}</small></article>
      <article><b>{loading||loadError||!queueComplete||!contextReady||queueHealth.averageReviewHours===null?"—":`${queueHealth.averageReviewHours}h`}</b><small>{tr?"Ort. inceleme":"Avg. review"}</small></article>
      <article><b>{loading||loadError||!queueComplete||!contextReady||queueHealth.withinSlaPercent===null?"—":`${queueHealth.withinSlaPercent}%`}</b><small>{tr?"SLA içinde":"Within SLA"}</small></article>
    </div>}
    {!loadError&&(!loading&&visible.length?<div className="assurance-work-list">{visible.map(item=>{const slaState=contextReady?assuranceWorkSlaState(item,assessedAt):"unknown";return <article key={item.id} className={`work-${item.status}`}>
      <div className="assurance-work-kind"><span className={item.action==="capa-promotion"?"capa":"retest"}>{item.action==="capa-promotion"?"CAPA":(tr?"Re-test":"Re-test")}</span><small>{item.targetControlRef||item.controlRefs||item.ruleId}</small></div>
      <div className="assurance-work-main"><b>{item.findingTitle||item.findingId}</b><small>{item.ruleName||item.ruleId}</small>{(item.resultCode||item.resultRef)&&<em>{tr?"Sonuç: ":"Result: "}{item.resultCode||item.resultRef}</em>}<em className={`assurance-work-sla ${slaState}`}>{slaLabel(item)}</em></div>
      <div className="assurance-work-meta"><span className={`work-status ${item.status}`}>{statusLabel(item.status)}</span><span className={`severity ${item.severity||"medium"}`}>{item.severity||"—"}</span><small>{item.owner||"—"}{item.dueDate?` · ${item.dueDate}`:""}</small></div>
      <div className="assurance-work-actions">
        {canStartAssuranceReview(canReview?"Admin":"",actorEmail,item,"approve")&&<button type="button" className="approve" disabled={busy||loading||loadError} onClick={()=>setReviewing({item,decision:"approve",note:""})}>{tr?"Onayla":"Approve"}</button>}
        {canStartAssuranceReview(canReview?"Admin":"",actorEmail,item,"reject")&&<button type="button" className="reject" disabled={busy||loading||loadError} onClick={()=>setReviewing({item,decision:"reject",note:""})}>{tr?"Reddet":"Reject"}</button>}
        {item.status==="approved-awaiting-retest"&&<button type="button" onClick={()=>openAutomationRule(item.ruleId)}>{tr?"Re-test Kuralına Git":"Open Retest Rule"}</button>}
        {(item.status==="failed-retest"||item.status==="retest-error")&&<button type="button" onClick={()=>openAutomationRule(item.ruleId)}>{tr?"Kuralı İncele":"Inspect Rule"}</button>}
        {item.action==="control-retest"&&item.resultRef&&<button type="button" onClick={()=>setResultItem(item)}>{tr?"Test Sonucunu Aç":"View Test Result"}</button>}
        {item.status==="retest-error"&&canWrite&&assuranceSourceReady(item)&&<button type="button" disabled={busy||loading||loadError} onClick={()=>void requestAnotherTest(item)}>{tr?"Yeni Test İste":"Request New Test"}</button>}
        {item.targetControlRef&&<button type="button" onClick={()=>openMappedControl(item.targetControlRef||"")}>{tr?"Kontrolü Aç":"Open Control"}</button>}
        {item.status==="completed"&&item.action==="capa-promotion"&&item.resultCode&&<button type="button" onClick={()=>openPromotedCapa(item.resultCode||"")}>{tr?"CAPA'yı Aç":"Open CAPA"}</button>}
      </div>
    </article>})}</div>:<div className="assurance-work-empty">{loading?(tr?"Güvence işleri yükleniyor…":"Loading assurance work…"):(tr?"Bu filtrede yapmanız gereken bir güvence işi yok.":"There is no assurance work requiring your action in this filter.")}</div>)}
    {!loading&&!loadError&&matching.length>visible.length&&<div className="assurance-work-more"><span>{visible.length} / {matching.length}</span><button type="button" onClick={()=>setVisibleLimit(value=>value+25)}>{tr?"Daha fazla göster":"Show more"}</button></div>}
    {!loading&&!loadError&&nextCursor&&<div className="assurance-work-more"><span>{tr?`${items.length} kayıt yüklendi · arama yüklenen kayıtları kapsar`:`${items.length} records loaded · search covers loaded records`}</span><button type="button" disabled={busy} onClick={()=>void load(nextCursor)}>{tr?"Sonraki kayıtları yükle":"Load next records"}</button></div>}
    {detailsOpen&&<ContinuousAssuranceTimeline lang={lang}/>} 
    {resultItem?.resultRef&&<div className="assurance-review-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setResultItem(null)}}><section className="assurance-review-dialog assurance-result-dialog" role="dialog" aria-modal="true" aria-label={tr?"Yeniden test sonucu":"Re-test result"}>
      <header><div><small>{statusLabel(resultItem.status)}</small><h4>{resultItem.ruleName}</h4></div><button type="button" aria-label={tr?"Kapat":"Close"} onClick={()=>setResultItem(null)}>×</button></header>
      {resultItem.retestOutcome?<div className="assurance-retest-outcome"><p>{retestReasonText[resultItem.retestOutcome.reason]?.[lang]||resultItem.retestOutcome.reason}</p>
        <p>{resultItem.retestOutcome.riskUpdate==="applied"?(tr?"Sonuç bağlı riske işlendi. Bekleyen bağımsız risk onayı korunur.":"Result applied to the linked risk. Pending independent risk review is preserved."):resultItem.retestOutcome.riskUpdate==="newer-review-preserved"?(tr?"Daha yeni risk değerlendirmesi korundu; eski test sonucu üzerine yazılmadı.":"A newer risk assessment was preserved; the older test did not overwrite it."):(tr?"Risk güncellemesi uygulanamadı; bağlantıyı ve risk kaydını kontrol edin.":"Risk update was not applied; check its linkage and record.")}</p>
        <div>{resultItem.retestOutcome.riskId&&<button type="button" onClick={()=>{const ref=resultItem.retestOutcome!.riskId!;setResultItem(null);navigateToFornost({module:"Risk Assessment",ref,kind:"risk",source:"assurance-retest"})}}>{tr?"Riski Aç":"Open Risk"}</button>}{resultItem.retestOutcome.followUpFindingId&&<button type="button" onClick={()=>{const ref=resultItem.retestOutcome!.followUpFindingId!;setResultItem(null);navigateToFornost({module:"Kanıt Otomasyonu",ref,kind:"finding",source:"assurance-retest",filter:{findingRef:ref}})}}>{tr?"İlgili Açık Bulguyu Aç":"Open Related Finding"}</button>}</div>
      </div>:<p>{tr?"Bu eski iş kaydında risk uzlaştırma özeti yok; test ayrıntısı aşağıdadır.":"This legacy work item has no risk reconciliation summary; test details follow."}</p>}
      <ControlRunDetail runId={resultItem.resultRef} lang={lang}/>
    </section></div>}
    {reviewing&&<div className="assurance-review-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setReviewing(null)}}><section className="assurance-review-dialog" role="dialog" aria-modal="true" aria-label={tr?"Güvence işini incele":"Review assurance work"}><header><div><small>{reviewing.decision==="approve"?(tr?"ONAY":"APPROVAL"):(tr?"RET":"REJECTION")}</small><h4>{reviewing.item.findingTitle}</h4></div><button type="button" disabled={busy} onClick={()=>setReviewing(null)}>×</button></header><p>{reviewing.decision==="reject"?(tr?"Ret, bu iş talebini gerekçesiyle kapatır. Bulgu, risk veya kontrolün düzeltildiği anlamına gelmez.":"Rejection closes this work request with a reason. It does not mark the finding, risk or control as remediated."):reviewing.item.action==="capa-promotion"?(tr?"Onay, bu adayı Bulgular & CAPA yaşam döngüsüne aktarır.":"Approval promotes this candidate into the Findings & CAPA lifecycle."):(tr?"Onaydan sonraki ilk test ve kanıtı değerlendirilir. Risk onayı ayrı yürütülür.":"After approval, the next test and its evidence are checked. Risk approval remains independent.")}</p><label>{tr?"İnceleme notu":"Review note"}<textarea autoFocus maxLength={1200} value={reviewing.note} onChange={event=>setReviewing({...reviewing,note:event.target.value})} placeholder={reviewing.decision==="reject"?(tr?"Ret gerekçesi (zorunlu)…":"Rejection reason (required)…"):(tr?"Onay notu (isteğe bağlı)…":"Approval note (optional)…")}/></label><footer><button type="button" disabled={busy} onClick={()=>setReviewing(null)}>{tr?"Vazgeç":"Cancel"}</button><button type="button" className={reviewing.decision==="approve"?"approve":"reject"} disabled={busy||loading||loadError||!canReviewAssuranceWork(canReview?"Admin":"",actorEmail,reviewing.item,reviewing.decision,reviewing.note)} onClick={submitReview}>{busy?(tr?"İşleniyor…":"Processing…"):(reviewing.decision==="approve"?(tr?"Onayla":"Approve"):(tr?"Reddet":"Reject"))}</button></footer></section></div>}
  </section>;
}
