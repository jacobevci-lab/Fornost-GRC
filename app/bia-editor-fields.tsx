"use client";
import {Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode} from "react";
import {ChoiceInput} from "./risk-editor-fields";
import {EntityField,entity} from "./asset-inventory-fields";
import {useChoices} from "./workflow-selection-fields";
import {biaCoreFields,biaRecoveryFields,biaSections,biaImpact,exceedsMtpd,mtpdWarning,sameBiaPerson,sodWarning} from "./bia-assessment";
import type {ConnectedGrcRow} from "./connected-grc-model";
import "./bia-register.css";

type Data=Record<string,unknown>;
type Editor={tr:boolean;form:Data;update:(patch:Data)=>void};
function Person({tr,form,update,role}:{role:"owner"|"approver"} & Editor) {
  const [q,setQ]=useState("");
  const directory=useChoices<{people?:{name:string;email:string}[];complete?:boolean}>("/api/grc/risk-owners?module=bia&q="+encodeURIComponent(q));
  const emailKey=role+"Email",name=String(form[role]||""),email=String(form[emailKey]||"");
  const label=role==="owner"?(tr?"Sahibi":"Owner"):(tr?"BIA Onaylayan":"BIA approver");
  const matches=(directory.data.people||[]).filter(p=>!sameBiaPerson({...form,[role]:p.name||p.email,[emailKey]:p.email}));
  return <fieldset className="risk-editor-group"><legend>{label}</legend>
    {name && <div className="risk-pills"><button type="button" aria-label={(tr?"Kaldır · ":"Remove · ")+name}
      onClick={()=>update({[role]:"",[emailKey]:"",[role+"Source"]:""})}>{[name,email].filter(Boolean).join(" · ")} ×</button></div>}
    <ChoiceInput tr={tr} label={label+(tr?" · ad veya e-posta ara":" · search name or email")} query={q} onQuery={setQ}
      options={matches.map(p=>({value:p.email,label:[p.name,p.email].filter(Boolean).join(" · ")}))}
      requiredMessage={tr?"Dizinden bir sahip seçin.":"Select an owner from the directory."} pending={directory.loading} more={directory.data.complete===false} required={role==="owner"&&!name}
      message={directory.error?(tr?"Kullanıcı dizini yüklenemedi.":"User directory unavailable."):undefined}
      choose={ref=>{const p=matches.find(candidate=>candidate.email===ref);if(p)update({[role]:p.name||p.email,[emailKey]:p.email,[role+"Source"]:"directory"});}}/>
    {directory.error && <button type="button" onClick={directory.retry}>{tr?"Yeniden dene":"Retry"}</button>}
    {role==="approver" && <small>{sodWarning[tr?"tr":"en"]}</small>}
  </fieldset>;
}

