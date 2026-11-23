"use client";
import {createContext,useContext,useEffect,useMemo,useRef,useState} from "react";
import {ChoiceInput} from "./risk-editor-fields";
import {EntityField} from "./asset-inventory-fields";
import {useChoices} from "./workflow-selection-fields";
import {frameworkNames,programName} from "./framework-posture/catalog";
import {navigateToFornost} from "./navigation-focus";
import {normalizeRiskSearch,type RiskRecordOptions} from "./risk-record-options";
import type {ConnectedGrcRow} from "./connected-grc-model";
import {EVIDENCE_FILE_ACCEPT,EVIDENCE_FILE_HELP,EVIDENCE_MAX_BYTES} from "./evidence/file-types";
import {evidenceDatesInvalid,evidenceState,localDay,validityDate} from "./evidence/intake";
import "./evidence-library-fields.css";

type Data=Record<string,unknown>;
type Update=(patch:Data)=>void;
const tokens=(v:unknown)=>String(v||"").split(/[;,|\n]/).map(s=>s.trim()).filter(Boolean);
export const EvidenceControlsContext=createContext<RiskRecordOptions|null>(null);
export function EvidenceControlsCell({data}:{data:Data}){
  const controls=useContext(EvidenceControlsContext);
  const refs=[...new Set(tokens(data.controlRefs||data.controlRef))];
  return refs.length?<div className="asset-link-counts">{refs.map(ref=>{
    const row=controls?.resolve(ref);
    if(!row)return <span key={ref}>{/^CTL-[a-f0-9-]{36}$/i.test(ref)?"—":ref}</span>;
    return <button type="button" key={ref} title={String(row.data.controlTitle||"")} onClick={()=>navigateToFornost({module:"Kontroller",kind:"record",ref:row.id})}>
      {([row.code,row.id].find(v=>v&&/^CTL-\d+$/i.test(v)))||String(row.data.controlTitle||"—")}</button>;
  })}</div>:<>—</>;
}
type Actor={email:string;name?:string};
type Person={name:string;email:string};
function PersonField({role,tr,data,update}:{role:"owner"|"reviewer";tr:boolean;data:Data;update:Update}){
  const [q,search]=useState("");
  const people=useChoices<{people?:Person[];complete?:boolean}>("/api/grc/risk-owners?module=evidence&role="+role+"&q="+encodeURIComponent(q));
  const label=role==="owner"?(tr?"Sahibi":"Owner"):(tr?"İnceleyen":"Reviewer");
  const excluded=(role==="owner"?[data.reviewer]:[data.owner,data.uploadedBy,data.versionUploadedBy]).map(v=>String(v||"").trim().toLowerCase()).filter(Boolean);
  const options=(people.data.people||[]).filter(p=>![p.name,p.email].some(v=>excluded.includes(v.toLowerCase()))).map(p=>({value:p.email,label:p.name+" · "+p.email}));
  return <div><ChoiceInput tr={tr} label={label} options={options} query={q} onQuery={search} choose={value=>update({[role]:value})}
    required={role==="owner"&&!data.owner} requiredMessage={tr?"Dizinden bir sahip seçin.":"Select an owner from the directory."} pending={people.loading} more={people.data.complete===false}/>
    <div className="risk-pills">{Boolean(data[role])&&<button type="button" onClick={()=>update({[role]:""})}>{String(data[role])} ×</button>}</div>
    {people.error&&<button type="button" onClick={people.retry}>{tr?"Dizini yeniden yükle":"Reload directory"}</button>}</div>;
}

