"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { buildControlAssurance } from "./control-assurance";
import { calculatedRiskScore } from "./risk-methodology";

type Lang="tr"|"en";
type Row={id:string;code?:string;module:string;data:Record<string,unknown>};
type RawRow={id?:unknown;code?:unknown;recordCode?:unknown;record_code?:unknown;module?:unknown;data?:unknown;data_json?:unknown};
type FindingsPayload={summary?:{total?:number;open?:number;overdue?:number}};
type AppetitePayload={summary?:{total?:number;breached?:number;warning?:number;openBreaches?:number}};
type Tone="healthy"|"watch"|"critical"|"neutral";
type WatchItem={key:string;labelTr:string;labelEn:string;value:string;detailTr:string;detailEn:string;tone:Tone;module:string};

type TopRisk={id:string;code:string;title:string;owner:string;score:number;status:string;due:string;tone:"critical"|"high"|"medium"|"low"};

const clean=(value:unknown)=>String(value??"").normalize("NFKC").trim();
const normalized=(value:unknown)=>clean(value).toLocaleLowerCase("tr-TR");
const num=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
const clamp=(value:number)=>Math.min(100,Math.max(0,Math.round(value)));
const dateValue=(value:unknown)=>{const time=new Date(clean(value)).getTime();return Number.isFinite(time)?time:Number.NaN};
const isClosed=(value:unknown)=>["kapalı","kapatıldı","tamamlandı","closed","completed","approved","onaylandı","retired"].includes(normalized(value));
const ownerOf=(row:Row)=>clean(row.data.owner||row.data.riskOwner||row.data.actionOwner||row.data.auditOwner||row.data.testOwner||row.data.technicalOwner||row.data.businessOwner||row.data.processOwner);

function currentLanguage():Lang{return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase()==="en"?"en":"tr"}
function normalizeRows(body:unknown):Row[]{
  if(!body||typeof body!=="object")return [];
  const source=Array.isArray((body as {rows?:unknown}).rows)?(body as {rows:RawRow[]}).rows:[];
  return source.map((raw,index)=>{
    let data:Record<string,unknown>={};
    if(raw.data&&typeof raw.data==="object"&&!Array.isArray(raw.data))data=raw.data as Record<string,unknown>;
    else if(typeof raw.data_json==="string")try{const parsed=JSON.parse(raw.data_json);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>}catch{}
    return {id:clean(raw.id)||`insight-${index}`,code:clean(raw.code||raw.recordCode||raw.record_code)||undefined,module:clean(raw.module),data};
  }).filter(row=>row.module);
}
function evidenceExpired(row:Row,now:number){const state=normalized(row.data.status||row.data.reviewStatus),expiry=dateValue(row.data.expiresAt);return ["süresi doldu","expired","reddedildi","rejected"].includes(state)||(Number.isFinite(expiry)&&expiry<now)}
function scoreTone(score:number):TopRisk["tone"]{return score>=17?"critical":score>=10?"high":score>=5?"medium":"low"}
function percentageTone(value:number|null):Tone{return value===null?"neutral":value>=85?"healthy":value>=65?"watch":"critical"}
function formatDate(value:string,lang:Lang){if(!value)return "—";const time=dateValue(value);if(!Number.isFinite(time))return value;return new Intl.DateTimeFormat(lang==="tr"?"tr-TR":"en-GB",{day:"2-digit",month:"short",year:"2-digit"}).format(new Date(time))}
function navigateTo(module:string){
  const aliases:Record<string,string[]>={
    "Risk Assessment":["Risk Assessment","Risk Değerlendirmesi"],
    "Risk İştahı ve KRI":["Risk İştahı ve KRI","Risk Appetite & KRI"],
    "Kontroller":["Kontrol Kütüphanesi","Control Library"],
    "Kanıtlar":["Kanıt Kütüphanesi","Evidence Library"],
    "Bulgular ve CAPA":["Bulgular ve CAPA","Findings & CAPA"],
    BIA:["İş Etki Analizi","Business Impact Analysis"],
  };
  const labels=aliases[module]||[module],buttons=Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button, aside button"));
  const target=buttons.find(button=>labels.some(label=>normalized(button.textContent).includes(normalized(label))));
  if(target){target.click();return}
  document.querySelector<HTMLButtonElement>(".command-trigger")?.click();
}

