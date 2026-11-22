"use client";
import {useState} from "react";
import {ChoiceInput} from "./risk-editor-fields";
import {useChoices} from "./workflow-selection-fields";
import {kriLabel} from "./risk-appetite/labels";
import {recordLinkFragment,recordLinkTarget} from "./record-links";
import {navigateToFornost} from "./navigation-focus";

export type LinkedRisk={id:string;code?:string|null;title:string};
export function riskLabel(r:LinkedRisk){return [r.code||(/^RSK-\d{3,}$/i.test(r.id)?r.id:null),r.title].filter(Boolean).join(" · ")||"—"}
export function RiskMultiSelect({tr,selected,onChange}:{tr:boolean;selected:LinkedRisk[];onChange:(rows:LinkedRisk[])=>void}){
  const [query,setQuery]=useState("");
  const result=useChoices<{risks?:LinkedRisk[];more?:boolean}>("/api/risk-appetite?riskSearch="+encodeURIComponent(query));
  const available=(result.data.risks||[]).filter(r=>!selected.some(s=>s.id===r.id));
  return <div className="wide"><ChoiceInput tr={tr} label={tr?"İlgili Riskler (RSK-xxx)":"Related risks (RSK-xxx)"} query={query} onQuery={setQuery}
    options={available.map(r=>({value:r.id,label:riskLabel(r)}))} choose={id=>{const row=available.find(r=>r.id===id);if(row)onChange([...selected,row])}}
    pending={result.loading} more={result.data.more} message={result.error?(tr?"Riskler yüklenemedi.":"Could not load risks."):undefined}/>
    {result.error&&<button type="button" onClick={result.retry}>{tr?"Yeniden dene":"Retry"}</button>}
    <div className="rap-chips">{selected.map(r=><button type="button" key={r.id} aria-label={(tr?"Kaldır · ":"Remove · ")+riskLabel(r)} onClick={()=>onChange(selected.filter(s=>s.id!==r.id))}>{riskLabel(r)} ×</button>)}</div>
  </div>;
}
export function RiskLink({r,children}:{r:LinkedRisk;children:React.ReactNode}){
  const target={module:"Risk Assessment",kind:"record" as const,ref:r.id};
  if(!recordLinkTarget(target))return <button type="button" onClick={e=>{e.stopPropagation();navigateToFornost(target)}}>{children}</button>;
  return <a href={recordLinkFragment(target)} onClick={e=>{e.stopPropagation();if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&navigateToFornost(target))e.preventDefault()}}>{children}</a>;
}
export function thresholdOrder(form:Record<string,unknown>){
  const values=[form.appetiteTarget,form.warningThreshold,form.breachThreshold];
  if(values.some(v=>v==null||String(v).trim()===""||!Number.isFinite(Number(v))))return null;
  const [t,w,b]=values.map(Number);
  return form.direction==="upper"?t<w&&w<b:t>w&&w>b;
}
export function ToleranceBand({form,tr}:{form:Record<string,unknown>;tr:boolean}){
  const order=thresholdOrder(form),upper=form.direction==="upper",unit=String(form.metricUnit||""),w=String(form.warningThreshold),b=String(form.breachThreshold);
  const ranges=upper?["< "+w,w+" ≤ x < "+b,"≥ "+b]:["> "+w,b+" < x ≤ "+w,"≤ "+b];
  return <div className="wide rap-tolerance" aria-live="polite">
    {order===false&&<p role="alert">{upper?(tr?"Üst sınırda Hedef < Uyarı < İhlal olmalıdır.":"Upper limit requires Target < Warning < Breach."):(tr?"Alt sınırda Hedef > Uyarı > İhlal olmalıdır.":"Lower limit requires Target > Warning > Breach.")}</p>}
    <div className="rap-bands">{["green","amber","red"].map((band,i)=><div className={band} key={band}><b>{kriLabel(band,tr)}</b><span>{order?ranges[i]+" "+unit:"—"}</span></div>)}</div>
    {order&&<small>{tr?"İştah hedefi":"Appetite target"} · {String(form.appetiteTarget)} {unit}</small>}
  </div>;
}