function EvidenceFile({tr,onFile,title,update}:{tr:boolean;onFile:(file:File|null)=>void;title:string;update:Update}){
  const ref=useRef<HTMLInputElement>(null),generation=useRef(0),[file,setFile]=useState<File|null>(null),[hash,setHash]=useState(""),[error,setError]=useState(false),[drag,setDrag]=useState(false);
  async function select(f:File|undefined){
    const revision=++generation.current;setFile(f||null);setHash("");setError(false);onFile(null);
    if(!f)return;
    if(!title.trim())update({evidenceTitle:f.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim()||f.name});
    if(!f.size||f.size>EVIDENCE_MAX_BYTES){setError(true);return}
    try{
      const content=await f.arrayBuffer();
      const bytes=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest("SHA-256",content)):(await import("@noble/hashes/sha2")).sha256(new Uint8Array(content));
      if(revision!==generation.current)return;
      setHash(Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join(""));onFile(f);
    }catch{if(revision===generation.current)setError(true)}
  }
  return <div className={"ev-drop wide"+(drag?" dragging":"")} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
    onDrop={e=>{e.preventDefault();setDrag(false);void select(e.dataTransfer.files[0])}}>
    <input hidden ref={ref} type="file" name="file" accept={EVIDENCE_FILE_ACCEPT} onChange={e=>void select(e.target.files?.[0])}/>
    <div><button type="button" onClick={()=>ref.current?.click()}>{tr?"Dosya seç":"Choose file"}</button> {tr?"veya dosyayı buraya bırakın":"or drop a file here"}</div>
    {file&&<div aria-live="polite"><strong>{file.name}</strong> · {file.size.toLocaleString(tr?"tr-TR":"en-US")} {tr?"bayt":"bytes"}
      {hash?<small>SHA-256 <code>{hash}</code></small>:!error&&<small>{tr?"SHA-256 hesaplanıyor…":"Calculating SHA-256…"}</small>}</div>}
    {error&&<p role="alert">{tr?"Dosya okunamadı. Boyutunu kontrol edip yeniden seçin.":"Unable to read the file. Check its size and select it again."}</p>}
    <small>{EVIDENCE_FILE_HELP[tr?"tr":"en"]}</small></div>;
}