export default function DashboardV6Insights(){
  const [riskMount,setRiskMount]=useState<HTMLElement|null>(null),[watchMount,setWatchMount]=useState<HTMLElement|null>(null),[lang,setLang]=useState<Lang>("tr"),[rows,setRows]=useState<Row[]>([]),[findings,setFindings]=useState<FindingsPayload>({}),[appetite,setAppetite]=useState<AppetitePayload>({});

  useEffect(()=>{
    let createdRisk:HTMLDivElement|null=null,createdWatch:HTMLDivElement|null=null;
    const discover=()=>{
      setLang(currentLanguage());
      const shell=document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v4 .ed4-shell");
      if(!shell)return;
      const riskPanel=shell.querySelector<HTMLElement>(".ed4-risk-map"),grid=shell.querySelector<HTMLElement>(".ed4-grid");
      if(riskPanel){
        createdRisk=riskPanel.querySelector<HTMLDivElement>(":scope > .ed6-top-risks-mount");
        if(!createdRisk){createdRisk=document.createElement("div");createdRisk.className="ed6-top-risks-mount";riskPanel.appendChild(createdRisk)}
        setRiskMount(createdRisk);
      }else setRiskMount(null);
      if(grid){
        createdWatch=grid.querySelector<HTMLDivElement>(":scope > .ed6-watch-mount");
        if(!createdWatch){createdWatch=document.createElement("div");createdWatch.className="ed6-watch-mount";const changes=grid.querySelector(":scope > .ed4-changes");grid.insertBefore(createdWatch,changes||null)}
        setWatchMount(createdWatch);
      }
    };
    discover();
    const observer=new MutationObserver(discover);observer.observe(document.body,{childList:true,subtree:true});
    const languageClick=()=>setLang(currentLanguage());document.addEventListener("click",languageClick);
    return()=>{observer.disconnect();document.removeEventListener("click",languageClick);createdRisk?.remove();createdWatch?.remove()};
  },[]);

  useEffect(()=>{
    if(!riskMount&&!watchMount)return;
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
    void load();const timer=window.setInterval(()=>void load(),300000);
    return()=>{active=false;window.clearInterval(timer)};
  },[riskMount,watchMount]);

  const topRisks=useMemo<TopRisk[]>(()=>rows.filter(row=>row.module==="Risk Assessment"&&!isClosed(row.data.status)).map(row=>{
    const score=calculatedRiskScore(row.data),title=clean(row.data.riskTitle||row.data.title||row.data.riskName||row.data.name||row.data.description||row.code||row.id),owner=ownerOf(row),due=clean(row.data.nextReviewDate||row.data.reviewDate||row.data.dueDate||row.data.targetDate),status=clean(row.data.status||row.data.treatmentStatus);
    return {id:row.id,code:clean(row.code||row.data.riskCode||row.id),title,owner,score,status,due,tone:scoreTone(score)};
  }).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,"tr")).slice(0,5),[rows]);

  const watch=useMemo<WatchItem[]>(()=>{
    const now=Date.now(),by=(module:string)=>rows.filter(row=>row.module===module),controls=by("Kontroller"),evidence=by("Kanıtlar"),bia=by("BIA"),risks=by("Risk Assessment"),audits=by("Denetim Yönetimi"),controlAssurance=buildControlAssurance(rows),stale=evidence.filter(row=>evidenceExpired(row,now)).length,evidenceFreshness=evidence.length?clamp(((evidence.length-stale)/evidence.length)*100):null;
    const findingSummary=findings.summary||{},findingTotal=num(findingSummary.total),open=num(findingSummary.open),overdue=num(findingSummary.overdue),remediation=open?clamp(((open-overdue)/open)*100):findingTotal?100:null;
    const appetiteSummary=appetite.summary||{},appetiteTotal=num(appetiteSummary.total),kriBreaches=Math.max(num(appetiteSummary.breached),num(appetiteSummary.openBreaches)),kriAvailable=appetiteTotal>0||kriBreaches>0;
    const completeBia=bia.filter(row=>clean(row.data.rto)&&clean(row.data.rpo)&&ownerOf(row)).length,biaCoverage=bia.length?clamp((completeBia/bia.length)*100):null;
    const governed=[...risks,...controls,...audits,...bia].filter(row=>!isClosed(row.data.status)),assigned=governed.filter(row=>ownerOf(row)).length,ownership=governed.length?clamp((assigned/governed.length)*100):null;
    const controlValue=controlAssurance.total?clamp(controlAssurance.score):null;
    return [
      {key:"kri",labelTr:"KRI / İştah İhlali",labelEn:"KRI / Appetite Breach",value:kriAvailable?String(kriBreaches):"—",detailTr:kriAvailable?`${appetiteTotal} aktif risk iştahı / KRI göstergesi`:"Risk iştahı / KRI tanımlı değil",detailEn:kriAvailable?`${appetiteTotal} active appetite / KRI indicators`:"Risk appetite / KRI is not configured",tone:kriAvailable?(kriBreaches?"critical":"healthy"):"neutral",module:"Risk İştahı ve KRI"},
      {key:"control",labelTr:"Kontrol Güvencesi",labelEn:"Control Assurance",value:controlValue===null?"—":`${controlValue}%`,detailTr:controlAssurance.total?`${controlAssurance.healthy}/${controlAssurance.total} tam sağlıklı kontrol`:"Kontrol verisi bulunmuyor",detailEn:controlAssurance.total?`${controlAssurance.healthy}/${controlAssurance.total} fully healthy controls`:"No control data",tone:percentageTone(controlValue),module:"Kontroller"},
      {key:"evidence",labelTr:"Kanıt Güncelliği",labelEn:"Evidence Freshness",value:evidenceFreshness===null?"—":`${evidenceFreshness}%`,detailTr:evidence.length?`${stale} güncel olmayan / ${evidence.length} toplam kanıt`:"Kanıt verisi bulunmuyor",detailEn:evidence.length?`${stale} stale / ${evidence.length} total evidence`:"No evidence data",tone:percentageTone(evidenceFreshness),module:"Kanıtlar"},
      {key:"remediation",labelTr:"İyileştirme SLA",labelEn:"Remediation SLA",value:remediation===null?"—":`${remediation}%`,detailTr:open?`${overdue} gecikmiş / ${open} açık bulgu`:findingTotal?"Açık bulgu yok":"Bulgu verisi bulunmuyor",detailEn:open?`${overdue} overdue / ${open} open findings`:findingTotal?"No open findings":"No finding data",tone:percentageTone(remediation),module:"Bulgular ve CAPA"},
      {key:"bia",labelTr:"BIA Dayanıklılık",labelEn:"BIA Resilience",value:biaCoverage===null?"—":`${biaCoverage}%`,detailTr:bia.length?`${completeBia}/${bia.length} süreçte RTO + RPO + sahip tamam`:"BIA verisi bulunmuyor",detailEn:bia.length?`${completeBia}/${bia.length} processes have RTO + RPO + owner`:"No BIA data",tone:percentageTone(biaCoverage),module:"BIA"},
      {key:"ownership",labelTr:"Sahiplik Kapsamı",labelEn:"Ownership Coverage",value:ownership===null?"—":`${ownership}%`,detailTr:governed.length?`${assigned}/${governed.length} aktif kayıt atanmış`:"Aktif yönetişim kaydı bulunmuyor",detailEn:governed.length?`${assigned}/${governed.length} active records assigned`:"No active governed records",tone:percentageTone(ownership),module:"Risk Assessment"},
    ];
  },[rows,findings,appetite]);

  const tr=lang==="tr";
  const riskPortal=riskMount?createPortal(<section className="ed6-top-risks" aria-label={tr?"Öncelikli riskler":"Priority risks"}>
    <header><div><small>{tr?"ÖNCELİKLİ RİSKLER":"PRIORITY RISKS"}</small><strong>{tr?"En yüksek maruziyet":"Highest exposure"}</strong></div><button type="button" onClick={()=>navigateTo("Risk Assessment")}>{tr?"Tüm riskler":"All risks"} →</button></header>
    {topRisks.length?<div className="ed6-risk-table"><div className="ed6-risk-head"><span>{tr?"Risk":"Risk"}</span><span>{tr?"Sahip":"Owner"}</span><span>{tr?"Skor":"Score"}</span><span>{tr?"Durum / Gözden geçirme":"Status / Review"}</span></div>{topRisks.map(item=><button type="button" key={item.id} onClick={()=>navigateTo("Risk Assessment")}><span><b>{item.title}</b><small>{item.code}</small></span><span>{item.owner||"—"}</span><span><i className={item.tone}>{item.score}</i></span><span><b>{item.status||"—"}</b><small>{formatDate(item.due,lang)}</small></span></button>)}</div>:<p className="ed6-empty">{tr?"Aktif risk kaydı bulunmuyor.":"No active risk records."}</p>}
  </section>,riskMount):null;

  const watchPortal=watchMount?createPortal(<article className="ed4-panel ed6-watch"><header className="ed4-panel-head"><div><small>{tr?"KPI / KRI İZLEME":"KPI / KRI WATCHLIST"}</small><h3>{tr?"Yönetim eşikleri":"Management thresholds"}</h3></div><button type="button" onClick={()=>navigateTo("Risk İştahı ve KRI")}>{tr?"KRI merkezi":"KRI center"}<span>→</span></button></header><div className="ed6-watch-list">{watch.map(item=><button type="button" key={item.key} onClick={()=>navigateTo(item.module)}><i className={item.tone}/><span><b>{tr?item.labelTr:item.labelEn}</b><small>{tr?item.detailTr:item.detailEn}</small></span><strong className={item.tone}>{item.value}</strong><em>→</em></button>)}</div></article>,watchMount):null;

  return <>{riskPortal}{watchPortal}</>;
}
