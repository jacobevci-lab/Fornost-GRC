"use client";
import WorkflowCancelButton from "./workflow-cancel-button";
import { CurrentRecordTrail } from "./module-record-trail-view";
import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from "react";
import {withBasePath} from "./base-path";
import {FINDING_SOURCES,addDays,findingSlaDays} from "./findings/domain";
import "./findings-center.css";
import {findingsRequest,validFindingsPayload,validFindingPagination,type FindingPagination,type Finding} from "./findings/workspace";
import {WorkpaperCapaOriginPanel} from './workpaper-capa-panel';
import FindingControlContextPanel from "./findings/control-context-panel";
import {findingLabel,findingTimestamp,findingActionAvailability} from "./findings/presentation";
import {FindingWorklist} from "./findings/worklist";
import NavIcon from "./nav-icon";
import "./findings/worklist.css";
import FindingDialog from "./findings/dialog";
import FindingDecisionDialog from "./findings/decision-dialog";
import {FindingSourceFields,FindingPersonField,hasSourceCatalog} from "./findings/intake-fields";
import {workflowSelectionMessage} from "./workflow-selection-fields";
import type { ConnectedGrcRow } from "./connected-grc-model";
import { findingTargets } from "./findings/record-references";
import { FindingReferencePicker } from "./findings/reference-picker";
import FindingLineageLens from "./finding-lineage-lens";
import FindingHistoryPanel from "./findings/history-panel";
import {loadCapaReport,capaReportFailure,capaReportFailureMessage,CAPA_REPORT_MODULE} from "./findings/reporting";
import {buildReportCsv,downloadBlob,reportMetrics} from "./report-export";
import {FORNOST_FOCUS_EVENT,peekPendingFornostFocus,consumePendingFornostFocus,type FornostNavigationRequest} from "./navigation-focus";
import {sameDomainModule} from "./domain-identity";
type Lang="tr"|"en";
type Summary={total:number;open:number;critical:number;overdue:number;verification:number;accepted:number;closed:number;recurring:number};
type FindingsPayload={pagination?:FindingPagination;findings?:Finding[];events?:Array<Record<string,string>>;sourceSignals?:Array<{source:string;count:number;available?:boolean}>;summary?:Summary};
const emptySummary:Summary={total:0,open:0,critical:0,overdue:0,verification:0,accepted:0,closed:0,recurring:0};

