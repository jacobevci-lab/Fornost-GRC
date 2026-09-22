"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import "./dashboard-customizer.css";

type WidgetId="metrics"|"executiveAssurance"|"riskExposure"|"decisionQueue"|"controlEvidence"|"resilience"|"workspaces";
type PresetId="executive"|"risk"|"assurance"|"operations";
type DashboardPreferences={
  preset:PresetId;
  visible:Record<WidgetId,boolean>;
  order:WidgetId[];
  compact:boolean;
};

const STORAGE_KEY="fornost:dashboard-preferences:v1";
const DEFAULT_ORDER:WidgetId[]=["metrics","executiveAssurance","riskExposure","decisionQueue","controlEvidence","resilience","workspaces"];
const WIDGETS:Array<{id:WidgetId;selector:string;tr:string;en:string;descriptionTr:string;descriptionEn:string}>=[
  {id:"metrics",selector:".dashboard-metrics",tr:"Yönetici KPI'ları",en:"Executive KPIs",descriptionTr:"Risk, uyum, denetim ve kanıt özetleri",descriptionEn:"Risk, compliance, audit and evidence summary"},
  {id:"executiveAssurance",selector:".executive-assurance-panel",tr:"Bütünleşik Güvence",en:"Composite Assurance",descriptionTr:"Connected GRC güvence skoru ve operasyon görünümü",descriptionEn:"Connected GRC assurance score and operations posture"},
  {id:"riskExposure",selector:".dashboard-intelligence > .risk-focus-panel",tr:"Risk Maruziyeti",en:"Risk Exposure",descriptionTr:"Risk yoğunluğu ve öncelikli riskler",descriptionEn:"Risk concentration and priority risks"},
  {id:"decisionQueue",selector:".dashboard-intelligence > .attention-panel",tr:"Karar Kuyruğu",en:"Decision Queue",descriptionTr:"Yönetim dikkati ve aksiyon gerektiren kayıtlar",descriptionEn:"Items requiring management attention and action"},
  {id:"controlEvidence",selector:".dashboard-intelligence > .assurance-panel",tr:"Kontrol & Kanıt Sağlığı",en:"Control & Evidence Health",descriptionTr:"Kontrol, kanıt ve uyum kapsaması",descriptionEn:"Control, evidence and compliance coverage"},
  {id:"resilience",selector:".dashboard-intelligence > .resilience-panel",tr:"İş Dayanıklılığı",en:"Business Resilience",descriptionTr:"Kritik iş hizmetleri ve RTO görünümü",descriptionEn:"Critical business services and RTO posture"},
  {id:"workspaces",selector:".dashboard-shortcuts",tr:"Hızlı Çalışma Alanları",en:"Quick Workspaces",descriptionTr:"Risk, denetim, kanıt, kontrol ve tedarikçi kısayolları",descriptionEn:"Risk, audit, evidence, control and vendor shortcuts"},
];

const PRESETS:Record<PresetId,DashboardPreferences>={
  executive:{preset:"executive",compact:false,order:DEFAULT_ORDER,visible:{metrics:true,executiveAssurance:true,riskExposure:true,decisionQueue:true,controlEvidence:true,resilience:true,workspaces:false}},
  risk:{preset:"risk",compact:false,order:["metrics","riskExposure","decisionQueue","controlEvidence","executiveAssurance","resilience","workspaces"],visible:{metrics:true,executiveAssurance:false,riskExposure:true,decisionQueue:true,controlEvidence:true,resilience:false,workspaces:false}},
  assurance:{preset:"assurance",compact:false,order:["metrics","executiveAssurance","controlEvidence","decisionQueue","riskExposure","resilience","workspaces"],visible:{metrics:true,executiveAssurance:true,riskExposure:false,decisionQueue:true,controlEvidence:true,resilience:false,workspaces:false}},
  operations:{preset:"operations",compact:true,order:["metrics","decisionQueue","riskExposure","resilience","controlEvidence","executiveAssurance","workspaces"],visible:{metrics:true,executiveAssurance:false,riskExposure:true,decisionQueue:true,controlEvidence:true,resilience:true,workspaces:true}},
};

