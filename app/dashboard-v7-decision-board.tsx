"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { calculatedRiskScore } from "./risk-methodology";

type Lang="tr"|"en";
type Row={id:string;code?:string;module:string;data:Record<string,unknown>};
type RawRow={id?:unknown;code?:unknown;recordCode?:unknown;record_code?:unknown;module?:unknown;data?:unknown;data_json?:unknown};
type Finding={id?:string;code?:string;title?:string;severity?:string;owner?:string;dueDate?:string;status?:string;attention?:string};
type FindingsPayload={findings?:Finding[];summary?:{open?:number;critical?:number;overdue?:number}};
type AppetitePayload={summary?:{total?:number;breached?:number;openBreaches?:number;overdueBreaches?:number}};
type Tone="critical"|"high"|"watch"|"healthy"|"neutral";
type Decision={key:string;kindTr:string;kindEn:string;title:string;owner:string;urgencyTr:string;urgencyEn:string;due:string;tone:Tone;module:string;score?:number};

const clean=(value:unknown)=>String(value??"").normalize("NFKC").trim();
const normalized=(value:unknown)=>clean(value).toLocaleLowerCase("tr-TR");
const num=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
const dateValue=(value:unknown)=>{const time=new Date(clean(value)).getTime();return Number.isFinite(time)?time:Number.NaN};
const isClosed=(value:unknown)=>["kapalı","kapatıldı","tamamlandı","closed","completed","approved","onaylandı","retired","resolved"].includes(normalized(value));
const ownerOf=(row:Row)=>clean(row.data.owner||row.data.riskOwner||row.data.actionOwner||row.data.auditOwner||row.data.controlOwner||row.data.businessOwner||row.data.processOwner||row.data.technicalOwner);
const titleOf=(row:Row)=>clean(row.data.riskTitle||row.data.title||row.data.name||row.data.riskName||row.data.requirement||row.data.controlName||row.data.description||row.code||row.id);
function currentLanguage():Lang{return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase()==="en"?"en":"tr"}
function normalizeRows(body:unknown):Row[]{
  if(!body||typeof body!=="object")return [];
  const source=Array.isArray((body as {rows?:unknown}).rows)?(body as {rows:RawRow[]}).rows:[];
  return source.map((raw,index)=>{
    let data:Record<string,unknown>={};
    if(raw.data&&typeof raw.data==="object"&&!Array.isArray(raw.data))data=raw.data as Record<string,unknown>;
    else if(typeof raw.data_json==="string")try{const parsed=JSON.parse(raw.data_json);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>}catch{}
    return {id:clean(raw.id)||`decision-${index}`,code:clean(raw.code||raw.recordCode||raw.record_code)||undefined,module:clean(raw.module),data};
  }).filter(row=>row.module);
}
function formatDate(value:string,lang:Lang){if(!value)return "—";const time=dateValue(value);if(!Number.isFinite(time))return value;return new Intl.DateTimeFormat(lang==="tr"?"tr-TR":"en-GB",{day:"2-digit",month:"short"}).format(new Date(time))}
function riskTone(score:number):Tone{return score>=17?"critical":score>=10?"high":score>=5?"watch":"healthy"}
function navigateTo(module:string){
  const aliases:Record<string,string[]>={
    "Risk Assessment":["Risk Assessment","Risk Değerlendirmesi"],
    "Denetim Yönetimi":["Denetim Yönetimi","Audit Management"],
    "Kanıtlar":["Kanıt Kütüphanesi","Evidence Library"],
    "Bulgular ve CAPA":["Bulgular ve CAPA","Findings & CAPA"],
    "Risk İştahı ve KRI":["Risk İştahı ve KRI","Risk Appetite & KRI"],
  };
  const labels=aliases[module]||[module];
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button, aside button"));
  const target=buttons.find(button=>labels.some(label=>normalized(button.textContent).includes(normalized(label))));
  if(target){target.click();return}
  document.querySelector<HTMLButtonElement>(".command-trigger")?.click();
}