const today=()=>new Date().toISOString().slice(0,10),emptyForm=(email:string)=>({sourceType:"audit",sourceMode:"record",sourceRef:"",sourceTitle:"",findingType:"nonconformity",title:"",description:"",severity:"high",owner:email,reviewer:"",rootCause:"",correctiveAction:"",preventiveAction:"",dueDate:addDays(today(),30),riskRef:"",controlRef:""});
export default function FindingsCenter({lang,currentUser,rows,coreState,retryCore}:{
 lang:Lang;currentUser:{role:string;email:string};rows:ConnectedGrcRow[];coreState:"ready"|"loading"|"error";retryCore:()=>void;
}){
 const tr=lang==="tr",[findings,setFindings]=useState<Finding[]>([]),[events,setEvents]=useState<Array<Record<string,string>>>([]),[signals,setSignals]=useState<Array<{source:string;count:number;available?:boolean}>>([]),[summary,setSummary]=useState<Summary>(emptySummary),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[form,setForm]=useState<Record<string,string>|null>(null),[selected,setSelected]=useState<Finding|null>(null),[action,setAction]=useState<{finding:Finding;operation:string}|null>(null);
 const needsTargets = Boolean(form||selected) && coreState === "ready";
 const targets = useMemo(() => ({
   riskRef: needsTargets ? findingTargets(rows, "riskRef") : [],
   controlRef: needsTargets ? findingTargets(rows, "controlRef") : [],
 }), [needsTargets, rows]);
 const [source,setSource]=useState("all");
 const [assignment,setAssignment]=useState("all");
 const [focusRef,setFocusRef]=useState(""),[focusNonce,setFocusNonce]=useState(0);
 const [pagination,setPagination]=useState<FindingPagination>({page:1,pages:1,total:0,start:0,end:0});
 const [requestLoading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[page,setPage]=useState(1);
 const [settledScope,setSettledScope]=useState<string|null>(null);
 const scope=JSON.stringify([query,filter,source,assignment,page,lang,focusRef]);
 const loading=requestLoading||settledScope!==scope;
 const [exporting,setExporting]=useState(false),[exportLoaded,setExportLoaded]=useState(0);
 const exportController=useRef<AbortController|null>(null);
 useEffect(()=>()=>exportController.current?.abort(),[]);
 const autoOpenRef=useRef<string|null>(null);
 const loadController=useRef<AbortController|null>(null),writeController=useRef<AbortController|null>(null),sending=useRef(false);
 const load=useCallback(async()=>{
  loadController.current?.abort();const controller=new AbortController();loadController.current=controller;
  setLoading(true);setLoadError(false);
  try {
   const {response,body}=await findingsRequest(withBasePath("/api/findings?"+new URLSearchParams({view:"register",q:query,filter,source,assignment,page:String(page),lang,...(focusRef?{ref:focusRef}:{})})),{cache:"no-store",signal:controller.signal});
   if(!response.ok||!validFindingsPayload(body)||!validFindingPagination(body.pagination,Array.isArray(body.findings)?body.findings.length:0))throw new Error("Findings unavailable");
   if(controller.signal.aborted)return;
   const data=body as FindingsPayload;
   setPagination(data.pagination!);setFindings(data.findings||[]);setEvents(data.events||[]);setSignals(data.sourceSignals||[]);setSummary(data.summary||emptySummary);
   const openFocused=!!focusRef&&autoOpenRef.current===focusRef;if(openFocused)autoOpenRef.current=null;
   setSelected(previous=>openFocused?(data.findings||[])[0]||null:previous?(data.findings||[]).find(item=>item.id===previous.id)||null:null);
  }catch{if(!controller.signal.aborted)setLoadError(true);}
  finally{if(!controller.signal.aborted){setSettledScope(scope);setLoading(false);}}
 },[query,filter,source,assignment,page,lang,focusRef,scope]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),200);return()=>{clearTimeout(timer);loadController.current?.abort();};},[load,focusNonce]);
 useEffect(()=>{const writes=writeController;return()=>writes.current?.abort();},[]);
 useEffect(()=>{
  const accept=(request:FornostNavigationRequest|null)=>{
   if(!request||!sameDomainModule(request.module,"Bulgular ve CAPA")||sending.current)return;
   const ref=request.filter?.findingRef||request.filter?.recordRef||request.ref||"";
   if(!ref||ref.length>200||/\p{Cc}/u.test(ref))return;
   autoOpenRef.current=ref;consumePendingFornostFocus("Bulgular ve CAPA");loadController.current?.abort();setSelected(null);setAction(null);setForm(null);setLoading(true);setLoadError(false);setFocusRef(ref);setFocusNonce(value=>value+1);setQuery("");setFilter("all");setSource("all");setAssignment("all");setPage(1);
  };
  accept(peekPendingFornostFocus());
  const listener=(event:Event)=>accept((event as CustomEvent<FornostNavigationRequest>).detail);
  window.addEventListener(FORNOST_FOCUS_EVENT,listener);return()=>window.removeEventListener(FORNOST_FOCUS_EVENT,listener);
 },[]);

 async function api(body:Record<string,unknown>,endpoint="/api/findings"){
  if(sending.current||loading||loadError||!["Admin","Editor"].includes(currentUser.role))return false;
  sending.current=true;setBusy(true);setNotice("");
  const controller=new AbortController();writeController.current=controller;
  const uncertain=()=>{setNotice(tr?"İşlem sonucu doğrulanamadı. Tekrar göndermeden önce yenilenen listeyi kontrol edin.":"The result could not be confirmed. Check the refreshed list before submitting again.");setForm(null);setAction(null);setSelected(null);};
  try{
   const {response,body:result}=await findingsRequest(withBasePath(endpoint),{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify(body)});
   if(controller.signal.aborted)return false;
   if(response.status>=500){uncertain();await load();return false;}
   setNotice(response.ok?(endpoint==="/api/continuous-assurance"?(tr?"CAPA talebi bağımsız onay kuyruğunda.":"CAPA request is in the independent approval queue."):(tr?"Bulgu ve CAPA oluşturuldu.":"Finding and CAPA created.")):(workflowSelectionMessage(result.code,tr)||(result.code==="FINDING_SOURCE_SELECTION"?(tr?"Kaynak kaydı değişti. Kaynağı tekrar seçin.":"The source changed. Select the record again."):null)||(result.code==="REFERENCE_UNAVAILABLE"?(tr?"Bağlı kontrol veya risk kaydı bulunamadı ya da yanlış modüle ait. Eşlemeyi düzeltip tekrar gönderin.":"A linked control or risk record is unavailable or belongs to another module. Correct the mapping and submit again."):typeof result.error==="string"?result.error:(tr?"İşlem başarısız.":"Operation failed."))));
   if(result.code==="REFERENCE_UNAVAILABLE")retryCore();
   if(response.ok||response.status===409){setAction(null);setSelected(null);await load();}
   return response.ok;
  }catch{if(!controller.signal.aborted){uncertain();await load();}return false;}
  finally{sending.current=false;if(!controller.signal.aborted)setBusy(false);}
 }
 async function exportCsv(){
  if(exportController.current||loading||loadError)return;
  const controller=new AbortController();exportController.current=controller;setExporting(true);setExportLoaded(0);setNotice("");
  try{
   const rows=await loadCapaReport(withBasePath("/api/findings?format=report"),controller.signal,fetch,count=>{if(!controller.signal.aborted)setExportLoaded(count);});
   if(controller.signal.aborted)return;
   const csv=buildReportCsv(tr?"Tüm Bulgular ve CAPA":"All Findings & CAPA",rows,reportMetrics(CAPA_REPORT_MODULE,rows,tr),tr,{template:"detailed",preparedBy:currentUser.email,scope:tr?"Tüm merkezi CAPA kayıtları; ekran araması ve durum filtresi uygulanmaz.":"All canonical CAPA records; screen search and status filters are not applied."});
   downloadBlob("fornost-findings-capa.csv",new Blob([csv],{type:"text/csv;charset=utf-8"}));
  }catch(error){if(!controller.signal.aborted)setNotice(capaReportFailureMessage(capaReportFailure(error),tr));}
  finally{exportController.current=null;if(!controller.signal.aborted)setExporting(false);}
 }
 async function create(event:FormEvent){
   event.preventDefault();if(!form)return;
   const queued=form.sourceType==="continuous-control";
   const saved=queued?await api({action:"queue-capa-promotion",assignmentMode:"directory",findingId:form.sourceRef,targetControlRef:form.targetControlRef,owner:form.owner,reviewer:form.reviewer,dueDate:form.dueDate,rootCause:form.rootCause,correctiveAction:form.correctiveAction,preventiveAction:form.preventiveAction},"/api/continuous-assurance"):
     await api({action:"create",...form,assignmentMode:"directory",referenceMode:"record-id"});
   if(saved)setForm(null);
 }
 const startAction=(finding:Finding,operation:string)=>{if(loading||loadError||sending.current)return;setNotice("");setAction({finding,operation});};
 const decisionBusy=useCallback((value:boolean)=>{sending.current=value;setBusy(value);},[]);
 const listing={...pagination,rows:findings};
 const available=selected?findingActionAvailability(selected,currentUser):null;
 const changeScope=()=>{autoOpenRef.current=null;setFocusRef("");setSelected(null);};
 const format=(value?:string)=>{if(!value)return "—";const date=new Date(`${value.slice(0,10)}T12:00:00Z`);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{dateStyle:"medium"}).format(date):"—";};
 const canCreate=["Admin","Editor"].includes(currentUser.role);
 const resetFilters=()=>{changeScope();setQuery("");setFilter("all");setSource("all");setAssignment("all");setPage(1);};
 const quickFilters=[
   {value:"all",label:tr?"Tüm bulgular":"All findings",icon:"Benim İşlerim"},
   {value:"overdue",label:tr?"Gecikenler":"Overdue findings",icon:"İş Sürekliliği"},
   {value:"verification",label:tr?"Doğrulamada":"In verification",icon:"Bulgular ve CAPA"},
 ];
 return <section className="finding-page capa-worklist" data-native-focus="true" aria-busy={loading||busy}>
  <header className="finding-hero capa-heading">
    <div><h2>{tr?"Öncelikli iş listesi":"Priority worklist"}</h2></div>
    <div>{currentUser.role==="Admin"&&<button type="button" disabled={exporting||loading||loadError} onClick={()=>void exportCsv()}>
      {exporting?`${tr?"Yükleniyor":"Loading"}… ${exportLoaded}`:(tr?"Tüm CAPA · CSV":"All CAPA · CSV")}</button>}
      {canCreate&&<button type="button" className="capa-create workspace-create" disabled={loading||loadError||busy} onClick={()=>{setNotice("");setForm(emptyForm(currentUser.email));}}>+ {tr?"Yeni Bulgu":"New Finding"}</button>}
    </div>
  </header>
  <div className="finding-load-status capa-freshness" role={loadError?"alert":"status"}>
    <span>{loading?(tr?"Bulgular yükleniyor…":"Loading findings…"):loadError?(tr?"Bulgular alınamadı. Gösterilen kayıtlar güncel olmayabilir.":"Findings could not be loaded. Displayed records may be stale."):(tr?"Kayıtlar güncel":"Records are up to date")}</span>
    <button type="button" disabled={loading||busy} onClick={()=>void load()}>{loadError?(tr?"Yeniden dene":"Retry"):(tr?"Yenile":"Refresh")}</button>
  </div>
  {focusRef&&<div className="finding-load-status" role="status"><span>{tr?"Seçilen bulgu":"Selected finding"}: {focusRef}{!loading&&(loadError||!findings.length)?(tr?" · Kayıt bulunamadı, belirsiz veya erişilemiyor.":" · Record missing, ambiguous or unavailable."):""}</span><button type="button" disabled={busy} onClick={()=>{changeScope();setQuery("");setFilter("all");setSource("all");setAssignment("all");setPage(1)}}>{tr?"Tüm kayıtları göster":"Show all records"}</button></div>}
  {notice&&<button className="finding-notice" onClick={()=>setNotice("")}>{notice}<b>×</b></button>}
    <div className="finding-kpis" role="group" aria-label={tr?"CAPA özeti":"CAPA summary"}>{[[summary.open,tr?"Açık CAPA":"Open CAPA","active"],[summary.critical,tr?"Kritik":"Critical","critical"],[summary.overdue,tr?"Gecikmiş":"Overdue","overdue"],[summary.verification,tr?"Doğrulamada":"Verification","verification"],[summary.accepted,tr?"Risk kabulü":"Accepted risk","accepted"],[summary.recurring,tr?"Tekrarlayan":"Recurring","recurring"]].map(([value,label,scope])=><button type="button" key={String(scope)} disabled={loading||loadError||busy} aria-pressed={filter===scope&&assignment==="all"&&source==="all"&&!query&&!focusRef} aria-label={String(label)} onClick={()=>{changeScope();setQuery("");setSource("all");setAssignment("all");setFilter(String(scope));setPage(1)}}><small>{label}</small><strong>{loading||loadError?"—":value}</strong></button>)}</div>
  <div className="finding-toolbar">
    <div className="capa-views" role="group" aria-label={tr?"Hızlı filtreler":"Quick filters"}>
      {quickFilters.map(view=><button key={view.value} type="button" aria-pressed={!focusRef&&filter===view.value}
        disabled={busy} onClick={()=>{if(filter!==view.value||focusRef){changeScope();setFilter(view.value);setPage(1);}}}>
        <NavIcon module={view.icon}/>{view.label}</button>)}
    </div>
    <input aria-label={tr?"Bulgu ara":"Search findings"} placeholder={tr?"Kod, başlık, kaynak veya sahip ara…":"Search code, title, source or owner…"} value={query} maxLength={200} disabled={busy} onChange={e=>{changeScope();setQuery(e.target.value);setPage(1)}}/><select aria-label={tr?"Durum filtresi":"Status filter"} value={filter} disabled={busy} onChange={e=>{changeScope();setFilter(e.target.value);setPage(1)}}><option value="all">{tr?"Tüm kayıtlar":"All records"}</option><option value="active">{tr?"Tüm açık CAPA":"All active CAPA"}</option><option value="open">{tr?"Başlatılmamış":"Not started"}</option><option value="in-progress">{tr?"Devam ediyor":"In progress"}</option><option value="critical">{tr?"Kritik · kapalı hariç":"Critical · excluding closed"}</option><option value="recurring">{tr?"Tekrarlayan · tüm durumlar":"Recurring · all statuses"}</option><option value="acceptance-expired">{tr?"Risk kabul süresi dolmuş":"Risk acceptance expired"}</option><option value="priority">{tr?"Öncelikli":"Priority"}</option><option value="overdue">{tr?"Gecikmiş":"Overdue"}</option><option value="verification">{tr?"Doğrulamada":"Verification"}</option><option value="accepted">{tr?"Risk kabulü":"Accepted risk"}</option><option value="closed">{tr?"Kapalı":"Closed"}</option></select><select aria-label={tr?"Atama filtresi":"Assignment filter"} value={assignment} disabled={busy} onChange={e=>{changeScope();setAssignment(e.target.value);setPage(1)}}><option value="all">{tr?"Tüm atamalar":"All assignments"}</option><option value="owned">{tr?"Sahibi olduğum":"Owned by me"}</option><option value="review">{tr?"Doğrulayıcısı olduğum":"Assigned to me for review"}</option></select>
    <div className="capa-source-filters" role="group" aria-label={tr?"Kaynak filtresi":"Source filter"}>
      <button type="button" disabled={busy} aria-pressed={source==="all"} onClick={()=>{changeScope();setSource("all");setPage(1)}}>{tr?"Tüm kaynaklar":"All sources"}</button>
      {FINDING_SOURCES.filter(key=>["audit","continuous-control","vendor","incident","ai","regulatory"].includes(key)||signals.some(x=>x.source===key)).map(key=>
        <button type="button" key={key} disabled={busy} aria-pressed={source===key} onClick={()=>{changeScope();setSource(source===key?"all":key);setPage(1)}}>{findingLabel(key,lang)} <b>{loading||loadError?"—":signals.find(x=>x.source===key)?.count||0}</b></button>)}
    </div></div>
  <div className="finding-table-wrap">
    {listing.rows.length>0 && <FindingWorklist key={scope} targets={targets} rows={listing.rows} lang={lang} disabled={loading||loadError||busy} onOpen={setSelected}/>}
    {!loading&&!loadError&&!listing.total&&!focusRef&&<div className="finding-empty">
      <strong>{summary.total ? (tr?"Filtreyle eşleşen bulgu yok.":"No findings match the filter.") : (tr?"Henüz CAPA kaydı yok.":"No CAPA records yet.")}</strong>
      {summary.total>0 ? <button type="button" onClick={resetFilters}>{tr?"Filtreleri temizle":"Clear filters"}</button> :
        <p>{canCreate ? (tr?"İlk kaydı oluşturmak için Yeni Bulgu’yu seçin.":"Select New Finding to create the first record.") :
        (tr?"Oluşturulan kayıtları burada takip edebilirsiniz.":"Created findings will appear here.")}</p>}
    </div>}
  </div>
  {listing.pages>1&&<nav className="finding-pagination" aria-label={tr?"Bulgu sayfaları":"Finding pages"}><span>{listing.start}–{listing.end} / {listing.total} · {tr?"Sayfa":"Page"} {listing.page}/{listing.pages}</span><button type="button" disabled={listing.page<=1||loading||busy} onClick={()=>{changeScope();setPage(listing.page-1)}}>{tr?"Önceki":"Previous"}</button><button type="button" disabled={listing.page>=listing.pages||loading||busy} onClick={()=>{changeScope();setPage(listing.page+1)}}>{tr?"Sonraki":"Next"}</button></nav>}

  {selected&&<FindingDialog label={selected.title} className="finding-overlay capa-drawer" busy={busy} dismissOnBackdrop onClose={()=>setSelected(null)}><article className="finding-detail">{currentUser.role==="Admin"&&["open","in-progress"].includes(selected.status)&&selected.sourceType!=="continuous-control"&&<WorkflowCancelButton endpoint="/api/findings" id={selected.id} revision={selected.updatedAt} label={selected.code} tr={tr} onSaved={async()=>{setSelected(null);await load()}}/>}<header><div><small>{selected.code} · {findingLabel(selected.sourceType,lang)}/{selected.sourceRef}</small><h3>{selected.title}</h3></div><button disabled={busy} aria-label={tr?"Kapat":"Close"} onClick={()=>setSelected(null)}>×</button></header><CurrentRecordTrail module="Bulgular ve CAPA" kind="finding" recordRef={selected.id}/><div className="finding-detail-grid"><section><small>{tr?"BULGU":"FINDING"}</small><p>{selected.description}</p><dl><div><dt>{tr?"Kök neden":"Root cause"}</dt><dd>{selected.rootCause}</dd></div><div><dt>{tr?"Düzeltici aksiyon":"Corrective action"}</dt><dd>{selected.correctiveAction}</dd></div><div><dt>{tr?"Önleyici aksiyon":"Preventive action"}</dt><dd>{selected.preventiveAction}</dd></div></dl></section><aside><small>{tr?"YÖNETİŞİM":"GOVERNANCE"}</small><b>{findingLabel(selected.severity,lang)} · {findingLabel(selected.status,lang)}</b><span>{tr?"Aksiyon sahibi":"Action owner"}: {selected.owner}</span><span>{tr?"Bağımsız doğrulayıcı":"Independent reviewer"}: {selected.reviewer}</span><small>{tr?"Kapatma ve risk kabulü için atanmış bağımsız Admin doğrulayıcı gerekir.":"Closure and risk acceptance require the assigned independent Admin reviewer."}</small><span>{tr?"Son güncelleme":"Last updated"}: {findingTimestamp(selected.updatedAt,lang)}</span><span>{tr?"Termin":"Due"}: {format(selected.dueDate)}</span>{selected.acceptUntil&&<span>{tr?"Kabul bitişi":"Acceptance expiry"}: {format(selected.acceptUntil)}</span>}{selected.acceptanceRationale&&<p><strong>{tr?"Risk kabul gerekçesi":"Risk acceptance rationale"}</strong><br/>{selected.acceptanceRationale}</p>}{selected.evidenceReference&&<span>{tr?"Gönderim kanıtı":"Submission evidence"}: {selected.evidenceReference}</span>}{selected.verificationEvidenceReference&&<span>{tr?"Doğrulama / kabul kanıtı":"Verification / acceptance evidence"}: {selected.verificationEvidenceReference}</span>}</aside></div><FindingLineageLens finding={selected} targets={targets} coreState={coreState} retryCore={retryCore} lang={lang} close={()=>setSelected(null)}/>{selected.sourceType==="continuous-control"&&<FindingControlContextPanel key={selected.id} findingId={selected.id} lang={lang} close={()=>setSelected(null)}/>}{selected.sourceType==="audit"&&<WorkpaperCapaOriginPanel key={selected.id} findingId={selected.id} tr={tr} close={()=>setSelected(null)}/>}<FindingHistoryPanel key={`${selected.id}:${selected.updatedAt}`} findingId={selected.id} lang={lang}/><footer>{available?.start&&<button disabled={busy||loading||loadError} onClick={()=>startAction(selected,"start")}>{tr?"CAPA'yı başlat":"Start CAPA"}</button>}{available?.acceptRisk&&<button className="secondary" disabled={busy||loading||loadError} onClick={()=>startAction(selected,"accept-risk")}>{tr?"Riski kabul et":"Accept risk"}</button>}{available?.submit&&<button disabled={busy||loading||loadError} onClick={()=>startAction(selected,"submit")}>{tr?"Doğrulamaya gönder":"Submit for verification"}</button>}{available?.verify&&<button disabled={busy||loading||loadError} onClick={()=>startAction(selected,"verify")}>{tr?"Doğrula ve kapat":"Verify & close"}</button>}{available?.reopen&&<button className="secondary" disabled={busy||loading||loadError} onClick={()=>startAction(selected,"reopen")}>{tr?"Yeniden aç":"Reopen"}</button>}</footer></article></FindingDialog>}
  {form&&<FindingDialog label={tr?"Yeni kurumsal bulgu":"New enterprise finding"} busy={busy} onClose={()=>setForm(null)}><form className="finding-form" onSubmit={create}><header><div><small>{tr?"KONTROLLÜ CAPA KAYDI":"CONTROLLED CAPA RECORD"}</small><h3>{tr?"Yeni kurumsal bulgu":"New enterprise finding"}</h3></div><button type="button" disabled={busy} aria-label={tr?"Kapat":"Close"} onClick={()=>setForm(null)}>×</button></header><fieldset disabled={busy} className="finding-form-grid"><label>{tr?"Kaynak türü":"Source type"}<select aria-label={tr?"Kaynak türü":"Source type"} value={form.sourceType} onChange={e=>setForm({...form,sourceType:e.target.value,sourceMode:hasSourceCatalog(e.target.value)?"record":"external",sourceRef:"",sourceTitle:"",sourceDisplay:"",mappedControls:"",targetControlRef:""})}>{FINDING_SOURCES.map(x=><option key={x} value={x}>{findingLabel(x,lang)}</option>)}</select></label><label>{tr?"Bulgu türü":"Finding type"}<select aria-label={tr?"Bulgu türü":"Finding type"} value={form.findingType} onChange={e=>setForm({...form,findingType:e.target.value})}>{["nonconformity","control-deficiency","observation","vulnerability","incident-action","improvement"].map(x=><option key={x} value={x}>{findingLabel(x,lang)}</option>)}</select></label><FindingSourceFields key={form.sourceType} tr={tr} form={form} update={patch=>setForm(current=>current&&({...current,...patch}))}/>{form.sourceType!=="continuous-control"&&<><Field wide label={tr?"Bulgu başlığı":"Finding title"} name="title" form={form} setForm={setForm}/><Field wide area label={tr?"Açıklama":"Description"} name="description" form={form} setForm={setForm}/><label>{tr?"Önem":"Severity"}<select aria-label={tr?"Önem":"Severity"} value={form.severity} onChange={e=>{const severity=e.target.value;setForm({...form,severity,dueDate:addDays(today(),findingSlaDays(severity))})}}>{["low","medium","high","critical"].map(x=><option key={x} value={x}>{findingLabel(x,lang)}</option>)}</select></label></>}<Field type="date" label={tr?"SLA termini":"SLA due date"} name="dueDate" form={form} setForm={setForm}/><FindingPersonField tr={tr} label={tr?"Aksiyon sahibi":"Action owner"} value={form.owner} onChange={owner=>setForm({...form,owner,reviewer:owner.toLowerCase()===form.reviewer.toLowerCase()?"":form.reviewer})}/><FindingPersonField tr={tr} label={tr?"Bağımsız doğrulayıcı":"Independent reviewer"} reviewer exclude={[currentUser.email,form.owner]} value={form.reviewer} onChange={reviewer=>setForm({...form,reviewer})}/><Field wide area label={tr?"Kök neden":"Root cause"} name="rootCause" form={form} setForm={setForm}/><Field wide area label={tr?"Düzeltici aksiyon":"Corrective action"} name="correctiveAction" form={form} setForm={setForm}/><Field wide area label={tr?"Önleyici aksiyon":"Preventive action"} name="preventiveAction" form={form} setForm={setForm}/>{form.sourceType!=="continuous-control"&&(["riskRef","controlRef"] as const).map(field =>
    <FindingReferencePicker key={field} tr={tr} label={field==="riskRef" ? (tr?"Bağlı risk":"Linked risk") : (tr?"Bağlı kontrol":"Linked control")}
      targets={targets[field]} value={form[field]} onChange={id=>setForm(current=>current&&({...current,[field]:id}))}
      state={coreState} retry={retryCore}/>
  )}</fieldset>{notice&&<p className="finding-dialog-notice" role="alert">{notice}</p>}<footer><button type="button" disabled={busy} className="secondary" onClick={()=>setForm(null)}>{tr?"İptal":"Cancel"}</button><button disabled={busy||loading||loadError}>{form.sourceType==="continuous-control"?(tr?"Bağımsız onaya gönder":"Submit for independent approval"):(tr?"Bulgu ve CAPA oluştur":"Create finding & CAPA")}</button></footer></form></FindingDialog>}
  {action&&<FindingDecisionDialog key={`${action.finding.id}:${action.operation}`} id={action.finding.id} operation={action.operation} tr={tr} actor={currentUser} onBusy={decisionBusy} close={refresh=>{setAction(null);if(refresh)void load();}}/>}
  {events.length>0&&<details className="finding-history"><summary>{tr?"Son denetim izi olayları":"Recent audit trail events"}</summary>{events.slice(0,20).map(x=><div key={x.id}><b>{findingLabel(x.action,lang)}</b><span>{x.code} · {x.actor}</span><small>{x.fromStatus&&findingLabel(x.fromStatus,lang)+" → "}{findingLabel(x.toStatus,lang)} · {findingTimestamp(x.createdAt,lang)}</small></div>)}</details>}
 </section>
}
function Field({label,name,form,setForm,wide=false,area=false,type="text"}:{label:string;name:string;form:Record<string,string>;setForm:(x:Record<string,string>)=>void;wide?:boolean;area?:boolean;type?:string}){return <label className={wide?"wide":""}>{label}{area?<textarea aria-label={label} value={form[name]} onChange={e=>setForm({...form,[name]:e.target.value})}/>:<input aria-label={label} type={type} value={form[name]} onChange={e=>setForm({...form,[name]:e.target.value})}/>}</label>}
