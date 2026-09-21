"use client";

import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import "./continuous-assurance-timeline.css";

type Lang="tr"|"en";
type Category="control"|"review"|"capa"|"finding"|"risk";
type TimelineEvent={id:string;type:string;category:Category;title:string;detail:string;actor:string;status:string;reference:string;findingId?:string;ruleId?:string;createdAt:string};
const categories:Category[]=["control","review","capa","finding","risk"];

export default function ContinuousAssuranceTimeline({lang}:{lang:Lang}){
 const tr=lang==="tr",[events,setEvents]=useState<TimelineEvent[]>([]),[loading,setLoading]=useState(true),[category,setCategory]=useState<"all"|Category>("all"),[expanded,setExpanded]=useState(false);
 useEffect(()=>{let live=true;fetch(withBasePath("/api/continuous-assurance/timeline"),{cache:"no-store",headers:{accept:"application/json"}}).then(r=>r.ok?r.json():null).then(data=>{if(live&&data)setEvents(Array.isArray(data.events)?data.events:[])}).catch(()=>{}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const visible=useMemo(()=>events.filter(event=>category==="all"||event.category===category).slice(0,expanded?100:12),[events,category,expanded]);
 const label=(value:Category)=>tr?({control:"Kontrol",review:"İnceleme",capa:"CAPA",finding:"Bulgu",risk:"Risk"} as Record<Category,string>)[value]:({control:"Control",review:"Review",capa:"CAPA",finding:"Finding",risk:"Risk"} as Record<Category,string>)[value];
 const fmt=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{dateStyle:"short",timeStyle:"short"}).format(date)};
 return <section className="assurance-timeline">
  <header><div><small>ASSURANCE TIMELINE</small><h4>{tr?"Uçtan uca güvence geçmişi":"End-to-end assurance history"}</h4><p>{tr?"Kontrol çalışmaları, incelemeler, CAPA, bulgu ve risk yeniden değerlendirmelerini tek kronolojide izleyin.":"Trace control runs, reviews, CAPA, findings and risk reassessments in one chronology."}</p></div><span>{events.length}</span></header>
  <div className="assurance-timeline-filters"><button className={category==="all"?"active":""} onClick={()=>setCategory("all")}>{tr?"Tümü":"All"}</button>{categories.map(value=><button key={value} className={category===value?"active":""} onClick={()=>setCategory(value)}>{label(value)}</button>)}</div>
  {visible.length?<div className="assurance-timeline-list">{visible.map(event=><article key={event.id}><i className={event.category}/><div><div className="timeline-title"><span>{label(event.category)}</span><b>{event.title}</b><em>{fmt(event.createdAt)}</em></div><p>{event.detail||"—"}</p><footer><small>{event.actor||"system"}</small>{event.status&&<span>{event.status}</span>}{event.reference&&<code>{event.reference}</code>}</footer></div></article>)}</div>:<div className="assurance-timeline-empty">{loading?(tr?"Güvence geçmişi yükleniyor…":"Loading assurance history…"):(tr?"Bu filtrede olay yok.":"No events in this filter.")}</div>}
  {events.length>12&&<button className="assurance-timeline-more" type="button" onClick={()=>setExpanded(value=>!value)}>{expanded?(tr?"Daralt":"Show less"):(tr?"Daha Fazla Göster":"Show more")}</button>}
 </section>;
}
