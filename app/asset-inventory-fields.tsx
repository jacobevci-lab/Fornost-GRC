"use client";
import { useId, useMemo, useState, type ReactNode } from "react";
import type { ConnectedGrcRow } from "./connected-grc-model";
import { ChoiceInput, RiskPerson } from "./risk-editor-fields";
import { normalizeRiskSearch } from "./risk-record-options";
import { assetCoreFields, assetFieldGroups, regulatoryTags } from "./asset-inventory-model";
import "./asset-inventory.css";

type Props={tr:boolean;form:Record<string,unknown>;rows:ConnectedGrcRow[];id?:string;
  update:(patch:Record<string,unknown>)=>void;field:(key:string)=>ReactNode};
type Target={value:string;label:string;code:string;title:string;module:string};
function entity(row:ConnectedGrcRow):Target {
  const title=String(row.data.title||row.data.process||"");
  const code=[row.code,row.id].find(ref=>ref && /^(AST|BIA|VEN)-\d+$/i.test(ref))||"";
  return {value:row.id,title,code,module:row.module,label:[title,code].filter(Boolean).join(" · ")||"—"};
}
function findTarget(options:Target[],ref:string) {
  const exact=options.find(o=>o.value===ref);
  if(exact)return exact;
  const matches=options.filter(o=>o.code===ref||o.title===ref);
  return matches.length===1?matches[0]:undefined;
}
const tagValues=(v:unknown):string[]=>Array.isArray(v)?v.map(String):String(v||"").split(/[;,|\n]+/).map(s=>s.trim()).filter(Boolean);
function EntityField({tr,options,label,selected,choose,remove}:{tr:boolean;options:Target[];label:string;selected:string[];choose:(ref:string)=>void;remove:(ref:string)=>void}) {
  const [query,setQuery]=useState("");
  const chosen=new Set(selected.map(v=>findTarget(options,v)?.value));
  const search=normalizeRiskSearch(query);
  const matches=options.filter(o=>!chosen.has(o.value)&&normalizeRiskSearch(o.label+" "+o.value).includes(search));
  return <div className="risk-editor-group asset-entity">
    <ChoiceInput tr={tr} label={label} query={query} onQuery={setQuery} options={matches} choose={choose}/>
    <div className="risk-pills">{selected.map(v=>{
      const title=findTarget(options,v)?.label||v;
      return <button type="button" key={v} onClick={()=>remove(v)} aria-label={(tr?"Kaldır · ":"Remove · ")+title}>{title} ×</button>;
    })}</div>
  </div>;
}
export function AssetInventoryFields({form,rows,id,field,tr,update}:Props){
  const [advanced,setAdvanced]=useState(false),[section,setSection]=useState(0);
  const groupId=useId();
  const options=useMemo(()=>rows.filter(row=>row.id!==id && ["Varlık Envanteri","BIA","Tedarikçiler"].includes(row.module)).map(entity),[rows,id]);
  const vendors=options.filter(o=>o.module==="Tedarikçiler"),vendor=String(form.vendor||"");
  const [manual,setManual]=useState(()=>Boolean(form.externalVendor || (vendor && !findTarget(vendors,vendor))));
  const dependencies=tagValues(form.dependencyRefs),tags=tagValues(form.regulatoryScope);
  function render(key:string){
    if(key==="owner")return <RiskPerson tr={tr} form={form} update={update} field="owner" asset/>;
    if(key==="vendor")return <div className="asset-picker wide">
      {manual?<label>{tr?"Üretici / Tedarikçi":"Manufacturer / vendor"}<input name="externalVendor" value={String(form.externalVendor??vendor)}
        onChange={e=>update({externalVendor:e.target.value,vendor:""})}/></label>:
        <EntityField tr={tr} options={vendors} label={tr?"Üretici / Tedarikçi ara":"Search manufacturer / vendor"} selected={vendor?[vendor]:[]}
          choose={ref=>update({vendor:ref,externalVendor:""})} remove={()=>update({vendor:""})}/>}
      <button type="button" className="risk-mode-link" onClick={()=>{setManual(!manual);update({vendor:"",externalVendor:""});}}>
        {manual?(tr?"Tedarikçi dizininden seç":"Choose a registered vendor"):(tr?"Kayıtlı olmayan üretici gir":"Enter an unregistered manufacturer")}</button>
    </div>;
    if(key==="dependencies")return <div className="asset-picker wide">
      <EntityField tr={tr} options={options.filter(o=>o.module!=="Tedarikçiler")} label={tr?"Kritik bağımlılık ara (varlık / BIA)":"Search critical dependencies (asset / BIA)"}
        selected={dependencies} choose={ref=>update({dependencyRefs:[...new Set([...dependencies,ref])]})}
        remove={ref=>update({dependencyRefs:dependencies.filter(v=>v!==ref)})}/>
      {form.dependencies ? <small>{tr?"Önceki bağımlılık notu":"Previous dependency note"} · {String(form.dependencies)}</small>:null}
    </div>;
    if(key==="regulatoryScope")return <fieldset className="wide asset-tags"><legend>{tr?"Yasal / Düzenleyici Kapsam":"Legal / regulatory scope"}</legend>
      {[...new Set([...regulatoryTags,...tags])].map(tag=><button key={tag} type="button" aria-pressed={tags.includes(tag)}
        onClick={()=>update({regulatoryScope:(tags.includes(tag)?tags.filter(t=>t!==tag):[...tags,tag]).join("; ")})}>{tag}</button>)}
    </fieldset>;
    return field(key);
  }
  return <>
    <div className="asset-form-grid wide">{assetCoreFields.map(key=><div key={key}>{render(key)}</div>)}</div>
    <div className="wide asset-advanced">
      <button type="button" aria-expanded={advanced} aria-controls={groupId} onClick={()=>setAdvanced(!advanced)}>
        {advanced?(tr?"Gelişmiş alanları gizle":"Hide advanced fields"):(tr?"Gelişmiş alanları göster":"Show advanced fields")}</button>
      <div id={groupId} hidden={!advanced}>
        <div className="asset-sections" role="group" aria-label={tr?"Gelişmiş alan grupları":"Advanced field groups"}>
          {assetFieldGroups.map((g,i)=><button key={g.en} type="button" aria-pressed={section===i} onClick={()=>setSection(i)}>{tr?g.tr:g.en}</button>)}
        </div>
        <fieldset className="asset-form-grid"><legend>{tr?assetFieldGroups[section].tr:assetFieldGroups[section].en}</legend>
          {assetFieldGroups[section].fields.map(key=><div key={key} className={["vendor","dependencies","regulatoryScope","description"].includes(key)?"wide":undefined}>{render(key)}</div>)}
        </fieldset>
      </div>
    </div>
  </>;
}
