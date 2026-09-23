"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { buildControlAssurance } from "./control-assurance";
import { buildExecutiveAssurance } from "./executive-assurance";
import { calculatedRiskScore } from "./risk-methodology";

type Lang = "tr" | "en";
type Row = { id:string; code?:string; module:string; data:Record<string,unknown> };
type RawRow = { id?:unknown; code?:unknown; recordCode?:unknown; record_code?:unknown; module?:unknown; data?:unknown; data_json?:unknown };
type FindingsPayload = { summary?:{ total?:number; open?:number; critical?:number; overdue?:number } };
type AppetitePayload = { summary?:{ total?:number; breached?:number; warning?:number; openBreaches?:number; overdueBreaches?:number } };

type SummaryItem = {
  key:string;
  labelTr:string;
  labelEn:string;
  value:string;
  detailTr:string;
  detailEn:string;
  tone:"healthy"|"watch"|"critical"|"neutral";
  module:string;
};

const clean=(value:unknown)=>String(value??"").normalize("NFKC").trim();
const normalized=(value:unknown)=>clean(value).toLocaleLowerCase("tr-TR");
const num=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
const clamp=(value:number)=>Math.min(100,Math.max(0,Math.round(value)));
const dateValue=(value:unknown)=>{const time=new Date(clean(value)).getTime();return Number.isFinite(time)?time:Number.NaN};
const isClosed=(value:unknown)=>["kapalı","kapatıldı","tamamlandı","closed","completed","approved","onaylandı","retired"].includes(normalized(value));
const isCompliant=(value:unknown)=>["uyumlu","compliant","implemented","uygulanıyor"].includes(normalized(value));
const isPartial=(value:unknown)=>["kısmi uyumlu","partially compliant","partial","kısmi"].includes(normalized(value));
const ownerOf=(row:Row)=>clean(row.data.owner||row.data.riskOwner||row.data.actionOwner||row.data.auditOwner||row.data.testOwner||row.data.technicalOwner||row.data.businessOwner||row.data.processOwner);

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
    return {id:clean(raw.id)||`v6-${index}`,code:clean(raw.code||raw.recordCode||raw.record_code)||undefined,module:clean(raw.module),data};
  }).filter(row=>row.module);
}
function complianceReadiness(rows:Row[]){
  const applicable=rows.filter(row=>!["uygulanamaz","not applicable","n/a"].includes(normalized(row.data.status)));
  if(!applicable.length)return null;
  const points=applicable.reduce((sum,row)=>sum+(isCompliant(row.data.status||row.data.implementation)?100:isPartial(row.data.status||row.data.implementation)?60:0),0);
  return clamp(points/applicable.length);
}
function evidenceExpired(row:Row,now:number){
  const state=normalized(row.data.status||row.data.reviewStatus),expiry=dateValue(row.data.expiresAt);
  return ["süresi doldu","expired","reddedildi","rejected"].includes(state)||(Number.isFinite(expiry)&&expiry<now);
}
function navigateTo(module:string){
  const aliases:Record<string,string[]>={
    "Risk Assessment":["Risk Assessment","Risk Değerlendirmesi"],
    "Risk İştahı ve KRI":["Risk İştahı ve KRI","Risk Appetite & KRI"],
    "Denetim Yönetimi":["Denetim Yönetimi","Audit Management"],
    "Bağlantılı GRC":["Bağlantılı GRC Haritası","Connected GRC Map"],
  };
  const labels=aliases[module]||[module],buttons=Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button, aside button"));
  const target=buttons.find(button=>labels.some(label=>normalized(button.textContent).includes(normalized(label))));
  if(target){target.click();return}
  document.querySelector<HTMLButtonElement>(".command-trigger")?.click();
}

