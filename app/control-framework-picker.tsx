"use client";
import {useState} from "react";
import {displayTitle} from "./framework-posture/iso-display";
import {programName} from "./framework-posture/catalog";
import {ChoiceInput} from "./risk-editor-fields";
import {usePosture} from "./framework-posture/client";
import type {ControlCatalog,ControlMappingChange} from "./framework-posture/types";
import {normalizeRiskSearch} from "./risk-record-options";

type Props={id?:string;tr:boolean;tags:string;allowed:boolean;write:boolean;changes:ControlMappingChange[];
  update:(tags:string,changes:ControlMappingChange[])=>void};
export function ControlFrameworkPicker({id,tr,tags,allowed,write,changes,update}:Props){
  const [attempt,retry]=useState(0),[query,search]=useState(""),[reqQuery,searchReq]=useState("");
  const result=usePosture<ControlCatalog>(allowed?{controlEditor:id||""}:null,attempt);
  const programs=result.data?.programs||[],stored=tags.split(/[,;|\n]+/).map(s=>programName(s.trim())).filter(Boolean);
  const key=(name:string,ref:string)=>JSON.stringify([name,ref]);
  const delta=new Map(changes.map(c=>[key(c.name,c.ref),c]));
  const mapped=programs.flatMap(p=>p.clauses.filter(c=>delta.get(key(p.name,c.ref))?.linked??c.linked).map(c=>({...c,title:displayTitle(p.name,c.ref,c.title,tr),name:p.name})));
  const selected=new Set([...stored,...mapped.map(c=>c.name)]);
  function saveChange(name:string,ref:string,linked:boolean,next=delta){
    const clause=programs.find(p=>p.name===name)?.clauses.find(c=>c.ref===ref);
    if(!clause)return;
    if(linked===clause.linked)next.delete(key(name,ref));
    else next.set(key(name,ref),{name,ref,linked,revision:clause.revision});
  }
  function apply(names:Set<string>,next=delta){
    // Preserve implicit legacy mappings when editing the framework tags that inferred them.
    for(const p of programs)if(names.has(p.name))for(const c of p.clauses){
      if(c.linked&&!c.revision&&!next.has(key(p.name,c.ref)))next.set(key(p.name,c.ref),{name:p.name,ref:c.ref,linked:true,revision:c.revision});
    }
    update([...names].join("; "),[...next.values()]);
  }
  const trText=(a:string,b:string)=>tr?a:b;
  const hint=trText("Bu kontrolün karşıladığı standartları ve ilgili gereksinim maddelerini seçin.","Select the standards and requirements this control addresses.");
  return <fieldset className="wide risk-editor-group control-framework"><legend>{trText("Çerçeve & Madde Eşleştirici","Framework & requirement mapping")}</legend><small>{hint}</small>
    {!allowed?<small>{trText("Çerçeve eşleştirmelerini görüntüleme yetkisi gerekiyor.","Permission to view framework mappings is required.")}</small>:
      result.error?<p role="alert">{trText("Aktif çerçeveler yüklenemedi.","Active frameworks could not be loaded.")} <button type="button" onClick={()=>retry(a=>a+1)}>{trText("Tekrar dene","Retry")}</button></p>:
      !result.data?<small role="status">{trText("Aktif çerçeveler yükleniyor…","Loading active frameworks…")}</small>:
      !programs.length?<p>{trText("Uyum Yönetimi’nde aktif çerçeve yok.","No active frameworks in Compliance Management.")}</p>:null}
    {result.data&&write&&programs.length>0&&<ChoiceInput tr={tr} label={trText("Aktif çerçeve ara","Search active frameworks")} query={query} onQuery={search}
      options={programs.filter(p=>!selected.has(p.name)&&normalizeRiskSearch(p.name).includes(normalizeRiskSearch(query))).map(p=>({value:p.name,label:p.name}))}
      choose={name=>apply(new Set([...selected,name]))}/>}
    <div className="risk-pills">{[...selected].map(name=>write&&result.data?<button type="button" key={name} aria-label={trText("Çerçeveyi kaldır · ","Remove framework · ")+name}
      onClick={()=>{selected.delete(name);for(const c of mapped.filter(c=>c.name===name))saveChange(name,c.ref,false);apply(selected)}}>{name} ×</button>:<span key={name}>{name}</span>)}</div>
    {result.data&&write&&programs.some(p=>selected.has(p.name))&&<ChoiceInput tr={tr} label={trText("Gereksinim kodu veya başlığı ara","Search requirement code or title")} query={reqQuery} onQuery={searchReq}
      options={programs.filter(p=>selected.has(p.name)).flatMap(p=>p.clauses.filter(c=>!(delta.get(key(p.name,c.ref))?.linked??c.linked)).map(c=>({value:key(p.name,c.ref),label:[p.name,c.ref,displayTitle(p.name,c.ref,c.title,tr)].join(" · ")}))).filter(o=>normalizeRiskSearch(o.label).includes(normalizeRiskSearch(reqQuery)))}
      choose={v=>{const [name,ref]=JSON.parse(v);saveChange(name,ref,true);apply(selected)}}/>}
    <div className="risk-pills">{mapped.map(c=>write?<button type="button" key={key(c.name,c.ref)} title={c.title} aria-label={trText("Maddeyi kaldır · ","Remove requirement · ")+c.name+" · "+c.ref}
      onClick={()=>{saveChange(c.name,c.ref,false);apply(selected)}}>{c.name} · {c.ref} ×</button>:<span key={key(c.name,c.ref)}>{c.name} · {c.ref}</span>)}</div>
    {changes.length>0&&<button type="button" className="risk-mode-link" onClick={()=>{update(tags,[]);retry(a=>a+1)}}>{trText("Madde değişikliklerini geri al ve kataloğu yenile","Discard requirement changes and reload the catalog")}</button>}
  </fieldset>;
}
