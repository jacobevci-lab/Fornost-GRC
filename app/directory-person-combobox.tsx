"use client";
import {useState} from "react";
import {ChoiceInput} from "./risk-editor-fields";
import {useChoices} from "./workflow-selection-fields";

export function DirectoryPersonCombobox({label,value,choose,exclude,reviewer=false,tr}:{label:string;value:string;choose:(email:string)=>void;exclude:string[];reviewer?:boolean;tr:boolean}){
  const [query,setQuery]=useState("");
  const choices=useChoices("/api/workflow-choices?kind=people&reviewer="+reviewer+"&q="+encodeURIComponent(query));
  const excluded=new Set(exclude.map(s=>s.toLowerCase()));
  const options=(choices.data.people||[]).filter(p=>!excluded.has(p.email.toLowerCase())).map(p=>({value:p.email,label:p.name+" · "+p.email}));
  return <div className="tprm-person">
    <ChoiceInput label={label} tr={tr} query={query} onQuery={setQuery} choose={choose} options={options}
      pending={choices.loading} more={choices.data.complete===false} required={!value}
      requiredMessage={tr?"Listeden bir kullanıcı seçin.":"Choose a user from the list."}
      message={choices.error?(tr?"Kullanıcılar yüklenemedi.":"Directory unavailable."):undefined}/>
    {value&&<button type="button" className="tprm-chip" onClick={()=>choose("")} aria-label={(tr?"Kaldır · ":"Remove · ")+value}>{value} ×</button>}
    {choices.error&&<button type="button" onClick={choices.retry}>{tr?"Yeniden dene":"Retry"}</button>}
  </div>;
}