export function BiaFields({tr,form,update,rows,field}:Editor & {rows:ConnectedGrcRow[];field:(key:string)=>ReactNode}){
  const [advanced,setAdvanced]=useState(false),[section,setSection]=useState(0);
  const id=useId(),rto=useRef<HTMLInputElement>(null),lang=tr?"tr":"en";
  const invalid=exceedsMtpd(form),impact=biaImpact(form);
  const targets=useMemo(()=>rows.filter(r=>["Varlık Envanteri","Tedarikçiler"].includes(r.module)).map(entity),[rows]);
  useEffect(()=>{rto.current?.setCustomValidity(invalid?mtpdWarning[lang]:"");},[lang,invalid]);
  function render(key:string):ReactNode {
    if(key==="owner" || key==="approver")return <Person role={key} tr={tr} form={form} update={update}/>;
    if(biaRecoveryFields.includes(key))return <label>{(key==="mtpd"?"MTPD / MAO":key.toUpperCase())+(tr?" (saat)":" (hours)")}
      <input name={key} type="number" step="any" min="0" required={key!=="mtpd"} value={String(form[key]??"")}
        ref={key==="rto"?rto:undefined} aria-invalid={key==="rto" && invalid || undefined} aria-describedby={key==="rto"&&invalid?id+"-error":undefined}
        onChange={e=>update({[key]:e.target.value})}/>
      {key==="rto" && invalid && <small className="bia-warning" role="alert" id={id+"-error"}>{mtpdWarning[lang]}</small>}</label>;
    if(key==="technologyDependency"||key==="supplierDependency"){
      const tech=key==="technologyDependency",refsKey=tech?"technologyRefs":"supplierRefs",value=form[refsKey];
      const refs=Array.isArray(value)?value.map(String):[];
      const label=tech?(tr?"Teknoloji / Sistem Bağımlılığı":"Technology / system dependencies"):(tr?"Tedarikçi Bağımlılığı":"Supplier dependencies");
      return <div><EntityField tr={tr} label={label} options={targets.filter(t=>t.module===(tech?"Varlık Envanteri":"Tedarikçiler"))}
        selected={refs} choose={ref=>update({[refsKey]:[...new Set([...refs,ref])]})} remove={ref=>update({[refsKey]:refs.filter(item=>item!==ref)})}/>
        {Boolean(form[key]) && <small>{tr?"Önceki bağımlılık notu":"Previous dependency note"} · {String(form[key])}</small>}</div>;
    }
    return field(key);
  }
  const group=biaSections[section];
  function switchTab(next:number){setSection(next);document.getElementById(id+"-tab-"+next)?.focus();}
  return <>
    <div className="asset-form-grid wide">
      {biaCoreFields.filter(k=>!biaRecoveryFields.includes(k)).map(k=><div key={k} className={k==="description"?"wide":undefined}>{render(k)}</div>)}
      <fieldset className="wide risk-editor-group"><legend>{tr?"Kurtarma hedefleri":"Recovery targets"}</legend>
        <div className="bia-recovery-fields">{biaRecoveryFields.map(k=><div key={k}>{render(k)}</div>)}</div>
      </fieldset>
    </div>
    <div className="wide asset-advanced"><button type="button" aria-expanded={advanced} aria-controls={id+"-advanced"} onClick={()=>setAdvanced(!advanced)}>
      {advanced?(tr?"Gelişmiş alanları gizle":"Hide advanced fields"):(tr?"Gelişmiş alanları göster":"Show advanced fields")}</button>
      <div id={id+"-advanced"} hidden={!advanced}>
        <div role="tablist" aria-label={tr?"BIA gelişmiş alanları":"Advanced BIA fields"} className="asset-sections">
          {biaSections.map((g,i)=><button type="button" role="tab" aria-selected={section===i} tabIndex={section===i?0:-1} id={id+"-tab-"+i}
            aria-controls={id+"-panel"} key={g.en} onClick={()=>setSection(i)} onKeyDown={e=>{
              const next=({ArrowRight:(i+1)%4,ArrowLeft:(i+3)%4,Home:0,End:3} as Record<string,number>)[e.key];
              if(next!==undefined){e.preventDefault();switchTab(next);}
            }}>{g[lang]}</button>)}
        </div>
        <div className="asset-form-grid" role="tabpanel" id={id+"-panel"} aria-labelledby={id+"-tab-"+section}>
          {group.fields.map(k=><Fragment key={k}><div>{render(k)}</div>{k==="dataImpact" && <output className="wide bia-impact" aria-live="polite">
            <b>{tr?"Bileşik İş Etkisi Özeti":"Composite business impact"}</b>
            <span>{tr?"En Yüksek Etki":"Highest impact"} · {impact.highest??"—"}</span>
            <span>{tr?"Ortalama Skor":"Average score"} · {impact.average?.toLocaleString(lang,{maximumFractionDigits:2})??"—"}</span>
            <small>{impact.count}/6 {tr?"boyut değerlendirildi":"dimensions assessed"}</small></output>}</Fragment>)}
        </div>
      </div>
    </div>
  </>;
}
