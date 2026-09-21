"use client";

import { useEffect, useState } from "react";
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
};
type Summary = { total:number; pendingReview:number; capaPromotion:number; retest:number };

export default function ContinuousAssuranceWorkQueue({lang,onOpenAutomation}:{lang:Lang;onOpenAutomation:()=>void}){
  const tr=lang==="tr",[items,setItems]=useState<WorkItem[]>([]),[summary,setSummary]=useState<Summary>({total:0,pendingReview:0,capaPromotion:0,retest:0}),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();let live=true;
    fetch(withBasePath("/api/continuous-assurance"),{cache:"no-store",signal:controller.signal,headers:{accept:"application/json"}})
      .then(response=>response.ok?response.json():null)
      .then(data=>{if(live&&data){setItems(Array.isArray(data.items)?data.items:[]);if(data.summary)setSummary(data.summary)}})
      .catch(()=>{})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false;controller.abort()};
  },[]);
  const pending=items.filter(item=>item.status==="pending-review").slice(0,8);
  return <section className="assurance-work-queue" aria-label={tr?"Sürekli güvence iş kuyruğu":"Continuous assurance work queue"}>
    <header><div><small>{tr?"ASSURANCE WORK QUEUE":"ASSURANCE WORK QUEUE"}</small><h4>{tr?"İnceleme ve yeniden test işleri":"Review & re-test work"}</h4></div><button type="button" onClick={onOpenAutomation}>{tr?"Kanıt Otomasyonunu Aç":"Open Evidence Automation"}<span>→</span></button></header>
    <div className="assurance-work-summary"><span><b>{loading?"…":summary.pendingReview}</b><small>{tr?"Bekleyen":"Pending"}</small></span><span><b>{summary.retest}</b><small>{tr?"Re-test":"Re-test"}</small></span><span><b>{summary.capaPromotion}</b><small>{tr?"CAPA promotion":"CAPA promotion"}</small></span></div>
    {pending.length?<div className="assurance-work-list">{pending.map(item=><article key={item.id}>
      <div className="assurance-work-kind"><span className={item.action==="capa-promotion"?"capa":"retest"}>{item.action==="capa-promotion"?(tr?"CAPA İncelemesi":"CAPA Review"):(tr?"Kontrol Re-test":"Control Re-test")}</span><small>{item.controlRefs||item.ruleId}</small></div>
      <div className="assurance-work-main"><b>{item.findingTitle||item.findingId}</b><small>{item.ruleName||item.ruleId}</small></div>
      <div className="assurance-work-meta"><span className={`severity ${item.severity||"medium"}`}>{item.severity||"—"}</span><small>{item.owner||"—"}{item.dueDate?` · ${item.dueDate}`:""}</small></div>
    </article>)}</div>:<div className="assurance-work-empty">{loading?(tr?"Güvence işleri yükleniyor…":"Loading assurance work…"):(tr?"Bekleyen re-test veya CAPA promotion işi yok.":"No pending re-test or CAPA promotion work.")}</div>}
  </section>;
}
