"use client";
import {useState} from "react";
import {ChoiceInput} from "../risk-editor-fields";
import {useChoices} from "../workflow-selection-fields";

export function AutomationPolicyFields({tr,reviewer,actor,owner,hours,select,changeHours}:{
  tr:boolean;reviewer:string;actor:string;owner:string;hours:number;select:(email:string)=>void;changeHours:(hours:number)=>void
}){
  const [query,search]=useState("");
  const choices=useChoices<{people?:{email:string;name:string}[];complete?:boolean}>("/api/grc/risk-owners?module=evidence&role=reviewer&q="+encodeURIComponent(query));
  const excluded=[actor,owner].map(s=>s.trim().toLowerCase());
  const options=(choices.data.people||[]).filter(p=>![p.email,p.name].some(v=>excluded.includes(v.toLowerCase()))).map(p=>({value:p.email,label:p.name+" · "+p.email}));
  return <>
    <label>{tr?"Kanıt Geçerlilik Süresi / Tazelik TTL":"Evidence validity / freshness TTL"}<select value={hours} onChange={e=>changeHours(Number(e.target.value))}>
      {![24,168,720,2160].includes(hours)&&<option value={hours} disabled>{hours} {tr?"saat · yeni süre seçin":"hours · select a new TTL"}</option>}
      {[24,168,720,2160].map(h=><option key={h} value={h}>{h===24?(tr?"24 Saat":"24 hours"):(h/24)+(tr?" Gün":" days")}</option>)}</select></label>
    <div className="ea-reviewer"><ChoiceInput tr={tr} label={tr?"Kanıt İnceleyeni (SoD)":"Evidence reviewer (SoD)"} query={query} onQuery={search} choose={select} options={options} required={!reviewer}
      requiredMessage={tr?"Bağımsız bir kanıt inceleyeni seçin.":"Choose an independent evidence reviewer."} pending={choices.loading} more={choices.data.complete===false}/>
      {reviewer&&<button type="button" className="ghost" onClick={()=>select("")}>{reviewer} ×</button>}
      {choices.error&&<button type="button" onClick={choices.retry}>{tr?"Kişi listesini yeniden yükle":"Reload user directory"}</button>}
    </div>
  </>;
}