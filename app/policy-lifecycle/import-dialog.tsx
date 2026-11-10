"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {withBasePath} from "../base-path";
import {WorkflowPersonPicker} from "../workflow-selection-fields";
import {POLICY_CATEGORIES,POLICY_CLASSIFICATIONS} from "./domain";
import {policyImportFileLimit,policyImportTextLimit,importMessage} from "./import-format";

type PolicyOption={id:string;code:string;title:string;status:string};
const endpoint=withBasePath("/api/policy-lifecycle");
const turkishOptions:Record<string,string>={security:"Güvenlik",privacy:"Gizlilik",risk:"Risk",compliance:"Uyum",technology:"Teknoloji",people:"İnsan kaynakları",operations:"Operasyon",public:"Kamuya açık",internal:"Kurum içi",confidential:"Gizli",restricted:"Kısıtlı"};
const newRequestId=()=>"PIM-"+crypto.randomUUID();
export function PolicyImportForm({tr,email,policies,onSaved,onBusy}:{tr:boolean;email:string;policies:PolicyOption[];onSaved:(id:string)=>void;onBusy:(busy:boolean)=>void}){
 const [file,setFile]=useState<File|null>(null),[phase,setPhase]=useState<"choose"|"reading"|"ready"|"saving">("choose");
 const [message,setMessage]=useState(""),[warning,setWarning]=useState(false),[content,setContent]=useState("");
 const [mode,setMode]=useState("new"),[target,setTarget]=useState("");
 const [code,setCode]=useState(""),[title,setTitle]=useState(""),[owner,setOwner]=useState(""),[reviewer,setReviewer]=useState("");
 const [category,setCategory]=useState("security"),[classification,setClassification]=useState("internal"),[frequency,setFrequency]=useState(365);
 const [audience,setAudience]=useState(tr?"Tüm çalışanlar":"All employees"),[effectiveDate,setDate]=useState(""),[summary,setSummary]=useState("");
 const [controls,setControls]=useState(""),[regulations,setRegulations]=useState(""),[risks,setRisks]=useState("");
 const suggestedTitle=useRef("");
 const generation=useRef(0),transport=useRef<AbortController|null>(null),saving=useRef(false),identity=useRef({draft:"",id:""});
 useEffect(()=>()=>{generation.current++;transport.current?.abort();},[]);
 const say=(turkish:string,english:string)=>tr?turkish:english;
 async function readFile(selected:File|undefined){
  const serial=++generation.current;transport.current?.abort();
  setFile(null);setContent("");setMessage("");setWarning(false);setPhase("choose");identity.current={draft:"",id:""};
  if(!selected)return;
  const limit=policyImportFileLimit(selected.name);
  if(!limit||!selected.size||selected.size>limit){setMessage(importMessage(!limit?"file":"size",tr));return;}
  setPhase("reading");const controller=new AbortController();transport.current=controller;
  const deadline=setTimeout(()=>controller.abort(),60000);
  try{
   // Validate the ZIP container before giving compressed Word content to a browser parser.
   if(/\.docx$/i.test(selected.name)){
    const form=new FormData();form.set("file",selected);form.set("operation","preview");
    const res=await fetch(endpoint,{method:"POST",body:form,signal:controller.signal});
    if(!res.ok)throw new Error((await res.json().catch(()=>({}))).code||(res.status===403?"access":"unavailable"));
   }
   const {extractKnowledgeDocument}=await import("../ai/document-extraction");
   const result=await extractKnowledgeDocument(selected,false);
   if(serial!==generation.current)return;
   setFile(selected);setContent(result.content);setWarning(Boolean(result.warning));setPhase("ready");
   const suggestion=selected.name.replace(/\.(docx|pdf)$/i,"").replace(/[_-]/g," ").trim().slice(0,240);
   const last=suggestedTitle.current;setTitle(previous=>!previous||previous===last?suggestion:previous);suggestedTitle.current=suggestion;
   setSummary(say("Dosyadan içe aktarıldı","Imported from file")+" · "+selected.name);
  }catch(error){
   if(serial!==generation.current)return;
   const ex=error instanceof Error?error:new Error();
   const key=["invalid","file","size","access","unavailable"].includes(ex.message)?ex.message:
    ex.name==="PasswordException"?"invalid":ex.message.includes("kullanılabilir metin")?"text":"";
   const fallback=ex.message.includes("250")?say("PDF en fazla 250 sayfa olabilir.","PDFs may contain up to 250 pages."):ex.message.includes("160.000")?say("Belge çok uzun. Daha kısa bir sürüm seçin.","This document is too long. Choose a shorter version."):importMessage("invalid",tr);
   setMessage(key?importMessage(key,tr):controller.signal.aborted?importMessage("unavailable",tr):fallback);setPhase("choose");
  }finally{clearTimeout(deadline);}
 }
 async function save(event:FormEvent){
  event.preventDefault();if(!file||phase!=="ready"||saving.current)return;
  if(content.trim().length<80||content.length>policyImportTextLimit){setMessage(importMessage("length",tr));return;}
  const parts=(s:string)=>s.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  if(![controls,risks,regulations].flatMap(parts).length){setMessage(importMessage("input",tr));return;}
  const draft={mode,policyId:mode==="existing"?target:"",...(mode==="new"?{code,title,owner,reviewer,category,classification,audience,reviewFrequencyDays:frequency}:{}),effectiveDate,summary,content,controlRefs:parts(controls),regulationRefs:parts(regulations),riskRefs:parts(risks)};
  const signature=JSON.stringify(draft);
  if(identity.current.draft!==signature)identity.current={draft:signature,id:newRequestId()};
  const form=new FormData();form.set("operation","import");form.set("file",file);form.set("draft",JSON.stringify({...draft,requestId:identity.current.id}));
  const serial=generation.current,controller=new AbortController();transport.current=controller;
  saving.current=true;onBusy(true);setPhase("saving");setMessage("");
  const deadline=setTimeout(()=>controller.abort(),90000);
  try{
   const res=await fetch(endpoint,{method:"POST",body:form,signal:controller.signal});
   const body=await res.json();if(serial!==generation.current)return;
   if(!res.ok||!body.versionId){setMessage(importMessage(body.code||(res.status===403?"access":"unavailable"),tr));setPhase("ready");return;}
   onSaved(body.versionId);
  }catch{if(serial===generation.current){setMessage(importMessage("unavailable",tr));setPhase("ready");}}
  finally{clearTimeout(deadline);saving.current=false;onBusy(false);}
 }
 const pending=phase==="saving";
 return <form className="pim-form" onSubmit={save} aria-busy={phase==="reading"||pending}>
  <label>{say("Politika dosyası","Policy file")}<input type="file" accept=".docx,.pdf" disabled={pending} onChange={e=>{const f=e.target.files?.[0];e.target.value="";void readFile(f);}}/></label>
  <small>{say("Word (.docx) en fazla 8 MB, metin içeren PDF en fazla 10 MB ve 250 sayfa.","Word (.docx) up to 8 MB, or a text-based PDF up to 10 MB and 250 pages.")}</small>
  {phase==="reading"&&<p role="status">{say("Belge okunuyor…","Reading document…")}</p>}
  {file&&<fieldset disabled={pending}><legend>{file.name}</legend>
   <label>{say("İçe aktarma hedefi","Import destination")}<select aria-label={say("İçe aktarma hedefi","Import destination")} value={mode} onChange={e=>setMode(e.target.value)}><option value="new">{say("Yeni politika oluştur","Create a new policy")}</option><option value="existing">{say("Mevcut politikaya sürüm ekle","Add a version to an existing policy")}</option></select></label>
   {mode==="existing"?<label>{say("Politika","Policy")}<select aria-label={say("Politika","Policy")} required value={target} onChange={e=>setTarget(e.target.value)}><option value="">—</option>{policies.filter(p=>p.status!=="retired").map(p=><option key={p.id} value={p.id}>{p.code} · {p.title}</option>)}</select></label>:
   <div className="pim-fields">
    <label>{say("Politika kodu","Policy code")}<input required minLength={3} maxLength={40} value={code} onChange={e=>setCode(e.target.value)}/></label>
    <label>{say("Başlık","Title")}<input required minLength={5} maxLength={240} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>{say("Kategori","Category")}<select aria-label={say("Kategori","Category")} value={category} onChange={e=>setCategory(e.target.value)}>{POLICY_CATEGORIES.map(x=><option key={x} value={x}>{tr?turkishOptions[x]:x}</option>)}</select></label>
    <label>{say("Sınıflandırma","Classification")}<select aria-label={say("Sınıflandırma","Classification")} value={classification} onChange={e=>setClassification(e.target.value)}>{POLICY_CLASSIFICATIONS.map(x=><option key={x} value={x}>{tr?turkishOptions[x]:x}</option>)}</select></label>
    <WorkflowPersonPicker tr={tr} label={say("Politika sahibi","Policy owner")} value={owner} onChange={setOwner}/>
    <WorkflowPersonPicker tr={tr} reviewer label={say("Bağımsız inceleyen","Independent reviewer")} exclude={[owner,email]} value={reviewer} onChange={setReviewer}/>
    <label>{say("Hedef kitle","Audience")}<input required minLength={3} value={audience} onChange={e=>setAudience(e.target.value)}/></label>
    <label>{say("İnceleme sıklığı (gün)","Review frequency (days)")}<input type="number" min={30} max={1095} required value={frequency} onChange={e=>setFrequency(Number(e.target.value))}/></label>
   </div>}
   <div className="pim-fields"><label>{say("Planlanan yürürlük tarihi","Planned effective date")}<input type="date" required value={effectiveDate} onChange={e=>setDate(e.target.value)}/></label>
    <label>{say("Değişiklik özeti","Change summary")}<input required minLength={10} maxLength={1000} value={summary} onChange={e=>setSummary(e.target.value)}/></label></div>
   <label>{say("Politika metni","Policy text")}<textarea aria-label={say("Politika metni","Policy text")} required rows={9} value={content} onChange={e=>setContent(e.target.value)}/></label>
   <small>{content.length.toLocaleString(tr?"tr-TR":"en-US")} / {policyImportTextLimit.toLocaleString(tr?"tr-TR":"en-US")}</small>
   {(content.length>policyImportTextLimit||content.trim().length<80)&&<p role="status">{importMessage("length",tr)}</p>}
   {warning&&<p role="status">{say("Bazı bölümler okunamamış olabilir. Metni kaynak belgeyle karşılaştırın.","Some sections may be missing. Compare the extracted text with the source document.")}</p>}
   <fieldset className="pim-fields"><legend>{say("Eşlemeler · en az bir referans girin","Mappings · enter at least one reference")}</legend>
    <label>{say("Kontrol referansları","Control references")}<input value={controls} onChange={e=>setControls(e.target.value)}/></label>
    <label>{say("Düzenleme referansları","Regulation references")}<input value={regulations} onChange={e=>setRegulations(e.target.value)}/></label>
    <label>{say("Risk referansları","Risk references")}<input value={risks} onChange={e=>setRisks(e.target.value)}/></label></fieldset>
   <small>{say("Özgün dosya ve düzenlediğiniz metin bu taslak sürüme bağlanır.","The original file and the text you reviewed will be linked to this draft version.")}</small>
   <button type="submit" disabled={pending||content.trim().length<80||content.length>policyImportTextLimit}>{pending?say("Kaydediliyor…","Saving…"):say("Taslak olarak içe aktar","Import as draft")}</button>
  </fieldset>}
  {message&&<p className="pim-error" role="alert">{message}</p>}
 </form>;
}