export default function DashboardV7DecisionBoard(){
  const [mount,setMount]=useState<HTMLElement|null>(null),[lang,setLang]=useState<Lang>("tr"),[rows,setRows]=useState<Row[]>([]),[findings,setFindings]=useState<FindingsPayload>({}),[appetite,setAppetite]=useState<AppetitePayload>({}),[asOf,setAsOf]=useState(0);

  useEffect(()=>{
    let created:HTMLDivElement|null=null;
    const discover=()=>{
      setLang(currentLanguage());
      const grid=document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v4 .ed4-grid");
      if(!grid)return;
      created=grid.querySelector<HTMLDivElement>(":scope > .ed7-decisions-mount");
      if(!created){created=document.createElement("div");created.className="ed7-decisions-mount";grid.prepend(created)}
      setMount(created);
    };
    discover();
    const observer=new MutationObserver(discover);observer.observe(document.body,{childList:true,subtree:true});
    const onClick=()=>setLang(currentLanguage());document.addEventListener("click",onClick);
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
      setAsOf(Date.now());
    };
    void load();const timer=window.setInterval(()=>void load(),300000);
    return()=>{active=false;window.clearInterval(timer)};
  },[mount]);

  const decisions=useMemo<Decision[]>(()=>{
    const now=asOf||1,week=7*86400000,items:Decision[]=[];
    rows.filter(row=>row.module==="Risk Assessment"&&!isClosed(row.data.status)).forEach(row=>{
      const score=calculatedRiskScore(row.data);if(score<10)return;
      const due=clean(row.data.nextReviewDate||row.data.reviewDate||row.data.dueDate||row.data.targetDate),dueTime=dateValue(due),dueSoon=Number.isFinite(dueTime)&&dueTime>=now&&dueTime<=now+week;
      items.push({key:`risk-${row.id}`,kindTr:"Risk",kindEn:"Risk",title:titleOf(row),owner:ownerOf(row),urgencyTr:score>=17?"Kritik maruziyet":dueSoon?"7 gün içinde gözden geçirme":"Yüksek maruziyet",urgencyEn:score>=17?"Critical exposure":dueSoon?"Review due in 7 days":"High exposure",due,tone:riskTone(score),module:"Risk Assessment",score});
    });
    rows.filter(row=>row.module==="Denetim Yönetimi"&&!isClosed(row.data.status)).forEach(row=>{
      const due=clean(row.data.dueDate||row.data.targetDate||row.data.auditDate),dueTime=dateValue(due),overdue=Number.isFinite(dueTime)&&dueTime<now,dueSoon=Number.isFinite(dueTime)&&dueTime>=now&&dueTime<=now+week;if(!overdue&&!dueSoon)return;
      items.push({key:`audit-${row.id}`,kindTr:"Denetim",kindEn:"Audit",title:titleOf(row),owner:ownerOf(row),urgencyTr:overdue?"Gecikmiş denetim işi":"7 gün içinde termin",urgencyEn:overdue?"Overdue audit item":"Due in 7 days",due,tone:overdue?"critical":"watch",module:"Denetim Yönetimi"});
    });
    rows.filter(row=>row.module==="Kanıtlar").forEach(row=>{
      const expiry=clean(row.data.expiresAt),expiryTime=dateValue(expiry),state=normalized(row.data.status||row.data.reviewStatus),stale=["süresi doldu","expired","reddedildi","rejected"].includes(state)||(Number.isFinite(expiryTime)&&expiryTime<now);if(!stale)return;
      items.push({key:`evidence-${row.id}`,kindTr:"Kanıt",kindEn:"Evidence",title:titleOf(row),owner:ownerOf(row),urgencyTr:"Güncelliğini yitirmiş kanıt",urgencyEn:"Stale evidence",due:expiry,tone:"watch",module:"Kanıtlar"});
    });
    (findings.findings||[]).filter(item=>!isClosed(item.status)).forEach((item,index)=>{
      const severity=normalized(item.severity),due=clean(item.dueDate),dueTime=dateValue(due),overdue=Number.isFinite(dueTime)&&dueTime<now,critical=["critical","kritik"].includes(severity);if(!critical&&!overdue)return;
      items.push({key:`finding-${clean(item.id)||index}`,kindTr:"Bulgu",kindEn:"Finding",title:clean(item.title||item.code||"Finding"),owner:clean(item.owner),urgencyTr:critical?"Kritik bulgu":"Gecikmiş iyileştirme",urgencyEn:critical?"Critical finding":"Overdue remediation",due,tone:critical?"critical":"watch",module:"Bulgular ve CAPA"});
    });
    const appetiteSummary=appetite.summary||{},kriBreaches=Math.max(num(appetiteSummary.breached),num(appetiteSummary.openBreaches));
    if(kriBreaches>0)items.push({key:"kri-breaches",kindTr:"KRI",kindEn:"KRI",title:`${kriBreaches} ${lang==="tr"?"aktif risk iştahı ihlali":"active risk appetite breaches"}`,owner:"—",urgencyTr:"Yönetim kararı gerekli",urgencyEn:"Management decision required",due:"",tone:"critical",module:"Risk İştahı ve KRI"});
    const rank=(tone:Tone)=>tone==="critical"?0:tone==="high"?1:tone==="watch"?2:tone==="healthy"?3:4;
    return items.sort((a,b)=>rank(a.tone)-rank(b.tone)||(b.score||0)-(a.score||0)||dateValue(a.due)-dateValue(b.due)).slice(0,6);
  },[rows,findings,appetite,asOf,lang]);

  if(!mount)return null;
  const tr=lang==="tr",critical=decisions.filter(item=>item.tone==="critical").length,overdue=decisions.filter(item=>item.urgencyTr.includes("Gecikmiş")).length,unassigned=decisions.filter(item=>!item.owner||item.owner==="—").length;
  return createPortal(<section className="ed7-decision-board" aria-label={tr?"Yönetim karar masası":"Executive decision board"}>
    <header className="ed7-decision-head">
      <div><small>{tr?"YÖNETİM KARAR MASASI":"EXECUTIVE DECISION BOARD"}</small><h3>{tr?"Şimdi neye odaklanmalı?":"What needs attention now?"}</h3><p>{tr?"En kritik risk, denetim, kanıt ve iyileştirme kararları tek listede.":"Highest-priority risk, audit, evidence and remediation decisions in one queue."}</p></div>
      <div className="ed7-decision-stats"><span><b>{decisions.length}</b><small>{tr?"öncelik":"priorities"}</small></span><span><b>{critical}</b><small>{tr?"kritik":"critical"}</small></span><span><b>{overdue}</b><small>{tr?"gecikmiş":"overdue"}</small></span><span><b>{unassigned}</b><small>{tr?"sahipsiz":"unassigned"}</small></span></div>
    </header>
    <div className="ed7-decision-table">
      <div className="ed7-decision-row ed7-decision-labels"><span>{tr?"Tür":"Type"}</span><span>{tr?"Kayıt / Karar":"Record / Decision"}</span><span>{tr?"Sahip":"Owner"}</span><span>{tr?"Öncelik":"Priority"}</span><span>{tr?"Termin":"Due"}</span></div>
      {decisions.length?decisions.map(item=><button type="button" key={item.key} className={`ed7-decision-row ${item.tone}`} onClick={()=>navigateTo(item.module)}><span><i/>{tr?item.kindTr:item.kindEn}</span><span><b>{item.title}</b><small>{tr?item.urgencyTr:item.urgencyEn}</small></span><span>{item.owner||"—"}</span><span>{item.score?<strong>{item.score}</strong>:<strong className="ed7-arrow">→</strong>}</span><span>{formatDate(item.due,lang)}</span></button>):<div className="ed7-decision-empty">{tr?"Yönetim kararı gerektiren açık kayıt bulunmuyor.":"No open records currently require management attention."}</div>}
    </div>
  </section>,mount);
}
