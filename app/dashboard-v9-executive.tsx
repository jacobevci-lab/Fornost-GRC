"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { buildControlAssurance } from "./control-assurance";
import { buildExecutiveAssurance } from "./executive-assurance";
import { calculatedRiskScore } from "./risk-methodology";

type Lang = "tr" | "en";
type Tone = "healthy" | "watch" | "critical" | "neutral";
type Row = { id:string; code?:string; module:string; data:Record<string,unknown> };
type RawRow = { id?:unknown; code?:unknown; recordCode?:unknown; record_code?:unknown; module?:unknown; data?:unknown; data_json?:unknown };
type FindingsPayload = { summary?:{ total?:number; open?:number; critical?:number; overdue?:number } };
type AppetitePayload = { summary?:{ total?:number; breached?:number; warning?:number; openBreaches?:number; overdueBreaches?:number; measurementDue?:number } };
type Metric = { key:string; labelTr:string; labelEn:string; value:string; detailTr:string; detailEn:string; targetTr:string; targetEn:string; tone:Tone; module:string };
type OutlookItem = { key:string; count?:number; value?:string; labelTr:string; labelEn:string; detailTr:string; detailEn:string; tone:Tone; module:string };
type KpiRow = { key:string; labelTr:string; labelEn:string; currentTr:string; currentEn:string; target:string; tone:Tone; statusTr:string; statusEn:string; module:string; configured:boolean };

const DAY=86400000;
const clean=(value:unknown)=>String(value??"").normalize("NFKC").trim();
const normalized=(value:unknown)=>clean(value).toLocaleLowerCase("tr-TR");
const num=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0};
const clamp=(value:number)=>Math.min(100,Math.max(0,Math.round(value)));
const dateValue=(value:unknown)=>{const time=new Date(clean(value)).getTime();return Number.isFinite(time)?time:Number.NaN};
const isClosed=(value:unknown)=>["kapalı","kapatıldı","tamamlandı","closed","completed","approved","onaylandı","retired","resolved"].includes(normalized(value));
const isCompliant=(value:unknown)=>["uyumlu","compliant","implemented","uygulanıyor"].includes(normalized(value));
const isPartial=(value:unknown)=>["kısmi uyumlu","partially compliant","partial","kısmi"].includes(normalized(value));
const ownerOf=(row:Row)=>clean(row.data.owner||row.data.riskOwner||row.data.actionOwner||row.data.auditOwner||row.data.controlOwner||row.data.businessOwner||row.data.processOwner||row.data.technicalOwner);

