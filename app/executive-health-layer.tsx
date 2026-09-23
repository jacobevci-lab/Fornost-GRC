"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { buildControlAssurance } from "./control-assurance";
import { buildExecutiveAssurance } from "./executive-assurance";
import { calculatedRiskScore } from "./risk-methodology";
import "./executive-health-layer.css";

type Lang = "tr" | "en";
type Row = { id:string; module:string; data:Record<string,unknown> };
type RawRow = { id?:unknown; module?:unknown; data?:unknown; data_json?:unknown };
type FindingsPayload = { findings?:Array<{owner?:string;dueDate?:string;status?:string}>; summary?:{total?:number;open?:number;overdue?:number} };
type AppetitePayload = { summary?:{total?:number;breached?:number;warning?:number} };
type HealthMetric = { key:string; labelTr:string; labelEn:string; value:number|null; detailTr:string; detailEn:string; module:string };

const clean=(value:unknown)=>String(value??"").trim();
const normalized=(value:unknown)=>clean(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
const num=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
const clamp=(value:number)=>Math.min(100,Math.max(0,Math.round(value)));
const isClosed=(value:unknown)=>["kapalı","kapatıldı","tamamlandı","closed","completed","approved","onaylandı","retired"].includes(normalized(value));
const isCompliant=(value:unknown)=>["uyumlu","compliant","implemented","uygulanıyor"].includes(normalized(value));
const isPartial=(value:unknown)=>["kısmi uyumlu","partially compliant","partial","kısmi"].includes(normalized(value));

function currentLanguage():Lang{
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase()==="en"?"en":"tr";
}
function normalizeRows(body:unknown):Row[]{
  if(!body||typeof body!=="object")return [];
  const source=Array.isArray((body as {rows?:unknown}).rows)?(body as {rows:RawRow[]}).rows:[];
  return source.map((raw,index)=>{
    let data:Record<string,unknown>={};
    if(raw.data&&typeof raw.data==="object"&&!Array.isArray(raw.data))data=raw.data as Record<string,unknown>;
    else if(typeof raw.data_json==="string")try{const parsed=JSON.parse(raw.data_json);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>}catch{}
    return {id:clean(raw.id)||`health-${index}`,module:clean(raw.module),data};
  }).filter(row=>row.module);
}
function complianceReadiness(rows:Row[]){
  const applicable=rows.filter(row=>!["uygulanamaz","not applicable","n/a"].includes(normalized(row.data.status)));
  if(!applicable.length)return null;
  const points=applicable.reduce((sum,row)=>sum+(isCompliant(row.data.status||row.data.implementation)?100:isPartial(row.data.status||row.data.implementation)?60:0),0);
  return clamp(points/applicable.length);
}
function evidenceExpired(row:Row){
  const state=normalized(row.data.status||row.data.reviewStatus),expiry=new Date(clean(row.data.expiresAt)).getTime();
  return ["süresi doldu","expired","reddedildi","rejected"].includes(state)||(Number.isFinite(expiry)&&expiry<Date.now());
}
function ownerOf(row:Row){return clean(row.data.owner||row.data.actionOwner||row.data.auditOwner||row.data.testOwner||row.data.technicalOwner||row.data.businessOwner||row.data.processOwner)}

const NAV:Record<string,string[]>={
  "Risk Assessment":["Risk Assessment","Risk Değerlendirmesi"],
  "Risk İştahı ve KRI":["Risk İştahı ve KRI","Risk Appetite & KRI"],
  Kanıtlar:["Kanıt Kütüphanesi","Evidence Library"],
  "Bulgular ve CAPA":["Bulgular ve CAPA","Findings & CAPA"],
  BIA:["İş Etki Analizi","Business Impact Analysis"],
  "Bağlantılı GRC":["Bağlantılı GRC Haritası","Connected GRC Map"],
};
function navigateTo(module:string){
  const labels=NAV[module]||[module],buttons=Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button, aside button"));
  const target=buttons.find(button=>labels.some(label=>normalized(button.textContent).includes(normalized(label))));
  if(target){target.click();return}document.querySelector<HTMLButtonElement>(".command-trigger")?.click();
}
function tone(value:number|null){return value===null?"neutral":value>=85?"healthy":value>=65?"watch":"critical"}
function Metric({metric,tr}:{metric:HealthMetric;tr:boolean}){
  return <button type="button" className={`edh-metric ${tone(metric.value)}`} onClick={()=>navigateTo(metric.module)}>
    <span><small>{tr?metric.labelTr:metric.labelEn}</small><b>{metric.value===null?"—":`${metric.value}%`}</b></span>
    <i aria-hidden="true"><em style={{width:`${metric.value??0}%`}}/></i>
    <p>{tr?metric.detailTr:metric.detailEn}</p>
  </button>;
}

export default function ExecutiveHealthLayer(){
  const [mount,setMount]=useState<HTMLElement|null>(null),[lang,setLang]=useState<Lang>("tr"),[rows,setRows]=useState<Row[]>([]),[findings,setFindings]=useState<FindingsPayload>({}),[appetite,setAppetite]=useState<AppetitePayload>({});

  useEffect(()=>{
    let created:HTMLDivElement|null=null;
    const discover=()=>{
      setLang(currentLanguage());
      const shell=document.querySelector<HTMLElement>(".ed4-shell");if(!shell)return;
      created=shell.querySelector<HTMLDivElement>(":scope > .edh-mount");
      if(!created){created=document.createElement("div");created.className="edh-mount";const grid=shell.querySelector(":scope > .ed4-grid");shell.insertBefore(created,grid||null)}
      setMount(created);
    };
    const first=window.setTimeout(discover,0),observer=new MutationObserver(discover);
    observer.observe(document.body,{childList:true,subtree:true});
    const languageClick=()=>setLang(currentLanguage());document.addEventListener("click",languageClick);
    return()=>{window.clearTimeout(first);observer.disconnect();document.removeEventListener("click",languageClick);created?.remove()};
  },[]);

  useEffect(()=>{
    if(!mount)return;
    let active=true;
    const load=async()=>{
      const [grcResult,findingsResult,appetiteResult]=await Promise.allSettled([
        fetch(withBasePath("/api/grc"),{cache:"no-store"}).then(async response=>response.ok?response.json():Promise.reject(new Error("grc"))),
        fetch(withBasePath("/api/findings"),{cache:"no-store"}).then(async response=>response.ok?response.json():{}),
        fetch(withBasePath("/api/risk-appetite"),{cache:"no-store"}).then(async response=>response.ok?response.json():{}),
      ]);
      if(!active)return;
      if(grcResult.status==="fulfilled")setRows(normalizeRows(grcResult.value));
      if(findingsResult.status==="fulfilled")setFindings(findingsResult.value as FindingsPayload);
      if(appetiteResult.status==="fulfilled")setAppetite(appetiteResult.value as AppetitePayload);
    };
    const first=window.setTimeout(()=>void load(),0),timer=window.setInterval(()=>void load(),300000);
    return()=>{active=false;window.clearTimeout(first);window.clearInterval(timer)};
  },[mount]);

  const health=useMemo(()=>{
    const by=(module:string)=>rows.filter(row=>row.module===module),risks=by("Risk Assessment"),controls=by("Kontroller"),compliance=by("Uyum"),evidence=by("Kanıtlar"),audits=by("Denetim Yönetimi"),bia=by("BIA"),vendors=by("Tedarikçiler"),assurance=buildExecutiveAssurance(rows),controlAssurance=buildControlAssurance(rows);
    const avgRisk=risks.length?risks.reduce((sum,row)=>sum+calculatedRiskScore(row.data),0)/risks.length:0,riskHealth=risks.length?clamp(100-(avgRisk/25)*100):null,controlHealth=controlAssurance.total?clamp(controlAssurance.score):null,complianceHealth=complianceReadiness(compliance),stale=evidence.filter(evidenceExpired).length,evidenceHealth=evidence.length?clamp(((evidence.length-stale)/evidence.length)*100):null,auditHealth=assurance.totalAudits?clamp(assurance.auditScore):null;
    const appetiteSummary=appetite.summary||{},appetiteTotal=num(appetiteSummary.total),breached=num(appetiteSummary.breached),warning=num(appetiteSummary.warning),appetiteHealth=appetiteTotal?clamp(((appetiteTotal-breached-warning*.5)/appetiteTotal)*100):null;
    const governed=[...risks,...controls,...audits,...bia,...vendors].filter(row=>!isClosed(row.data.status)),assigned=governed.filter(row=>ownerOf(row)).length,ownershipHealth=governed.length?clamp((assigned/governed.length)*100):null;
    const findingSummary=findings.summary||{},findingTotal=num(findingSummary.total),open=num(findingSummary.open),overdue=num(findingSummary.overdue),remediationHealth=open?clamp(((open-overdue)/open)*100):findingTotal?100:null;
    const completeBia=bia.filter(row=>clean(row.data.rto)&&clean(row.data.rpo)&&ownerOf(row)).length,biaHealth=bia.length?clamp((completeBia/bia.length)*100):null;
    const domains=[{value:riskHealth,weight:25},{value:controlHealth,weight:20},{value:complianceHealth,weight:15},{value:evidenceHealth,weight:15},{value:auditHealth,weight:10},{value:appetiteHealth,weight:10},{value:biaHealth,weight:5}].filter((item):item is {value:number;weight:number}=>item.value!==null),weight=domains.reduce((sum,item)=>sum+item.weight,0),overall=weight?clamp(domains.reduce((sum,item)=>sum+item.value*item.weight,0)/weight):null;
    const metrics:HealthMetric[]=[
      {key:"appetite",labelTr:"Risk İştahı Sağlığı",labelEn:"Risk Appetite Health",value:appetiteHealth,detailTr:appetiteTotal?`${appetiteTotal-breached}/${appetiteTotal} tolerans içinde · ${warning} uyarı`:"KRI / risk iştahı henüz tanımlı değil",detailEn:appetiteTotal?`${appetiteTotal-breached}/${appetiteTotal} within tolerance · ${warning} warning`:"KRI / risk appetite is not configured yet",module:"Risk İştahı ve KRI"},
      {key:"evidence",labelTr:"Kanıt Güncelliği",labelEn:"Evidence Freshness",value:evidenceHealth,detailTr:evidence.length?`${evidence.length-stale}/${evidence.length} güncel kanıt`:"Kanıt kaydı bulunmuyor",detailEn:evidence.length?`${evidence.length-stale}/${evidence.length} current evidence`:"No evidence records",module:"Kanıtlar"},
      {key:"ownership",labelTr:"Sahiplik Kapsamı",labelEn:"Ownership Coverage",value:ownershipHealth,detailTr:governed.length?`${assigned}/${governed.length} aktif kayıt atanmış`:"Aktif yönetişim kaydı bulunmuyor",detailEn:governed.length?`${assigned}/${governed.length} active records assigned`:"No active governed records",module:"Risk Assessment"},
      {key:"remediation",labelTr:"İyileştirme SLA",labelEn:"Remediation SLA",value:remediationHealth,detailTr:open?`${overdue} gecikmiş / ${open} açık bulgu`:findingTotal?"Açık veya gecikmiş bulgu yok":"Bulgu verisi henüz oluşmadı",detailEn:open?`${overdue} overdue / ${open} open findings`:findingTotal?"No open or overdue findings":"No finding data yet",module:"Bulgular ve CAPA"},
      {key:"bia",labelTr:"BIA Dayanıklılık Kapsamı",labelEn:"BIA Resilience Coverage",value:biaHealth,detailTr:bia.length?`${completeBia}/${bia.length} süreçte RTO + RPO + sahip tamam`:"BIA kaydı henüz bulunmuyor",detailEn:bia.length?`${completeBia}/${bia.length} processes have RTO + RPO + owner`:"No BIA records yet",module:"BIA"},
    ];
    return {overall,metrics,domainCount:domains.length};
  },[rows,findings,appetite]);

  if(!mount)return null;
  const tr=lang==="tr",state=health.overall===null?(tr?"VERİ BEKLENİYOR":"AWAITING DATA"):health.overall>=85?(tr?"GÜÇLÜ":"STRONG"):health.overall>=65?(tr?"İZLE":"WATCH"):(tr?"AKSİYON GEREKLİ":"ACTION REQUIRED");
  return createPortal(<section className="edh-layer" aria-label={tr?"Yönetici KRI ve KPI sağlık özeti":"Executive KRI and KPI health summary"}>
    <button type="button" className={`edh-overall ${tone(health.overall)}`} onClick={()=>navigateTo("Bağlantılı GRC")}>
      <span className="edh-score"><b>{health.overall===null?"—":health.overall}</b><small>/100</small></span>
      <span className="edh-overall-copy"><small>{tr?"GENEL GRC SAĞLIĞI":"OVERALL GRC HEALTH"}</small><strong>{state}</strong><em>{tr?`${health.domainCount} canlı yönetişim alanından ağırlıklı posture`:`Weighted posture across ${health.domainCount} live governance domains`}</em></span>
      <span className="edh-open">{tr?"Connected GRC":"Connected GRC"} →</span>
    </button>
    <div className="edh-metrics">{health.metrics.map(metric=><Metric key={metric.key} metric={metric} tr={tr}/>)}</div>
  </section>,mount);
}