export default function DashboardV6Summary(){
  const [mount,setMount]=useState<HTMLElement|null>(null),[lang,setLang]=useState<Lang>("tr"),[rows,setRows]=useState<Row[]>([]),[findings,setFindings]=useState<FindingsPayload>({}),[appetite,setAppetite]=useState<AppetitePayload>({});

  useEffect(()=>{
    let created:HTMLDivElement|null=null;
    const discover=()=>{
      setLang(currentLanguage());
      const shell=document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v4 .ed4-shell");
      if(!shell)return;
      created=shell.querySelector<HTMLDivElement>(":scope > .ed6-summary-mount");
      if(!created){
        created=document.createElement("div");
        created.className="ed6-summary-mount";
        const grid=shell.querySelector(":scope > .ed4-grid");
        shell.insertBefore(created,grid||null);
      }
      setMount(created);
    };
    discover();
    const observer=new MutationObserver(discover);
    observer.observe(document.body,{childList:true,subtree:true});
    const onClick=()=>setLang(currentLanguage());
    document.addEventListener("click",onClick);
    return()=>{observer.disconnect();document.removeEventListener("click",onClick);created?.remove()};
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
    void load();
    const timer=window.setInterval(()=>void load(),300000);
    return()=>{active=false;window.clearInterval(timer)};
  },[mount]);

  const summary=useMemo(()=>{
    const now=Date.now(),by=(module:string)=>rows.filter(row=>row.module===module),risks=by("Risk Assessment"),controls=by("Kontroller"),compliance=by("Uyum"),evidence=by("Kanıtlar"),audits=by("Denetim Yönetimi"),bia=by("BIA"),controlAssurance=buildControlAssurance(rows),assurance=buildExecutiveAssurance(rows);
    const avgRisk=risks.length?risks.reduce((sum,row)=>sum+calculatedRiskScore(row.data),0)/risks.length:0,riskHealth=risks.length?clamp(100-(avgRisk/25)*100):null,controlHealth=controlAssurance.total?clamp(controlAssurance.score):null,complianceHealth=complianceReadiness(compliance),stale=evidence.filter(row=>evidenceExpired(row,now)).length,evidenceHealth=evidence.length?clamp(((evidence.length-stale)/evidence.length)*100):null,auditHealth=assurance.totalAudits?clamp(assurance.auditScore):null;
    const appetiteSummary=appetite.summary||{},appetiteTotal=num(appetiteSummary.total),breached=num(appetiteSummary.breached),openBreaches=num(appetiteSummary.openBreaches),warning=num(appetiteSummary.warning),overdueBreaches=num(appetiteSummary.overdueBreaches),kriBreaches=Math.max(breached,openBreaches),appetiteHealth=appetiteTotal?clamp(((appetiteTotal-breached-warning*.5)/appetiteTotal)*100):null;
    const completeBia=bia.filter(row=>clean(row.data.rto)&&clean(row.data.rpo)&&ownerOf(row)).length,biaHealth=bia.length?clamp((completeBia/bia.length)*100):null;
    const domains=[{value:riskHealth,weight:25},{value:controlHealth,weight:20},{value:complianceHealth,weight:15},{value:evidenceHealth,weight:15},{value:auditHealth,weight:10},{value:appetiteHealth,weight:10},{value:biaHealth,weight:5}].filter((item):item is {value:number;weight:number}=>item.value!==null),weight=domains.reduce((sum,item)=>sum+item.weight,0),overall=weight?clamp(domains.reduce((sum,item)=>sum+item.value*item.weight,0)/weight):null;
    const findingSummary=findings.summary||{},criticalFindings=num(findingSummary.critical),overdueFindings=num(findingSummary.overdue),criticalRisks=risks.filter(row=>calculatedRiskScore(row.data)>=17).length,auditOverdue=audits.filter(row=>{const due=dateValue(row.data.dueDate);return Number.isFinite(due)&&due<now&&!isClosed(row.data.status)}).length,decisions=criticalRisks+criticalFindings+kriBreaches,overdue=auditOverdue+overdueFindings+overdueBreaches;
    return {overall,domains:domains.length,decisions,overdue,kriBreaches,kriAvailable:appetiteTotal>0||kriBreaches>0};
  },[rows,findings,appetite]);

  if(!mount)return null;
  const tr=lang==="tr",postureState=summary.overall===null?(tr?"VERİ BEKLENİYOR":"AWAITING DATA"):summary.overall>=85?(tr?"GÜÇLÜ":"STRONG"):summary.overall>=65?(tr?"İZLE":"WATCH"):(tr?"AKSİYON GEREKLİ":"ACTION REQUIRED");
  const postureTone:SummaryItem["tone"]=summary.overall===null?"neutral":summary.overall>=85?"healthy":summary.overall>=65?"watch":"critical";
  const items:SummaryItem[]=[
    {key:"decisions",labelTr:"Karar Gerektiren",labelEn:"Decisions Needed",value:String(summary.decisions),detailTr:"Kritik risk + bulgu + KRI ihlali",detailEn:"Critical risk + finding + KRI breach",tone:summary.decisions?"critical":"healthy",module:"Risk Assessment"},
    {key:"overdue",labelTr:"Gecikmiş İş",labelEn:"Overdue Items",value:String(summary.overdue),detailTr:"Denetim + CAPA + KRI SLA",detailEn:"Audit + CAPA + KRI SLA",tone:summary.overdue?"watch":"healthy",module:"Denetim Yönetimi"},
    {key:"kri",labelTr:"KRI İhlali",labelEn:"KRI Breaches",value:summary.kriAvailable?String(summary.kriBreaches):"—",detailTr:summary.kriAvailable?"Risk iştahı eşiği dışında":"Risk iştahı / KRI henüz tanımlı değil",detailEn:summary.kriAvailable?"Outside risk appetite threshold":"Risk appetite / KRI is not configured",tone:summary.kriAvailable?(summary.kriBreaches?"critical":"healthy"):"neutral",module:"Risk İştahı ve KRI"},
  ];

  return createPortal(<section className="ed6-summary" aria-label={tr?"Yönetici GRC posture özeti":"Executive GRC posture summary"}>
    <button type="button" className={`ed6-posture ${postureTone}`} onClick={()=>navigateTo("Bağlantılı GRC")}>
      <span className="ed6-posture-score"><b>{summary.overall===null?"—":summary.overall}</b><small>/100</small></span>
      <span><small>{tr?"KURUMSAL GRC POSTURE":"ENTERPRISE GRC POSTURE"}</small><strong>{postureState}</strong><em>{tr?`${summary.domains} canlı yönetişim alanından birleşik skor`:`Composite score across ${summary.domains} live governance domains`}</em></span>
      <i>→</i>
    </button>
    {items.map(item=><button type="button" key={item.key} className={`ed6-summary-item ${item.tone}`} onClick={()=>navigateTo(item.module)}><span><small>{tr?item.labelTr:item.labelEn}</small><strong>{item.value}</strong></span><p>{tr?item.detailTr:item.detailEn}</p><i aria-hidden="true"/></button>)}
  </section>,mount);
}