function currentLanguage():Lang{return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase()==="en"?"en":"tr"}
function normalizeRows(body:unknown):Row[]{
  if(!body||typeof body!=="object")return [];
  const source=Array.isArray((body as {rows?:unknown}).rows)?(body as {rows:RawRow[]}).rows:[];
  return source.map((raw,index)=>{
    let data:Record<string,unknown>={};
    if(raw.data&&typeof raw.data==="object"&&!Array.isArray(raw.data))data=raw.data as Record<string,unknown>;
    else if(typeof raw.data_json==="string")try{const parsed=JSON.parse(raw.data_json);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed as Record<string,unknown>}catch{}
    return {id:clean(raw.id)||`v9-${index}`,code:clean(raw.code||raw.recordCode||raw.record_code)||undefined,module:clean(raw.module),data};
  }).filter(row=>row.module);
}
function readiness(rows:Row[]){
  const applicable=rows.filter(row=>!["uygulanamaz","not applicable","n/a"].includes(normalized(row.data.status)));
  if(!applicable.length)return null;
  const points=applicable.reduce((sum,row)=>sum+(isCompliant(row.data.status||row.data.implementation)?100:isPartial(row.data.status||row.data.implementation)?60:0),0);
  return clamp(points/applicable.length);
}
function evidenceExpired(row:Row,now:number){
  const state=normalized(row.data.status||row.data.reviewStatus),expiry=dateValue(row.data.expiresAt);
  return ["süresi doldu","expired","reddedildi","rejected"].includes(state)||(Number.isFinite(expiry)&&expiry<now);
}
function percentageTone(value:number|null,target=80):Tone{return value===null?"neutral":value>=target?"healthy":value>=Math.max(0,target-20)?"watch":"critical"}
function postureLabel(value:number|null,tr:boolean){return value===null?(tr?"Veri bekleniyor":"Data pending"):value>=85?(tr?"Sağlıklı":"Healthy"):value>=65?(tr?"İzlenmeli":"Watch"):(tr?"Aksiyon gerekli":"Action required")}
function formatDate(value:number,lang:Lang){if(!Number.isFinite(value))return "—";return new Intl.DateTimeFormat(lang==="tr"?"tr-TR":"en-GB",{day:"2-digit",month:"short"}).format(new Date(value))}
function navigateTo(module:string){
  const aliases:Record<string,string[]>={
    "Risk Assessment":["Risk Assessment","Risk Değerlendirmesi"],
    "Risk İştahı ve KRI":["Risk İştahı ve KRI","Risk Appetite & KRI"],
    "Uyum":["Uyum Yönetimi","Compliance Management"],
    "Kontroller":["Kontrol Kütüphanesi","Control Library"],
    "Kanıtlar":["Kanıt Kütüphanesi","Evidence Library"],
    "Denetim Yönetimi":["Denetim Yönetimi","Audit Management"],
    "Bulgular ve CAPA":["Bulgular ve CAPA","Findings & CAPA"],
    "BIA":["İş Etki Analizi","Business Impact Analysis"],
    "Bağlantılı GRC":["Bağlantılı GRC Haritası","Connected GRC Map"],
  };
  const labels=aliases[module]||[module],buttons=Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button, aside button"));
  const target=buttons.find(button=>labels.some(label=>normalized(button.textContent).includes(normalized(label))));
  if(target){target.click();return}
  document.querySelector<HTMLButtonElement>(".command-trigger")?.click();
}