export function EvidenceLibraryFields({tr,form,rows,actor,editing,allowPosture,update,onFile}:{tr:boolean;form:Data;rows:ConnectedGrcRow[];actor:Actor;editing:boolean;allowPosture:boolean;update:Update;onFile:(file:File|null)=>void}){
  const [q,search]=useState("");
  const catalog=useChoices<{byControl?:Record<string,string[]>;enrolled?:string[]}>(allowPosture?"/api/framework-posture?evidenceControls=1":null);
  const controls=useMemo(()=>rows.filter(r=>r.module==="Kontroller").map(r=>({value:r.code||r.id,code:r.code||"",title:String(r.data.controlTitle||""),label:[r.code,r.data.controlTitle].filter(Boolean).join(" · "),module:r.module,record:r})),[rows]);
  const refs=tokens(form.controlRefs||form.controlRef);
  const find=(v:string)=>controls.find(o=>[o.value,o.record.id,o.record.data.controlRef].includes(v));
  const mapped=(values:string[])=>new Set(values.flatMap(v=>{const c=find(v);return c?[...tokens(c.record.data.frameworks),...(catalog.data.byControl?.[c.record.id]||[])].map(programName):[]}));
  function setRefs(next:string[]){
    const old=mapped(refs),added=mapped(next);
    const extra=tokens(form.frameworks).filter(name=>!old.has(name));
    update({controlRefs:next.join(", "),controlRef:next[0]||"",controlTitle:"",frameworks:[...new Set([...extra,...added])].join("; ")});
  }
  const selected=new Set(tokens(form.frameworks)),suggested=mapped(refs);
  const inferred=[...suggested].join("; ");
  useEffect(()=>{
    const existing=new Set(tokens(form.frameworks)),previous=existing.size;
    for(const value of tokens(inferred))existing.add(value);
    if(previous!==existing.size)update({frameworks:[...existing].join("; ")});
  },[form.frameworks,inferred,update]);
  const sources=rows.filter(r=>["Varlık Envanteri","Tedarikçiler"].includes(r.module)).map(r=>{
    const name=String(r.data.title||r.data.vendorName||r.data.assetName||r.code||"");
    return {value:r.id,label:[r.code,name].filter(Boolean).join(" · "),name,module:r.module};
  });
  const query=q.trim(),filtered=sources.filter(r=>normalizeRiskSearch(r.label).includes(normalizeRiskSearch(query)));
  const dateError=evidenceDatesInvalid(form);
  const input=(key:string,label:string,type="text",required=false)=><label>{label}<input type={type} name={key} required={required} value={String(form[key]||"")} onChange={e=>update({[key]:e.target.value})}/></label>;
  const peopleData=editing?form:{...form,uploadedBy:actor.email};
  return <div className="ev-library-fields wide">
    {!editing&&<EvidenceFile tr={tr} onFile={onFile} title={String(form.evidenceTitle||"")} update={update}/>}
    {input("evidenceTitle",tr?"Kanıt Başlığı":"Evidence title","text",true)}
    <label>{tr?"Durum":"Status"}<output>{evidenceState(editing?form:{status:"İncelemede"},tr)}</output></label>
    <PersonField tr={tr} data={peopleData} role="owner" update={update}/><PersonField tr={tr} data={peopleData} role="reviewer" update={update}/>
    <div className="wide"><EntityField tr={tr} label={tr?"İlgili Kontroller":"Related controls"} options={refs.length<100?controls:controls.filter(c=>refs.includes(c.value))} selected={refs} choose={ref=>setRefs([...new Set([...refs,ref])])} remove={ref=>setRefs(refs.filter(r=>r!==ref))}/>
      {refs.length>=100&&<small>{tr?"En fazla 100 kontrol seçilebilir.":"Up to 100 controls can be linked."}</small>}
      {catalog.error&&<button type="button" onClick={catalog.retry}>{tr?"Çerçeve eşleştirmelerini yeniden yükle":"Reload framework mappings"}</button>}</div>
    <fieldset className="wide ev-standards"><legend>{tr?"Kullanıldığı Standartlar":"Applicable standards"}</legend>
    {[...new Set([...frameworkNames,...selected,...suggested])].map(name=><label key={name}><input type="checkbox" checked={selected.has(name)||suggested.has(name)} disabled={suggested.has(name)} onChange={e=>{if(e.target.checked)selected.add(name);else selected.delete(name);update({frameworks:[...new Set([...selected,...suggested])].join("; ")})}}/>{name}</label>)}</fieldset>
    {input("period",tr?"Kanıt Dönemi":"Evidence period","text",true)}
    <div><ChoiceInput label={tr?"Kaynak Sistem":"Source system"} tr={tr} query={q} onQuery={search} options={[...filtered,...(query?[{value:"free",label:(tr?"Sistem adı olarak kullan · ":"Use system name · ")+query}]:[])]} choose={v=>{
      const r=sources.find(s=>s.value===v);update({sourceSystem:r?.name||query,sourceAssetRef:r?.module==="Varlık Envanteri"?v:"",sourceVendorRef:r?.module==="Tedarikçiler"?v:""});
    }}/>{Boolean(form.sourceSystem)&&<div className="risk-pills"><button type="button" onClick={()=>update({sourceSystem:"",sourceAssetRef:"",sourceVendorRef:""})}>{sources.find(r=>r.value===(form.sourceAssetRef||form.sourceVendorRef))?.label||String(form.sourceSystem)} ×</button></div>}</div>
    {input("collectedAt",tr?"Toplanma Tarihi":"Collection date","date")}
    <div><label>{tr?"Geçerlilik Bitişi":"Valid until"}<input type="date" name="expiresAt" value={String(form.expiresAt||"")} min={String(form.collectedAt||"")} aria-invalid={dateError} onChange={e=>update({expiresAt:e.target.value})}/></label>
      <div className="risk-pills">{(["30","90","6m","1y"] as const).map((v,i)=><button key={v} type="button" onClick={()=>update({expiresAt:validityDate(String(form.collectedAt||localDay()),v)})}>{(tr?["+30 Gün","+90 Gün","+6 Ay","+1 Yıl"]:["+30 days","+90 days","+6 months","+1 year"])[i]}</button>)}</div>
      {dateError&&<small role="alert">{tr?"Geçerlilik bitişi toplanma tarihinden önce olamaz.":"Expiry cannot precede collection."}</small>}</div>
    <label className="wide">{tr?"Notlar":"Notes"}<textarea name="notes" value={String(form.notes||"")} onChange={e=>update({notes:e.target.value})}/></label>
  </div>;
}
