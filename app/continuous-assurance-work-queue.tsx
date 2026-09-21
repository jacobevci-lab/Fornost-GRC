"use client";

import { useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import "./continuous-assurance-work-queue.css";

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
  updatedAt:string;
  actor:string;
  reviewedBy?:string;
  reviewedAt?:string;
  reviewNote?:string;
  resultRef?:string;
  completedAt?:string;
};
type Summary = { total:number; pendingReview:number; awaitingRetest:number; capaPromotion:number; retest:number; failedRetest:number; retestError:number; completed:number; rejected:number };
type ReviewState = { item:WorkItem; decision:"approve"|"reject"; note:string };
const emptySummary:Summary={total:0,pendingReview:0,awaitingRetest:0,capaPromotion:0,retest:0,failedRetest:0,retestError:0,completed:0,rejected:0};

export default function ContinuousAssuranceWorkQueue({lang,onOpenAutomation}:{lang:Lang;onOpenAutomation:()=>void}){
  const tr=lang==="tr",[items,setItems]=useState<WorkItem[]>([]),[summary,setSummary]=useState<Summary>(emptySummary),[loading,setLoading]=useState(true),[canReview,setCanReview]=useState(false),[reviewing,setReviewing]=useState<ReviewState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
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
    setBusy(true);setMessage("");
    try{
      const response=await fetch(withBasePath("/api/continuous-assurance"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"review-work-item",workItemId:reviewing.item.id,decision:reviewing.decision,note:reviewing.note})});
      const data=await response.json().catch(()=>({}));
      setMessage(response.ok?(data.message||(tr?"İnceleme tamamlandı.":"Review completed.")):(data.error||(tr?"İnceleme tamamlanamadı.":"Review failed.")));
      if(response.ok){setReviewing(null);await load()}
    }finally{setBusy(false)}
  }
  const visible=items.filter(item=>["pending-review","approved-awaiting-retest","failed-retest","retest-error","completed"].includes(item.status)).slice(0,10);
  const statusLabel=(status:string)=>tr?({"pending-review":"İnceleme bekliyor","approved-awaiting-retest":"Re-test bekliyor","failed-retest":"Re-test başarısız","retest-error":"Re-test hatası",completed:"Tamamlandı",rejected:"Reddedildi"} as Record<string,string>)[status]||status:({"pending-review":"Pending review","approved-awaiting-retest":"Awaiting re-test","failed-retest":"Re-test failed","retest-error":"Re-test error",completed:"Completed",rejected:"Rejected"} as Record<string,string>)[status]||status;
  return <section className="assurance-work-queue" aria-label={tr?"Sürekli güvence iş kuyruğu":"Continuous assurance work queue"}>
    <header><div><small>ASSURANCE WORK QUEUE</small><h4>{tr?"İnceleme, CAPA ve re-test işleri":"Review, CAPA & re-test work"}</h4></div><button type="button" onClick={onOpenAutomation}>{tr?"Kanıt Otomasyonunu Aç":"Open Evidence Automation"}<span>→</span></button></header>
    {message&&<div className="assurance-work-message" onClick={()=>setMessage("")}>{message}<b>×</b></div>}
    <div className="assurance-work-summary"><span><b>{loading?"…":summary.pendingReview}</b><small>{tr?"İnceleme":"Review"}</small></span><span><b>{summary.awaitingRetest}</b><small>{tr?"Re-test bekliyor":"Awaiting re-test"}</small></span><span><b>{summary.failedRetest+summary.retestError}</b><small>{tr?"Dikkat":"Attention"}</small></span><span><b>{summary.completed}</b><small>{tr?"Tamamlanan":"Completed"}</small></span></div>
    {visible.length?<div className="assurance-work-list">{visible.map(item=><article key={item.id} className={`work-${item.status}`}>
      <div className="assurance-work-kind"><span className={item.action==="capa-promotion"?"capa":"retest"}>{item.action==="capa-promotion"?(tr?"CAPA Promotion":"CAPA Promotion"):(tr?"Kontrol Re-test":"Control Re-test")}</span><small>{item.controlRefs||item.ruleId}</small></div>
      <div className="assurance-work-main"><b>{item.findingTitle||item.findingId}</b><small>{item.ruleName||item.ruleId}</small>{item.resultRef&&<em>{tr?"Sonuç: ":"Result: "}{item.resultRef}</em>}</div>
      <div className="assurance-work-meta"><span className={`work-status ${item.status}`}>{statusLabel(item.status)}</span><span className={`severity ${item.severity||"medium"}`}>{item.severity||"—"}</span><small>{item.owner||"—"}{item.dueDate?` · ${item.dueDate}`:""}</small></div>
      <div className="assurance-work-actions">
        {item.status==="pending-review"&&canReview&&<><button type="button" className="approve" onClick={()=>setReviewing({item,decision:"approve",note:""})}>{tr?"Onayla":"Approve"}</button><button type="button" className="reject" onClick={()=>setReviewing({item,decision:"reject",note:""})}>{tr?"Reddet":"Reject"}</button></>}
        {item.status==="approved-awaiting-retest"&&<button type="button" onClick={onOpenAutomation}>{tr?"Re-test Çalıştır":"Run Re-test"}</button>}
        {(item.status==="failed-retest"||item.status==="retest-error")&&<button type="button" onClick={onOpenAutomation}>{tr?"Kontrolü İncele":"Inspect Control"}</button>}
      </div>
    </article>)}</div>:<div className="assurance-work-empty">{loading?(tr?"Güvence işleri yükleniyor…":"Loading assurance work…"):(tr?"Aktif re-test veya CAPA işi yok.":"No active re-test or CAPA work.")}</div>}
    {reviewing&&<div className="assurance-review-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setReviewing(null)}}><section className="assurance-review-dialog" role="dialog" aria-modal="true" aria-label={tr?"Güvence işini incele":"Review assurance work"}><header><div><small>{reviewing.decision==="approve"?(tr?"ONAY":"APPROVAL"):(tr?"RET":"REJECTION")}</small><h4>{reviewing.item.findingTitle}</h4></div><button type="button" disabled={busy} onClick={()=>setReviewing(null)}>×</button></header><p>{reviewing.item.action==="capa-promotion"?(tr?"Onay CAPA adayını canonical Bulgular & CAPA yaşam döngüsüne aktarır.":"Approval promotes this candidate into the canonical Findings & CAPA lifecycle."):(tr?"Onay sonrası bir sonraki kontrol çalışması re-test olarak otomatik uzlaştırılır ve bağlı risk yeniden değerlendirilir.":"After approval, the next control run is reconciled as the re-test and the linked risk is reassessed automatically.")}</p><label>{tr?"İnceleme notu":"Review note"}<textarea autoFocus value={reviewing.note} onChange={event=>setReviewing({...reviewing,note:event.target.value})} placeholder={reviewing.decision==="reject"?(tr?"Ret gerekçesi (zorunlu)…":"Rejection reason (required)…"):(tr?"Onay notu (isteğe bağlı)…":"Approval note (optional)…")}/></label><footer><button type="button" disabled={busy} onClick={()=>setReviewing(null)}>{tr?"Vazgeç":"Cancel"}</button><button type="button" className={reviewing.decision==="approve"?"approve":"reject"} disabled={busy||(reviewing.decision==="reject"&&reviewing.note.trim().length<10)} onClick={submitReview}>{busy?(tr?"İşleniyor…":"Processing…"):(reviewing.decision==="approve"?(tr?"Onayı Uygula":"Apply Approval"):(tr?"Reddet":"Reject"))}</button></footer></section></div>}
  </section>;
}
