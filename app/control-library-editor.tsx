"use client";
import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from "react";
import {ChoiceInput} from "./risk-editor-fields";
import {useChoices} from "./workflow-selection-fields";
import {EntityField} from "./asset-inventory-fields";
import {controlTypes,controlTypeKey,sameControlTester} from "./control-library-model";
import type {ConnectedGrcRow} from "./connected-grc-model";
import type {ControlMappingChange} from "./framework-posture/types";
import {ControlFrameworkPicker} from "./control-framework-picker";

type Data=Record<string,unknown>;
type Contact={name:string;email:string};
type Role="owner"|"evidenceOwner"|"testOwner";
function ControlPerson({role,tr,form,update}:{role:Role;tr:boolean;form:Data;update:(p:Data)=>void}){
  const [q,search]=useState("");
  const directory=useChoices<{people?:Contact[];complete?:boolean}>("/api/grc/risk-owners?module=control&q="+encodeURIComponent(q));
  const label={owner:["Sahibi","Owner"],evidenceOwner:["Kanıt Sorumlusu","Evidence owner"],testOwner:["Kontrol Test Sorumlusu","Control test owner"]}[role][tr?0:1];
  const patch=(p?:Contact)=>({[role]:p?.name||p?.email||"",[role+"Email"]:p?.email||"",[role+"Source"]:p?"directory":""});
  const choices=(directory.data.people||[]).filter(p=>role==="evidenceOwner"||!sameControlTester({...form,...patch(p)}));
  return <div className="risk-editor-group"><ChoiceInput label={label} tr={tr} query={q} onQuery={search} required={role==="owner"&&!form.owner}
    requiredMessage={tr?"Dizinden bir kontrol sahibi seçin.":"Select a control owner from the directory."}
    options={choices.map(p=>({value:p.email,label:p.name+" · "+p.email}))} choose={email=>{const p=choices.find(p=>p.email===email);if(p)update(patch(p))}}
    pending={directory.loading} more={directory.data.complete===false} message={directory.error?(tr?"Kullanıcı dizini yüklenemedi.":"Directory unavailable."):undefined}/>
    {Boolean(form[role])&&<div className="risk-pills"><button type="button" onClick={()=>update(patch())}>{[...new Set([form[role],form[role+"Email"]].filter(Boolean))].join(" · ")} ×</button></div>}
    {directory.error&&<button type="button" onClick={directory.retry}>{tr?"Tekrar dene":"Retry"}</button>}</div>;
}
export function ControlLibraryEditor({id,form,update,rows,tr,field,evidenceFirst,readPosture,writePosture,readRisks,readEvidence,incoming,changes,setChanges}:{
  id?:string;form:Data;update:(p:Data)=>void;rows:ConnectedGrcRow[];tr:boolean;field:(key:string)=>ReactNode;evidenceFirst:boolean;
  incoming?:Set<string>;readPosture:boolean;writePosture:boolean;readRisks:boolean;readEvidence:boolean;changes:ControlMappingChange[];setChanges:(changes:ControlMappingChange[])=>void;
}){
  const [advanced,show]=useState(evidenceFirst),region=useId(),evidence=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!evidenceFirst)return;
    const frame=requestAnimationFrame(()=>evidence.current?.querySelector<HTMLInputElement>("input")?.focus());
    return ()=>cancelAnimationFrame(frame);
  },[evidenceFirst]);
  const options=useMemo(()=>rows.filter(r=>["Kanıtlar","Risk Assessment"].includes(r.module)).map(r=>{
    const code=[r.code,r.id].find(v=>v&&/^(EVD|RSK)-\d+$/i.test(v))||"",title=String(r.data.evidenceTitle||r.data.title||"");
    return {value:r.id,code,title,module:r.module,label:[code,title].filter(Boolean).join(" · ")||"—"};
  }),[rows]);
  function links(k:"controlRiskRefs"|"supportingEvidenceRefs",module:string,label:string){
    const values=Array.isArray(form[k])?form[k] as string[]:[];
    const library=options.filter(o=>o.module===module);
    const inherited=library.filter(o=>incoming?.has(o.value));
    return <div><EntityField tr={tr} options={library.filter(o=>!incoming?.has(o.value)||values.some(v=>v===o.value||v===o.code))} label={label} selected={values}
      choose={id=>update({[k]:[...new Set([...values,id])]})} remove={id=>update({[k]:values.filter(v=>v!==id)})}/>
      {inherited.length>0&&<div className="risk-editor-group"><small>{tr?"İlgili kayıttan bağlandı":"Linked from the related record"}</small><div className="risk-pills">{inherited.map(o=><span key={o.value}>{o.label}</span>)}</div></div>}</div>;
  }
  const input=(k:string,label:string,required=false,type="text")=><label>{label}<input type={type} name={k} value={String(form[k]||"")} required={required} onChange={e=>update({[k]:e.target.value})}/></label>;
  const type=controlTypeKey(form.controlType),same=sameControlTester(form);
  return <div className="wide control-editor"><div className="control-field-grid">
    {input("controlTitle",tr?"Kontrol Başlığı":"Control title",true)}{input("controlRef",tr?"İç Referans Kodu (İsteğe Bağlı)":"Internal reference code (optional)")}
    <ControlPerson role="owner" tr={tr} form={form} update={update}/>{field("frequency")}{field("implementation")}{field("status")}
    <ControlFrameworkPicker tr={tr} id={id} tags={String(form.frameworks||"")} allowed={readPosture} write={writePosture} changes={changes}
      update={(tags,next)=>{update({frameworks:tags});setChanges(next)}}/>
  </div>
  <button type="button" className="risk-mode-link" aria-controls={region} aria-expanded={advanced} onClick={()=>show(!advanced)}>{advanced?(tr?"Gelişmiş alanları gizle":"Hide advanced fields"):(tr?"Gelişmiş alanları göster":"Show advanced fields")}</button>
  {same&&<p role="alert" className="bia-warning">{tr?"Kontrol sahibi ve kontrol test sorumlusu farklı kişiler olmalıdır.":"The control owner and control tester must be different people."}</p>}
  <div id={region} hidden={!advanced}><div className="control-field-grid">
    {field("description")}{field("businessUnit")}
    <label>{tr?"Kontrol Türü":"Control type"}<select name="controlType" value={type} onChange={e=>update({controlType:e.target.value})}>
      <option value="">{tr?"Seçin":"Select"}</option>{type&&!Object.hasOwn(controlTypes,type)&&<option value={type}>{type}</option>}
      {Object.entries(controlTypes).map(([k,n])=><option key={k} value={k}>{n[tr?0:1]}</option>)}</select></label>
    {field("controlObjective")}<ControlPerson role="evidenceOwner" tr={tr} form={form} update={update}/><ControlPerson role="testOwner" tr={tr} form={form} update={update}/>
    {input("lastTestDate",tr?"Son Kontrol Testi":"Last control test",false,"date")}{field("nextTestDate")}{field("testResult")}
    {readRisks&&links("controlRiskRefs","Risk Assessment",tr?"Bağlı Riskler (RSK-xxx)":"Linked risks (RSK-xxx)")}
    {readEvidence&&<div ref={evidence}>{links("supportingEvidenceRefs","Kanıtlar",tr?"Destekleyici Kanıtlar (EVD-xxx)":"Supporting evidence (EVD-xxx)")}</div>}
  </div></div></div>;
}
