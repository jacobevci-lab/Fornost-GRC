"use client";
import {IncidentDossier,hasIncidentBreach,matchesIncident,type Incident} from "./incidents/case-workspace";
import "./incidents/case-workspace.css";
import {FormEvent,useCallback,useMemo,useRef,useState} from "react";
import {incidentLabel} from "./incidents/labels";
import {withBasePath} from "./base-path";
import {useEnterpriseWorkFocus,EnterpriseWorkFocusBanner} from "./enterprise-work-focus";
import {useWorkflowRecords} from "./use-workflow-records";
import {requestJsonWithDeadline} from "./bounded-json-request";
import {WorkflowPersonPicker,workflowSelectionMessage} from "./workflow-selection-fields";
import WorkflowDialog from "./findings/dialog";
import IncidentDecisionDialog from "./incidents/decision-dialog";
import {incidentNextAction as nextAction} from "./incidents/decisions";
import "./incident-center.css";
type Lang="tr"|"en";
type Summary={total:number;active:number;critical:number;breached:number;contained:number;recovery:number;review:number;personalData:number};
const noIncidents:Incident[]=[];
const emptySummary:Summary={total:0,active:0,critical:0,breached:0,contained:0,recovery:0,review:0,personalData:0};
const today=()=>new Date().toISOString().slice(0,10);
const emptyForm=(email:string)=>({requestId:crypto.randomUUID(),title:"",category:"account-compromise",severity:"high",detectedDate:today(),description:"",businessImpact:"",owner:email,commander:"",reviewer:"",assetRefs:"",riskRef:"",biaRef:"",dataClassification:"Internal",personalData:false});
export default function IncidentCenter({lang,currentUser}:{lang:Lang;currentUser:{role:string;email:string}}){
 const label=(value:string)=>incidentLabel(value,lang);
 const tr=lang==="tr",[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[query,setQuery]=useState(""),[filter,setFilter]=useState("active"),[form,setForm]=useState<Record<string,string|boolean>|null>(null),[selectedId,setSelectedId]=useState<string|null>(null),[action,setAction]=useState<{id:string;operation:string}|null>(null);
 const workFocus=useEnterpriseWorkFocus("Güvenlik Olayları",setFilter,useCallback(()=>{setSelectedId(null);setAction(null);setForm(null);setQuery("");},[]));
 const resource=useWorkflowRecords<{incidents:Incident[];events:Array<Record<string,string>>;summary:Summary;limited:boolean;eventsLimited:boolean}>("/api/incidents",workFocus.focus);
 const data=resource.data;
 const valid=!!data&&Array.isArray(data.incidents)&&Array.isArray(data.events)&&!!data.summary
   &&Object.keys(emptySummary).every(key=>{const n=data.summary[key as keyof Summary];return Number.isSafeInteger(n)&&n>=0;})
   &&data.incidents.every(row=>row&&typeof row.id==="string"&&typeof row.title==="string"&&typeof row.status==="string");
 const ready=resource.ready&&valid;
 const incidents=valid?data.incidents:noIncidents,events=valid?data.events:[],summary=valid?data.summary:emptySummary;
 const creating=useRef(false);
 async function create(event:FormEvent){
  event.preventDefault();if(!form||creating.current)return;creating.current=true;setBusy(true);setNotice("");
  try {
   const {response,body}=await requestJsonWithDeadline(withBasePath("/api/incidents"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create",assignmentMode:"directory",...form})},fetch,15_000);
   if(response.ok){setForm(null);workFocus.open('incident',String(body.id));setNotice(tr?"Olay kaydı hazır.":"Incident record is ready.");await resource.reload();}
   else setNotice(workflowSelectionMessage(body.code,tr)||(body.code==="REFERENCE_UNAVAILABLE"?(tr?"Bağlı varlık, risk veya BIA kaydı kullanılamıyor. Referansları düzeltin.":"A linked asset, risk or BIA record is unavailable. Correct the references."):response.status===409?(tr?"Kaynak veya atamalar değişti; taslağınız korundu. Daha önce kaydedilmiş bir ilanı değiştirmek için aynı işlem kimliği kullanılamaz.":"The source or assignments changed; your draft is retained. An already saved declaration cannot be changed using the same operation ID."):response.status>=500?(tr?"Sonuç doğrulanamadı. Taslağınız korundu; aynı formu yeniden göndermek aynı ilanı tekrar oluşturmaz.":"The outcome is unknown. Your draft is retained; retrying the same form does not duplicate the declaration."):(tr?"Alanları, kişi seçimlerini ve referansları kontrol edin.":"Check the fields, people and references.")));
  } catch {setNotice(tr?"Sonuç doğrulanamadı. Taslağınız korundu; aynı formu yeniden göndermek aynı ilanı tekrar oluşturmaz.":"The outcome is unknown. Your draft is retained; retrying the same form does not duplicate the declaration.");}
  finally {creating.current=false;setBusy(false);}
 }
 const openAction=(incident:Incident)=>setAction({id:incident.id,operation:nextAction[incident.status]});
 const filtered=useMemo(()=>incidents.filter(row=>workFocus.focus?row.id===workFocus.focus.ref:matchesIncident(row,filter,query,lang)),[incidents,filter,query,lang,workFocus.focus]);
 const selected=filtered.find(row=>row.id===selectedId)||filtered[0]||null;
 const canCreate=currentUser.role==="Admin"||currentUser.role==="Editor";
 const reset=(scope:string)=>{workFocus.clear();setQuery("");setFilter(scope);setSelectedId(null);};
 const select=(id:string)=>{setSelectedId(id);if(window.matchMedia("(max-width: 760px)").matches)requestAnimationFrame(()=>document.querySelector<HTMLElement>(".incident-dossier h3")?.focus());};
 const clearFocus=()=>reset("all");
 const noMatches=!!query.trim()||!["active","all"].includes(filter);
 async function finishDecision(refresh:boolean){
   const actedId=action?.id;setAction(null);
   if(!refresh||!actedId)return;
   setSelectedId(actedId);
   const updated=await resource.reload();
   const acted=updated?.incidents?.find(row=>row.id===actedId);
   if(acted&&!workFocus.focus&&!matchesIncident(acted,filter,query,lang)){setFilter("all");setQuery("");setSelectedId(actedId);}
 }
 return <section className="incident-page ic-workspace">
  <header className="incident-hero ic-heading"><h2>{tr?"Olay dosyası":"Incident case file"}</h2><div>
    {currentUser.role==="Admin"&&<a href={withBasePath("/api/incidents?format=csv")}>{tr?"Olay CSV":"Incident CSV"}</a>}
    {canCreate&&<button type="button" className="primary" disabled={busy} onClick={()=>{setNotice("");setForm(emptyForm(currentUser.email));}}>+ {tr?"Olay İlan Et":"Declare Incident"}</button>}
  </div></header>
  {notice&&<button className="incident-notice" onClick={()=>setNotice("")}>{notice}<b>×</b></button>}
  <EnterpriseWorkFocusBanner focus={workFocus.focus} found={incidents.some(x=>x.id===workFocus.focus?.ref)} ready={ready} clear={clearFocus} tr={tr}/>
  <div className="incident-source-state ic-source"><button type="button" disabled={busy||resource.loading} onClick={()=>void resource.reload()}>{tr?'Olayları yenile':'Refresh incidents'}</button>
    {resource.loading&&<span role="status">{tr?'Olaylar yükleniyor…':'Loading incidents…'}</span>}
    {(resource.error||!resource.loading&&!valid)&&<p role="alert">{tr?'Olaylar yüklenemedi. Yenileyerek tekrar deneyin.':'Incidents could not be loaded. Refresh to retry.'}</p>}
    {data?.limited&&<span>{tr?'Liste ve sayaçlar ilk 3.000 kayıtla sınırlıdır. Doğrudan bağlantı seçili olaya ulaşır.':'The list and counts are limited to 3,000 records. An exact link still reaches its selected incident.'}</span>}
  </div>
  <div className="ic-panes"><section className="ic-index" aria-label={tr?"Olay kuyruğu":"Incident queue"}>
    <h3>{tr?"Olay kuyruğu":"Incident queue"}</h3>
    <div className="ic-tools"><input type="search" aria-label={tr?"Olay ara":"Search incidents"} placeholder={tr?"Olay ara…":"Search incidents…"} value={query} disabled={!!workFocus.focus||resource.loading} onChange={e=>setQuery(e.target.value)}/>
    <select aria-label={tr?"Durum filtresi":"Status filter"} value={filter} disabled={!!workFocus.focus||resource.loading} onChange={e=>setFilter(e.target.value)}>
      <option value="active">{tr?"Aktif olaylar":"Active incidents"}</option><option value="all">{tr?"Tüm olaylar":"All incidents"}</option>
      <option value="breached">{tr?"SLA ihlalleri":"SLA breaches"}</option>
      {["response-breach","recovery-breach","declared","triage","contained","eradicated","recovered","review","closed"].map(x=><option key={x} value={x}>{label(x)}</option>)}
    </select></div>
    {ready&&!workFocus.focus&&<div className="ic-shortcuts" role="group" aria-label={tr?"Hızlı filtreler":"Quick filters"}>
      <button type="button" aria-pressed={filter==="active"} onClick={()=>setFilter("active")}>{tr?"Aktif":"Active"} · {summary.active}</button>
      <button type="button" aria-pressed={filter==="breached"} onClick={()=>setFilter("breached")}>{tr?"SLA ihlali":"SLA breaches"} · {summary.breached}</button>
    </div>}
    <div className="ic-case-list">{filtered.map(row=><button type="button" key={row.id} className="incident-row-open" aria-pressed={selected?.id===row.id} disabled={resource.loading} onClick={()=>select(row.id)}>
      <small>{row.code}</small><b>{row.title}</b><span>{label(row.severity)} · {label(row.status)}</span>{hasIncidentBreach(row)&&<span className="ic-breach">{label(row.attention)}</span>}
    </button>)}</div>
  </section>
  {selected?<IncidentDossier key={selected.id} row={selected} lang={lang} user={currentUser} disabled={!ready||busy} onAction={openAction}/>:
    <section className="ic-empty">{ready&&!workFocus.focus&&(summary.total===0?<><h3>{tr?"Henüz olay kaydı yok":"No incidents yet"}</h3>{canCreate&&<button className="primary" onClick={()=>{setNotice("");setForm(emptyForm(currentUser.email));}}>{tr?"İlk olayı ilan et":"Declare the first incident"}</button>}</>:
      !noMatches&&filter==="active"?<><h3>{data?.limited?(tr?"Yüklenen kayıtlarda aktif olay yok":"No active incidents in loaded records"):(tr?"Aktif olay yok":"No active incidents")}</h3><button onClick={()=>reset("closed")}>{tr?"Kapalı olayları gör":"View closed incidents"}</button></>:
      <><h3>{tr?"Filtreyle eşleşen olay yok":"No matching incidents"}</h3><button onClick={()=>reset("all")}>{tr?"Filtreleri temizle":"Clear filters"}</button></>)}</section>}
  </div>
  {form&&<WorkflowDialog className="incident-overlay" label={tr?"Yeni güvenlik olayı":"New security incident"} busy={busy} onClose={()=>setForm(null)}><form className="incident-form" onSubmit={create}><header><div><small>CONTROLLED INCIDENT DECLARATION</small><h3>{tr?"Yeni güvenlik olayı":"New security incident"}</h3></div><button aria-label={tr?"Kapat":"Close"} type="button" disabled={busy} onClick={()=>setForm(null)}>×</button></header><fieldset disabled={busy} className="incident-form-grid"><Field wide label={tr?"Olay başlığı":"Incident title"} name="title" form={form} setForm={setForm}/><label>{tr?"Kategori":"Category"}<select aria-label={tr?"Kategori":"Category"} value={String(form.category)} onChange={e=>setForm({...form,category:e.target.value})}>{["malware","phishing","account-compromise","data-breach","availability","vulnerability-exploitation","third-party","policy-violation","physical","other"].map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><label>{tr?"Önem":"Severity"}<select aria-label={tr?"Önem":"Severity"} value={String(form.severity)} onChange={e=>setForm({...form,severity:e.target.value})}>{["low","medium","high","critical"].map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><Field type="date" label={tr?"Tespit tarihi":"Detection date"} name="detectedDate" form={form} setForm={setForm}/><label>{tr?"Veri sınıfı":"Data classification"}<select aria-label={tr?"Veri sınıfı":"Data classification"} value={String(form.dataClassification)} onChange={e=>setForm({...form,dataClassification:e.target.value})}>{["Public","Internal","Restricted","Top Secret"].map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><Field wide area label={tr?"Olay açıklaması":"Incident description"} name="description" form={form} setForm={setForm}/><Field wide area label={tr?"İş etkisi":"Business impact"} name="businessImpact" form={form} setForm={setForm}/><WorkflowPersonPicker tr={tr} label={tr?"Olay sahibi":"Incident owner"} value={String(form.owner||"")} exclude={[String(form.commander||""),String(form.reviewer||"")]} onChange={value=>setForm({...form,owner:value})}/><WorkflowPersonPicker tr={tr} label={tr?"Olay yöneticisi":"Incident commander"} value={String(form.commander||"")} exclude={[String(form.owner||""),String(form.reviewer||"")]} onChange={value=>setForm({...form,commander:value})}/><WorkflowPersonPicker tr={tr} reviewer label={tr?"Bağımsız inceleyen":"Independent reviewer"} value={String(form.reviewer||"")} exclude={[currentUser.email,String(form.owner||""),String(form.commander||"")]} onChange={value=>setForm({...form,reviewer:value})}/><Field label={tr?"Varlık referansları":"Asset references"} name="assetRefs" form={form} setForm={setForm}/><Field label={tr?"Risk referansı":"Risk reference"} name="riskRef" form={form} setForm={setForm}/><Field label={tr?"BIA referansı":"BIA reference"} name="biaRef" form={form} setForm={setForm}/><label className="check"><input type="checkbox" checked={Boolean(form.personalData)} onChange={e=>setForm({...form,personalData:e.target.checked})}/>{tr?"Kişisel veri etkilenmiş olabilir":"Personal data may be affected"}</label></fieldset>{notice&&<p role="alert">{notice}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={()=>setForm(null)}>{tr?"İptal":"Cancel"}</button><button disabled={busy}>{tr?"Olayı ilan et":"Declare incident"}</button></footer></form></WorkflowDialog>}
  {action&&<IncidentDecisionDialog key={action.id+action.operation} id={action.id} operation={action.operation} tr={tr} actor={currentUser} onBusy={setBusy} close={refresh=>void finishDecision(refresh)}/>}
  {ready&&!workFocus.focus&&summary.total>0&&<details className="ic-register-summary"><summary>{tr?"Tüm olayların özeti":"All incidents summary"}</summary>
    <dl className="ic-facts">{[[tr?"Aktif":"Active",summary.active],[tr?"Kritik":"Critical",summary.critical],[tr?"SLA ihlali":"SLA breaches",summary.breached],[tr?"Kontrol altında":"Contained",summary.contained],[tr?"İncelemede":"In review",summary.review],[tr?"Kişisel veri":"Personal data",summary.personalData]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
  </details>}
  {ready&&!workFocus.focus&&events.length>0&&<details className="incident-history"><summary>{tr?"Son olay yaşam döngüsü kayıtları":"Recent incident lifecycle events"}</summary><p>{tr?"Son 20 olay kaydı. Bir olayın tam geçmişini ayrıntısından açın.":"Latest 20 events. Open an incident for its full history."}</p>{events.slice(0,20).map(x=><div key={x.id}><b>{x.action}</b><span>{x.incidentId} · {x.actor}</span><small>{x.detail}</small></div>)}</details>}
 </section>
}
function Field({label,name,form,setForm,wide=false,area=false,type="text"}:{label:string;name:string;form:Record<string,string|boolean>;setForm:(x:Record<string,string|boolean>)=>void;wide?:boolean;area?:boolean;type?:string}){const value=String(form[name]??""),optional=["riskRef","biaRef"].includes(name),minimum:Record<string,number>={title:5,description:20,businessImpact:15,assetRefs:2};return <label className={wide?"wide":""}>{label}{area?<textarea aria-label={label} required={!optional} minLength={minimum[name]} maxLength={name==="description"?4000:3000} value={value} onChange={e=>setForm({...form,[name]:e.target.value})}/>:<input aria-label={label} type={type} required={!optional} minLength={minimum[name]} maxLength={name==="title"?240:name==="assetRefs"?1000:120} max={type==="date"?today():undefined} value={value} onChange={e=>setForm({...form,[name]:e.target.value})}/>}</label>}