function clonePreferences(source:DashboardPreferences):DashboardPreferences{
  return {...source,order:[...source.order],visible:{...source.visible}};
}

function loadPreferences():DashboardPreferences{
  if(typeof window==="undefined")return clonePreferences(PRESETS.executive);
  try{
    const parsed=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||"") as Partial<DashboardPreferences>;
    const preset=(parsed.preset&&PRESETS[parsed.preset])?parsed.preset:"executive";
    return {
      preset,
      compact:Boolean(parsed.compact),
      order:[...DEFAULT_ORDER].sort((a,b)=>{
        const ai=parsed.order?.indexOf(a)??-1,bi=parsed.order?.indexOf(b)??-1;
        return (ai<0?999:ai)-(bi<0?999:bi);
      }),
      visible:{...PRESETS[preset].visible,...(parsed.visible||{})},
    };
  }catch{return clonePreferences(PRESETS.executive)}
}

function dashboardLanguage(){
  const active=document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase();
  return active==="en"?"en":"tr";
}

const presetLabel=(preset:PresetId,tr:boolean)=>preset==="executive"?"Executive":preset==="risk"?(tr?"Risk":"Risk"):preset==="assurance"?(tr?"Güvence":"Assurance"):(tr?"Operasyon":"Operations");

export default function DashboardCustomizer(){
  const [preferences,setPreferences]=useState<DashboardPreferences>(()=>loadPreferences());
  const [dashboard,setDashboard]=useState<HTMLElement|null>(null);
  const [open,setOpen]=useState(false);
  const [lang,setLang]=useState<"tr"|"en">("tr");

  const apply=useCallback((target:HTMLElement|null,prefs:DashboardPreferences)=>{
    if(!target)return;
    target.classList.toggle("fornost-dashboard-compact",prefs.compact);
    target.dataset.dashboardPreset=prefs.preset;

    const hero=target.querySelector(".dashboard-hero") as HTMLElement|null;
    if(hero)hero.style.order="0";

    WIDGETS.forEach(widget=>{
      const node=target.querySelector(widget.selector) as HTMLElement|null;
      if(!node)return;
      node.dataset.fornostDashboardWidget=widget.id;
      node.hidden=!prefs.visible[widget.id];
      node.style.order=String(10+Math.max(0,prefs.order.indexOf(widget.id)));
    });

    const intelligence=target.querySelector(".dashboard-intelligence") as HTMLElement|null;
    if(intelligence){
      const intelligenceWidgets=WIDGETS.filter(widget=>widget.selector.includes("dashboard-intelligence"));
      const visibleIntelligence=intelligenceWidgets.filter(widget=>prefs.visible[widget.id]);
      intelligence.hidden=visibleIntelligence.length===0;
      const firstVisibleOrder=Math.min(...visibleIntelligence.map(widget=>prefs.order.indexOf(widget.id)).filter(index=>index>=0));
      intelligence.style.order=String(10+(Number.isFinite(firstVisibleOrder)?firstVisibleOrder:DEFAULT_ORDER.length));
    }

    const footnote=target.querySelector(".dashboard-footnote") as HTMLElement|null;
    if(footnote)footnote.style.order="99";
  },[]);

  useEffect(()=>{
    const discover=()=>{
      const root=document.querySelector(".workspace-dashboard") as HTMLElement|null;
      setDashboard(current=>current===root?current:root);
      setLang(dashboardLanguage());
      apply(root,preferences);
    };
    const refreshLanguage=()=>window.requestAnimationFrame(()=>setLang(dashboardLanguage()));
    discover();
    const observer=new MutationObserver(discover);
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener("click",refreshLanguage);
    return()=>{observer.disconnect();document.removeEventListener("click",refreshLanguage)};
  },[apply,preferences]);

  useEffect(()=>{
    window.localStorage.setItem(STORAGE_KEY,JSON.stringify(preferences));
    apply(dashboard,preferences);
  },[apply,dashboard,preferences]);

  useEffect(()=>{
    if(!dashboard)return;
    dashboard.classList.toggle("fornost-dashboard-customizing",open);
    return()=>dashboard.classList.remove("fornost-dashboard-customizing");
  },[dashboard,open]);

  useEffect(()=>{
    if(!open)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};
    document.addEventListener("keydown",onKeyDown);
    return()=>document.removeEventListener("keydown",onKeyDown);
  },[open]);

  const tr=lang==="tr";
  const visibleCount=useMemo(()=>Object.values(preferences.visible).filter(Boolean).length,[preferences.visible]);

  const setPreset=(preset:PresetId)=>setPreferences(clonePreferences(PRESETS[preset]));
  const toggle=(id:WidgetId)=>setPreferences(current=>({...current,visible:{...current.visible,[id]:!current.visible[id]}}));
  const move=(id:WidgetId,direction:-1|1)=>setPreferences(current=>{
    const order=[...current.order],index=order.indexOf(id),next=index+direction;
    if(index<0||next<0||next>=order.length)return current;
    [order[index],order[next]]=[order[next],order[index]];
    return {...current,order};
  });
  const reset=()=>setPreferences(clonePreferences(PRESETS.executive));

  if(!dashboard)return null;

  const viewBar=createPortal(
    <section className="dashboard-viewbar" aria-label={tr?"Dashboard görünümü":"Dashboard view"}>
      <div className="dashboard-viewbar-copy">
        <span className="dashboard-live-dot" aria-hidden="true"/>
        <div><small>{tr?"YÖNETİCİ GÖRÜNÜMÜ":"EXECUTIVE VIEW"}</small><b>{tr?"Risk · Uyum · Güvence · Dayanıklılık":"Risk · Compliance · Assurance · Resilience"}</b></div>
      </div>
      <div className="dashboard-view-tabs" role="group" aria-label={tr?"Hazır dashboard görünümleri":"Dashboard presets"}>
        {(["executive","risk","assurance","operations"] as PresetId[]).map(id=><button type="button" key={id} className={preferences.preset===id?"active":""} onClick={()=>setPreset(id)}>{presetLabel(id,tr)}</button>)}
      </div>
      <button type="button" className="dashboard-customize-trigger" onClick={()=>setOpen(true)} aria-label={tr?"Dashboard'ı özelleştir":"Customize dashboard"}>
        <span aria-hidden="true">⚙</span>{tr?"Dashboard'ı Özelleştir":"Customize Dashboard"}
      </button>
    </section>,dashboard,
  );

  return <>
    {viewBar}
    {open&&createPortal(<div className="dashboard-customizer-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <aside className="dashboard-customizer-drawer" role="dialog" aria-modal="true" aria-labelledby="dashboard-customizer-title">
        <header>
          <div><small>{tr?"FORNOST GRC · KİŞİSEL YÖNETİCİ GÖRÜNÜMÜ":"FORNOST GRC · PERSONAL EXECUTIVE VIEW"}</small><h2 id="dashboard-customizer-title">{tr?"Dashboard'ı Özelleştir":"Customize Dashboard"}</h2><p>{tr?"Yalnızca karar verirken görmek istediğiniz GRC sinyallerini öne çıkarın.":"Keep only the GRC signals you need for executive decisions."}</p></div>
          <button type="button" className="dashboard-customizer-close" onClick={()=>setOpen(false)} aria-label={tr?"Kapat":"Close"}>×</button>
        </header>

        <section className="dashboard-customizer-summary">
          <div><small>{tr?"AKTİF GÖRÜNÜM":"ACTIVE VIEW"}</small><b>{presetLabel(preferences.preset,tr)}</b></div>
          <div><small>{tr?"GÖRÜNÜR WIDGET":"VISIBLE WIDGETS"}</small><b>{visibleCount}/{WIDGETS.length}</b></div>
          <div><small>{tr?"YOĞUNLUK":"DENSITY"}</small><b>{preferences.compact?(tr?"Kompakt":"Compact"):(tr?"Standart":"Standard")}</b></div>
        </section>

        <section className="dashboard-customizer-section">
          <div className="dashboard-customizer-section-head"><div><small>01</small><h3>{tr?"Hazır görünüm":"Preset view"}</h3></div><span>{tr?"Rol bazlı odak":"Role-based focus"}</span></div>
          <div className="dashboard-preset-grid">
            {(["executive","risk","assurance","operations"] as PresetId[]).map(id=>{
              const labels={executive:"Executive",risk:"Risk",assurance:tr?"Güvence":"Assurance",operations:tr?"Operasyon":"Operations"};
              const descriptions={executive:tr?"Board ve CISO karar görünümü":"Board and CISO decision view",risk:tr?"Maruziyet ve öncelikli riskler":"Exposure and priority risks",assurance:tr?"Kontrol, kanıt ve audit readiness":"Controls, evidence and audit readiness",operations:tr?"Aksiyon kuyruğu ve çalışma alanları":"Action queue and workspaces"};
              return <button type="button" key={id} className={preferences.preset===id?"active":""} onClick={()=>setPreset(id)}><span><b>{labels[id]}</b><small>{descriptions[id]}</small></span><em>{preferences.preset===id?"✓":"→"}</em></button>;
            })}
          </div>
        </section>

        <section className="dashboard-customizer-section">
          <div className="dashboard-customizer-section-head"><div><small>02</small><h3>{tr?"Widget görünürlüğü ve sırası":"Widget visibility & order"}</h3></div><span>{tr?"Karar önceliğine göre":"By decision priority"}</span></div>
          <div className="dashboard-widget-list">
            {preferences.order.map((id,index)=>{
              const widget=WIDGETS.find(item=>item.id===id)!;
              return <article key={id} className={preferences.visible[id]?"enabled":"disabled"}>
                <button type="button" className="dashboard-widget-toggle" onClick={()=>toggle(id)} aria-pressed={preferences.visible[id]}><i>{preferences.visible[id]?"✓":""}</i></button>
                <div><b>{tr?widget.tr:widget.en}</b><small>{tr?widget.descriptionTr:widget.descriptionEn}</small></div>
                <span>{String(index+1).padStart(2,"0")}</span>
                <div className="dashboard-widget-order"><button type="button" disabled={index===0} onClick={()=>move(id,-1)} aria-label={tr?"Yukarı taşı":"Move up"}>↑</button><button type="button" disabled={index===preferences.order.length-1} onClick={()=>move(id,1)} aria-label={tr?"Aşağı taşı":"Move down"}>↓</button></div>
              </article>;
            })}
          </div>
        </section>

        <section className="dashboard-customizer-section compact-setting">
          <div><small>03</small><span><b>{tr?"Kompakt yoğunluk":"Compact density"}</b><em>{tr?"Aynı ekranda daha fazla karar bilgisi gösterir.":"Shows more decision information on the same screen."}</em></span></div>
          <button type="button" className={preferences.compact?"on":""} onClick={()=>setPreferences(current=>({...current,compact:!current.compact}))} aria-pressed={preferences.compact}><i/></button>
        </section>

        <footer><button type="button" className="ghost" onClick={reset}>{tr?"Varsayılana dön":"Reset to default"}</button><button type="button" className="primary" onClick={()=>setOpen(false)}>{tr?"Görünümü Kaydet":"Save View"}</button></footer>
      </aside>
    </div>,document.body)}
  </>;
}