export default function DashboardV9Executive(){
  const [healthMount,setHealthMount]=useState<HTMLElement|null>(null),[signalsMount,setSignalsMount]=useState<HTMLElement|null>(null),[riskMount,setRiskMount]=useState<HTMLElement|null>(null),[kpiMount,setKpiMount]=useState<HTMLElement|null>(null);
  const [lang,setLang]=useState<Lang>("tr"),[rows,setRows]=useState<Row[]>([]),[findings,setFindings]=useState<FindingsPayload>({}),[appetite,setAppetite]=useState<AppetitePayload>({}),[asOf,setAsOf]=useState(0);

  useEffect(()=>{
    let health:HTMLDivElement|null=null,signals:HTMLDivElement|null=null,risk:HTMLDivElement|null=null,kpi:HTMLDivElement|null=null;
    const discover=()=>{
      setLang(currentLanguage());
      const dashboard=document.querySelector<HTMLElement>(".workspace-dashboard.fornost-dashboard-v4");
      if(!dashboard)return;
      dashboard.classList.add("fornost-dashboard-v9");
      const shell=dashboard.querySelector<HTMLElement>(".ed4-shell"),grid=dashboard.querySelector<HTMLElement>(".ed4-grid");
      if(!shell||!grid)return;
      health=shell.querySelector<HTMLDivElement>(":scope > .ed9-health-mount");
      if(!health){health=document.createElement("div");health.className="ed9-health-mount";shell.insertBefore(health,grid)}
      setHealthMount(current=>current===health?current:health);
      signals=grid.querySelector<HTMLDivElement>(":scope > .ed9-signals-mount");
      if(!signals){signals=document.createElement("div");signals.className="ed9-signals-mount";grid.appendChild(signals)}
      setSignalsMount(current=>current===signals?current:signals);
      risk=grid.querySelector<HTMLDivElement>(":scope > .ed9-risk-domain-mount");
      if(!risk){risk=document.createElement("div");risk.className="ed9-risk-domain-mount";grid.appendChild(risk)}
      setRiskMount(current=>current===risk?current:risk);
      kpi=grid.querySelector<HTMLDivElement>(":scope > .ed9-kpi-table-mount");
      if(!kpi){kpi=document.createElement("div");kpi.className="ed9-kpi-table-mount";grid.appendChild(kpi)}
      setKpiMount(current=>current===kpi?current:kpi);
    };
    discover();
    const observer=new MutationObserver(discover);observer.observe(document.body,{childList:true,subtree:true});
    const onClick=()=>setLang(currentLanguage());document.addEventListener("click",onClick);
    return()=>{observer.disconnect();document.removeEventListener("click",onClick);health?.remove();signals?.remove();risk?.remove();kpi?.remove();document.querySelector(".workspace-dashboard.fornost-dashboard-v9")?.classList.remove("fornost-dashboard-v9")};
  },[]);

  useEffect(()=>{
    if(!healthMount&&!signalsMount&&!riskMount&&!kpiMount)return;
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
  },[healthMount,signalsMount,riskMount,kpiMount]);

  const data=useMemo(()=>{
    const now=asOf||1,horizon=now+30*DAY,by=(module:string)=>rows.filter(row=>row.module===module),risks=by("Risk Assessment").filter(row=>!isClosed(row.data.status)),controls=by("Kontroller"),compliance=by("Uyum"),evidence=by("Kanıtlar"),audits=by("Denetim Yönetimi").filter(row=>!isClosed(row.data.status)),bia=by("BIA").filter(row=>!isClosed(row.data.status));
    const riskScores=risks.map(row=>calculatedRiskScore(row.data)),criticalRisks=riskScores.filter(score=>score>=17).length,highRisks=riskScores.filter(score=>score>=10&&score<17).length,avgRisk=riskScores.length?Math.round(riskScores.reduce((sum,score)=>sum+score,0)/riskScores.length):0;
    const controlAssurance=buildControlAssurance(rows),controlHealth=controlAssurance.total?clamp(controlAssurance.score):null,complianceHealth=readiness(compliance),staleEvidence=evidence.filter(row=>evidenceExpired(row,now)).length,evidenceFreshness=evidence.length?clamp(((evidence.length-staleEvidence)/evidence.length)*100):null,assurance=buildExecutiveAssurance(rows);
    const findingSummary=findings.summary||{},openFindings=num(findingSummary.open),criticalFindings=num(findingSummary.critical),overdueFindings=num(findingSummary.overdue),remediation=openFindings?clamp(((openFindings-overdueFindings)/openFindings)*100):num(findingSummary.total)?100:null;
    const auditDates=audits.map(row=>dateValue(row.data.dueDate||row.data.targetDate||row.data.auditDate)).filter(Number.isFinite).sort((a,b)=>a-b),auditOverdue=auditDates.filter(due=>due<now).length,auditDue30=auditDates.filter(due=>due>=now&&due<=horizon).length,nextAuditDate=auditDates.find(due=>due>=now)??Number.NaN;
    const evidenceDue30=evidence.filter(row=>{if(evidenceExpired(row,now))return false;const expiry=dateValue(row.data.expiresAt);return Number.isFinite(expiry)&&expiry>=now&&expiry<=horizon}).length;
    const riskReviewsDue30=risks.filter(row=>{const due=dateValue(row.data.nextReviewDate||row.data.reviewDate||row.data.dueDate);return Number.isFinite(due)&&due>=now&&due<=horizon}).length;
    const appetiteSummary=appetite.summary||{},appetiteTotal=num(appetiteSummary.total),kriBreaches=Math.max(num(appetiteSummary.breached),num(appetiteSummary.openBreaches)),kriWarnings=num(appetiteSummary.warning),kriMeasurementDue=num(appetiteSummary.measurementDue),appetiteHealth=appetiteTotal?clamp(((appetiteTotal-kriBreaches-kriWarnings*.5)/appetiteTotal)*100):null;
    const completeBia=bia.filter(row=>clean(row.data.rto)&&clean(row.data.rpo)&&ownerOf(row)).length,biaCoverage=bia.length?clamp((completeBia/bia.length)*100):null;
    const governed=[...risks,...controls,...audits,...bia],assigned=governed.filter(row=>ownerOf(row)).length,ownership=governed.length?clamp((assigned/governed.length)*100):null;
    const domains=[{value:riskScores.length?clamp(100-(avgRisk/25)*100):null,weight:25},{value:controlHealth,weight:20},{value:complianceHealth,weight:15},{value:evidenceFreshness,weight:15},{value:assurance.totalAudits?clamp(assurance.auditScore):null,weight:10},{value:appetiteHealth,weight:10},{value:biaCoverage,weight:5}].filter((item):item is {value:number;weight:number}=>item.value!==null),weight=domains.reduce((sum,item)=>sum+item.weight,0),overall=weight?clamp(domains.reduce((sum,item)=>sum+item.value*item.weight,0)/weight):null;
    return {risks,criticalRisks,highRisks,avgRisk,controlAssurance,controlHealth,complianceHealth,evidenceFreshness,staleEvidence,openFindings,criticalFindings,overdueFindings,remediation,auditOverdue,auditDue30,nextAuditDate,evidenceDue30,riskReviewsDue30,kriMeasurementDue,kriBreaches,kriWarnings,kriAvailable:appetiteTotal>0||kriBreaches>0,appetiteHealth,biaCoverage,completeBia,biaTotal:bia.length,ownership,assigned,governed:governed.length,overall,overdueActions:auditOverdue+overdueFindings,assurance};
  },[rows,findings,appetite,asOf]);

  const tr=lang==="tr",overallState=postureLabel(data.overall,tr);
  const healthMetrics:Metric[]=[
    {key:"overall",labelTr:"GRC Sağlığı",labelEn:"GRC Health",value:data.overall===null?"—":`${data.overall} / 100`,detailTr:data.overall===null?"Birleşik posture hesaplanamadı":`${overallState} · birleşik posture`,detailEn:data.overall===null?"Composite posture unavailable":`${overallState} · composite posture`,targetTr:"Hedef ≥85",targetEn:"Target ≥85",tone:percentageTone(data.overall,85),module:"Bağlantılı GRC"},
    {key:"risk",labelTr:"Yüksek / Kritik Risk",labelEn:"High / Critical Risks",value:String(data.highRisks+data.criticalRisks),detailTr:`${data.criticalRisks} kritik · ${data.highRisks} yüksek`,detailEn:`${data.criticalRisks} critical · ${data.highRisks} high`,targetTr:"Hedef 0 kritik",targetEn:"Target 0 critical",tone:data.criticalRisks?"critical":data.highRisks?"watch":"healthy",module:"Risk Assessment"},
    {key:"control",labelTr:"Kontrol Etkinliği",labelEn:"Control Effectiveness",value:data.controlHealth===null?"—":`${data.controlHealth}%`,detailTr:`${data.controlAssurance.healthy}/${data.controlAssurance.total} tam sağlıklı`,detailEn:`${data.controlAssurance.healthy}/${data.controlAssurance.total} fully healthy`,targetTr:"Hedef ≥80%",targetEn:"Target ≥80%",tone:percentageTone(data.controlHealth,80),module:"Kontroller"},
    {key:"compliance",labelTr:"Uyum Hazırlığı",labelEn:"Compliance Readiness",value:data.complianceHealth===null?"—":`${data.complianceHealth}%`,detailTr:"Framework gereksinimleri",detailEn:"Framework requirements",targetTr:"Hedef ≥90%",targetEn:"Target ≥90%",tone:percentageTone(data.complianceHealth,90),module:"Uyum"},
    {key:"evidence",labelTr:"Kanıt Güncelliği",labelEn:"Evidence Freshness",value:data.evidenceFreshness===null?"—":`${data.evidenceFreshness}%`,detailTr:`${data.staleEvidence} güncel olmayan kanıt`,detailEn:`${data.staleEvidence} stale evidence`,targetTr:"Hedef ≥90%",targetEn:"Target ≥90%",tone:percentageTone(data.evidenceFreshness,90),module:"Kanıtlar"},
    {key:"overdue",labelTr:"Gecikmiş Aksiyon",labelEn:"Overdue Actions",value:String(data.overdueActions),detailTr:`${data.auditOverdue} denetim · ${data.overdueFindings} CAPA`,detailEn:`${data.auditOverdue} audit · ${data.overdueFindings} CAPA`,targetTr:"Hedef 0",targetEn:"Target 0",tone:data.overdueActions?"watch":"healthy",module:"Denetim Yönetimi"},
  ];
  const outlook:OutlookItem[]=[
    {key:"audit",count:data.auditDue30,labelTr:"30 günde denetim termini",labelEn:"Audit due in 30 days",detailTr:data.nextAuditDate?`Sonraki kilometre taşı ${formatDate(data.nextAuditDate,lang)}`:"Planlı açık termin yok",detailEn:data.nextAuditDate?`Next milestone ${formatDate(data.nextAuditDate,lang)}`:"No scheduled open due date",tone:data.auditDue30?"watch":"healthy",module:"Denetim Yönetimi"},
    {key:"evidence",count:data.evidenceDue30,labelTr:"30 günde süresi dolacak kanıt",labelEn:"Evidence expiring in 30 days",detailTr:"Yaklaşan kanıt yenileme ihtiyacı",detailEn:"Upcoming evidence renewal workload",tone:data.evidenceDue30?"watch":"healthy",module:"Kanıtlar"},
    {key:"risk",count:data.riskReviewsDue30,labelTr:"30 günde risk gözden geçirme",labelEn:"Risk reviews due in 30 days",detailTr:"Yaklaşan risk sahipliği kararları",detailEn:"Upcoming risk ownership decisions",tone:data.riskReviewsDue30?"watch":"healthy",module:"Risk Assessment"},
    {key:"kri",count:data.kriMeasurementDue,labelTr:"KRI ölçümü bekleniyor",labelEn:"KRI measurements due",detailTr:data.kriAvailable?"Ölçüm takvimindeki yaklaşan işler":"KRI henüz yapılandırılmadı",detailEn:data.kriAvailable?"Upcoming measurement workload":"KRI is not configured",tone:data.kriAvailable?(data.kriMeasurementDue?"watch":"healthy"):"neutral",module:"Risk İştahı ve KRI"},
  ];
  const kpis:KpiRow[]=[
    {key:"kri",labelTr:"KRI / İştah İhlali",labelEn:"KRI / Appetite Breach",currentTr:data.kriAvailable?String(data.kriBreaches):"Yapılandırılmadı",currentEn:data.kriAvailable?String(data.kriBreaches):"Not configured",target:"0",tone:data.kriAvailable?(data.kriBreaches?"critical":"healthy"):"neutral",statusTr:data.kriAvailable?(data.kriBreaches?"Aksiyon gerekli":"Sağlıklı"):"Yapılandırılmadı",statusEn:data.kriAvailable?(data.kriBreaches?"Action required":"Healthy"):"Not configured",module:"Risk İştahı ve KRI",configured:data.kriAvailable},
    {key:"control",labelTr:"Kontrol Etkinliği",labelEn:"Control Effectiveness",currentTr:data.controlHealth===null?"Veri yok":`${data.controlHealth}%`,currentEn:data.controlHealth===null?"No data":`${data.controlHealth}%`,target:"≥80%",tone:percentageTone(data.controlHealth,80),statusTr:data.controlHealth===null?"Veri bekleniyor":data.controlHealth>=80?"Sağlıklı":data.controlHealth>=60?"İzlenmeli":"Aksiyon gerekli",statusEn:data.controlHealth===null?"Data pending":data.controlHealth>=80?"Healthy":data.controlHealth>=60?"Watch":"Action required",module:"Kontroller",configured:data.controlHealth!==null},
    {key:"evidence",labelTr:"Kanıt Güncelliği",labelEn:"Evidence Freshness",currentTr:data.evidenceFreshness===null?"Veri yok":`${data.evidenceFreshness}%`,currentEn:data.evidenceFreshness===null?"No data":`${data.evidenceFreshness}%`,target:"≥90%",tone:percentageTone(data.evidenceFreshness,90),statusTr:data.evidenceFreshness===null?"Veri bekleniyor":data.evidenceFreshness>=90?"Sağlıklı":data.evidenceFreshness>=70?"İzlenmeli":"Aksiyon gerekli",statusEn:data.evidenceFreshness===null?"Data pending":data.evidenceFreshness>=90?"Healthy":data.evidenceFreshness>=70?"Watch":"Action required",module:"Kanıtlar",configured:data.evidenceFreshness!==null},
    {key:"remediation",labelTr:"İyileştirme SLA",labelEn:"Remediation SLA",currentTr:data.remediation===null?"Veri yok":`${data.remediation}%`,currentEn:data.remediation===null?"No data":`${data.remediation}%`,target:"≥90%",tone:percentageTone(data.remediation,90),statusTr:data.remediation===null?"Veri bekleniyor":data.remediation>=90?"Sağlıklı":data.remediation>=70?"İzlenmeli":"Aksiyon gerekli",statusEn:data.remediation===null?"Data pending":data.remediation>=90?"Healthy":data.remediation>=70?"Watch":"Action required",module:"Bulgular ve CAPA",configured:data.remediation!==null},
    {key:"bia",labelTr:"BIA Dayanıklılık",labelEn:"BIA Resilience",currentTr:data.biaCoverage===null?"Veri yok":`${data.biaCoverage}%`,currentEn:data.biaCoverage===null?"No data":`${data.biaCoverage}%`,target:"100%",tone:percentageTone(data.biaCoverage,100),statusTr:data.biaCoverage===null?"Veri bekleniyor":data.biaCoverage===100?"Sağlıklı":"İzlenmeli",statusEn:data.biaCoverage===null?"Data pending":data.biaCoverage===100?"Healthy":"Watch",module:"BIA",configured:data.biaCoverage!==null},
    {key:"ownership",labelTr:"Sahiplik Kapsamı",labelEn:"Ownership Coverage",currentTr:data.ownership===null?"Veri yok":`${data.ownership}%`,currentEn:data.ownership===null?"No data":`${data.ownership}%`,target:"≥95%",tone:percentageTone(data.ownership,95),statusTr:data.ownership===null?"Veri bekleniyor":data.ownership>=95?"Sağlıklı":"İzlenmeli",statusEn:data.ownership===null?"Data pending":data.ownership>=95?"Healthy":"Watch",module:"Risk Assessment",configured:data.ownership!==null},
  ];

  const healthPortal=healthMount?createPortal(<section className="ed9-health-strip" aria-label={tr?"Yönetici sağlık göstergeleri":"Executive health indicators"}>{healthMetrics.map(item=><button type="button" key={item.key} className={`ed9-health-item ${item.tone}`} onClick={()=>navigateTo(item.module)}><small>{tr?item.labelTr:item.labelEn}</small><strong>{item.value}</strong><span>{tr?item.detailTr:item.detailEn}</span><em>{tr?item.targetTr:item.targetEn}</em></button>)}</section>,healthMount):null;
  const signalsPortal=signalsMount?createPortal(<article className="ed4-panel ed9-signals ed10-outlook"><header className="ed4-panel-head"><div><small>{tr?"YÖNETİM GÖRÜNÜMÜ":"MANAGEMENT OUTLOOK"}</small><h3>{tr?"Önümüzdeki 30 gün":"Next 30 days"}</h3></div><b>{outlook.reduce((sum,item)=>sum+(item.count||0),0)}</b></header><div className="ed9-signal-list ed10-outlook-list">{outlook.map(item=><button type="button" key={item.key} className={item.count?"active":"quiet"} onClick={()=>navigateTo(item.module)}><i className={item.tone}>{item.count??item.value??"—"}</i><span><b>{tr?item.labelTr:item.labelEn}</b><small>{tr?item.detailTr:item.detailEn}</small></span><em>→</em></button>)}</div></article>,signalsMount):null;
  const riskPortal=riskMount?createPortal(<article className="ed4-panel ed9-risk-domain"><header className="ed4-panel-head"><div><small>{tr?"RİSK POSTURE":"RISK POSTURE"}</small><h3>{tr?"Maruziyet ve iştah":"Exposure & appetite"}</h3></div><button type="button" onClick={()=>navigateTo("Risk Assessment")}>{tr?"Risk merkezi":"Risk center"}<span>→</span></button></header><div className="ed9-domain-metrics"><button type="button" onClick={()=>navigateTo("Risk Assessment")}><small>{tr?"Yüksek / kritik":"High / critical"}</small><strong>{data.highRisks+data.criticalRisks}</strong><span>{data.criticalRisks} {tr?"kritik":"critical"}</span></button><button type="button" onClick={()=>navigateTo("Risk Assessment")}><small>{tr?"Ortalama skor":"Average score"}</small><strong>{data.risks.length?`${data.avgRisk}/25`:"—"}</strong><span>{data.risks.length} {tr?"aktif risk":"active risks"}</span></button><button type="button" onClick={()=>navigateTo("Risk İştahı ve KRI")}><small>{tr?"İştah ihlali":"Appetite breach"}</small><strong>{data.kriAvailable?data.kriBreaches:"—"}</strong><span>{data.kriAvailable?(tr?"aktif ihlal":"active breaches"):(tr?"KRI tanımlı değil":"KRI not configured")}</span></button></div></article>,riskMount):null;
  const kpiPortal=kpiMount?createPortal(<article className="ed4-panel ed9-kpi-table ed10-kpi-table"><header className="ed4-panel-head"><div><small>{tr?"KPI / KRI YÖNETİM TABLOSU":"KPI / KRI MANAGEMENT TABLE"}</small><h3>{tr?"Mevcut durum, hedef ve yönetim statüsü":"Current state, target & management status"}</h3></div><button type="button" onClick={()=>navigateTo("Risk İştahı ve KRI")}>{tr?"KRI merkezi":"KRI center"}<span>→</span></button></header><div className="ed9-kpi-head"><span>{tr?"Gösterge":"Metric"}</span><span>{tr?"Mevcut":"Current"}</span><span>{tr?"Hedef":"Target"}</span><span>{tr?"Durum":"Status"}</span></div>{kpis.map(item=><button type="button" key={item.key} className={`ed9-kpi-row ${item.tone} ${item.configured?"":"not-configured"}`} onClick={()=>navigateTo(item.module)}><span>{tr?item.labelTr:item.labelEn}</span><strong>{tr?item.currentTr:item.currentEn}</strong><span>{item.target}</span><span className={`ed10-status ${item.tone}`}><i/><b>{tr?item.statusTr:item.statusEn}</b></span></button>)}</article>,kpiMount):null;
  return <>{healthPortal}{signalsPortal}{riskPortal}{kpiPortal}</>;
}
