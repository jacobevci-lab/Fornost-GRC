"use client";
import {useContext,useState} from "react";
import {documentKinds,documentTypes,validity,criticalSupplier,renewalNeeded,daysLeft,recoverySummary,decisionChecks,type AssuranceVendor,type DocumentKind,type AssuranceDocument} from "./third-party-risk/assurance";
import {validReviewDate} from "./third-party-risk/review-schedule";
import {WorkflowEvidencePicker} from "./workflow-selection-fields";
import {ModuleTrailContext} from "./module-record-trail-view";
import {useVendorLinks,recordCode} from "./third-party-intake-fields";
import {connectedTitle} from "./connected-grc-model";
import {navigateToFornost} from "./navigation-focus";
import {recoveryHoursLabel} from "./bia-recovery";

const labels={valid:["Geçerli","Valid"],soon:["Yakında Doluyor","Expiring soon"],expired:["Süresi Doldu","Expired"],missing:["Eksik","Missing"]} as const;
const formatDate=(date?:string)=>date&&validReviewDate(date)?date.split("-").reverse().join("."):"—";
const renewal=["Yenileme / Belge Bekliyor","Renewal / document pending"];
export function RenewalWarning({v,tr}:{v:AssuranceVendor;tr:boolean}){
  return renewalNeeded(v)?<strong className="tprm-flag expired">{renewal[tr?0:1]}</strong>:null;
}
type Write=(body:Record<string,unknown>)=>Promise<boolean>;
function DocumentEditor({kind,doc,v,tr,save,busy,close}:{kind:DocumentKind;doc?:AssuranceDocument;v:AssuranceVendor;tr:boolean;save:Write;busy:boolean;close:()=>void}){
  const [choice,setChoice]=useState({evidenceId:doc?.evidenceId||"",versionId:doc?.versionId||""});
  const [date,setDate]=useState(doc?formatDate(doc.expires):"");
  const [error,setError]=useState(false),[revision]=useState(doc?.revision||"");
  const iso=date.split(".").reverse().join("-"),dateOk=validReviewDate(iso);
  const [confirmRemove,setConfirmRemove]=useState(false);
  async function persist(remove:boolean){
    setError(false);
    if(await save({action:"save-assurance",kind,vendorId:v.vendorId,expectedRevision:revision,...(remove?{remove:true}:{expires:iso,evidenceMode:"library",evidenceSelection:choice})}))close();
    else setError(true);
  }
  return <div className="tprm-doc-editor"><WorkflowEvidencePicker document tr={tr} value={choice} onChange={setChoice}/>
    <label>{tr?"Geçerlilik Bitiş Tarihi (gg.aa.yyyy)":"Valid until (dd.mm.yyyy)"}<input value={date} maxLength={10} placeholder={tr?"gg.aa.yyyy":"dd.mm.yyyy"} onChange={e=>setDate(e.target.value)} aria-invalid={Boolean(date&&!dateOk)}/></label>
    {error&&<p role="alert">{tr?"Kayıt güncellenemedi. Güncel satırı kontrol edip düzenlemeyi yeniden açın.":"Could not update. Inspect the current row and reopen the editor."}</p>}
    <div className="tprm-row-actions"><button disabled={busy||!choice.versionId||!dateOk} onClick={()=>void persist(false)}>{tr?"Kaydet":"Save"}</button><button disabled={busy} onClick={close}>{tr?"Vazgeç":"Cancel"}</button>
    {doc&&<button disabled={busy} onClick={()=>confirmRemove?void persist(true):setConfirmRemove(true)}>{confirmRemove?(tr?"Bağın kaldırılmasını onayla":"Confirm unlink"):(tr?"Bağı kaldır":"Unlink")}</button>}</div></div>;
}
export function SupplierDocuments({v,tr,edit,save,busy}:{v:AssuranceVendor;tr:boolean;edit:boolean;save:Write;busy:boolean}){
  const [editing,setEditing]=useState<DocumentKind|null>(null);
  return <section className="tprm-assurance"><h4>{tr?"Güvence Belgeleri & Sertifikalar":"Assurance documents & certificates"}</h4><RenewalWarning v={v} tr={tr}/>
    <ul>{documentKinds.map(kind=>{const doc=v.documents?.find(d=>d.kind===kind),status=validity(doc);
      return <li key={kind}><div className="tprm-doc-heading"><strong>{documentTypes[kind][tr?0:1]}</strong><span className={"tprm-flag "+status+(status==="missing"&&criticalSupplier(v.criticality)?" important":"")}>{labels[status][tr?0:1]}</span></div>
        {doc&&<p>{doc.code||"—"} · {doc.title} · v{doc.versionNo} · {formatDate(doc.expires)}</p>}
        {editing===kind?<DocumentEditor v={v} kind={kind} tr={tr} doc={doc} save={save} busy={busy} close={()=>setEditing(null)}/>:edit&&<button type="button" disabled={busy} onClick={()=>setEditing(kind)}>{doc?(tr?"Belgeyi düzenle":"Edit document"):(tr?"Kanıt Kütüphanesinden Seç":"Select from Evidence Library")}</button>}</li>;
    })}</ul></section>;
}
export function ExpiryQueue({vendors,tr,open}:{vendors:AssuranceVendor[];tr:boolean;open:(id:string)=>void}){
  const entries=vendors.filter(v=>!["offboarded","excluded","cancelled","rejected"].includes(v.status)).flatMap(v=>{
    const documents:{date:string;text:string;status:keyof typeof labels}[]=(v.documents||[]).filter(d=>["expired","soon"].includes(validity(d))).map(d=>({date:d.expires,text:documentTypes[d.kind][tr?0:1],status:validity(d)}));
    const days=daysLeft(v.contractEnd);
    if(days!==null&&days<=90)documents.push({date:v.contractEnd!,text:tr?"Sözleşme":"Contract",status:days<0?"expired":"soon"});
    if(!documents.length&&!renewalNeeded(v))return [];
    return [{v,documents:documents.sort((a,b)=>a.date.localeCompare(b.date))}];
  }).sort((a,b)=>(a.documents[0]?.date||"9999").localeCompare(b.documents[0]?.date||"9999")||a.v.name.localeCompare(b.v.name));
  return <section className="tprm-assurance tprm-expiry"><h3>{tr?"Belge / Sözleşme Süresi Dolacaklar":"Document / contract expirations"}</h3>{!entries.length?<p>{tr?"Yenileme bekleyen belge veya sözleşme bulunmuyor.":"No documents or contracts are awaiting renewal."}</p>:<ul>{entries.map(({v,documents})=><li key={v.vendorId}><div className="tprm-doc-heading"><button type="button" onClick={()=>open(v.vendorId)}>{v.name} →</button><RenewalWarning v={v} tr={tr}/></div>{documents.map(d=><p key={d.text}>{d.text} · {formatDate(d.date)} <span className={"tprm-flag "+d.status}>{labels[d.status][tr?0:1]}</span></p>)}</li>)}</ul>}</section>;
}
export function BlastRadius({id,tr}:{id:string;tr:boolean}){
  const context=useContext(ModuleTrailContext),links=useVendorLinks(true),rows=links?.get(id)||[];
  const processes=rows.filter(r=>r.module==="BIA"),metrics=recoverySummary(processes);
  return <section className="tprm-assurance"><h4>{tr?"Etki Alanı (Blast Radius)":"Blast radius"}</h4>
    {!links?<p>{context?.coreState==="loading"?(tr?"Bağlantılar yükleniyor…":"Loading links…"):(tr?"Bağlantılar doğrulanamadı.":"Connections unavailable.")} {context?.coreState==="error"&&<button onClick={context.retryCore}>{tr?"Yenile":"Retry"}</button>}</p>:
    !rows.length?<p>{tr?"Bağlı varlık veya BIA süreci bulunmuyor.":"No linked assets or BIA processes."}</p>:<>
    <p className="tprm-score">{tr?"En kritik bağımlılık":"Most critical dependency"} · RTO {recoveryHoursLabel(metrics.rto,tr)} / RPO {recoveryHoursLabel(metrics.rpo,tr)} · {metrics.critical??"—"} {tr?"kritik süreç":"critical processes"}</p>
    <div className="tprm-chips">{rows.map(row=><button key={row.id} onClick={()=>navigateToFornost({module:row.module,kind:"record",ref:row.id})}>{recordCode(row)||"—"} · {connectedTitle(row)}</button>)}</div></>}</section>;
}
export type Checks=ReturnType<typeof decisionChecks>;
export function GateChecklist({checks,tr}:{checks:Checks;tr:boolean}){
  const names={owners:tr?"İş sahibi ve risk sahibi atandı":"Business and risk owners assigned",reviewer:tr?"Sahiplerden bağımsız, etkin Admin incelemeci atandı":"Active Admin reviewer independent of both owners",score:tr?"Due diligence puanlaması tamamlandı":"Due diligence scoring complete",support:tr?"Destekleyici belge veya risk kabul gerekçesi var":"Supporting document or risk acceptance rationale provided"};
  return <section className="tprm-gate"><h4>{tr?"Ön Koşul Kontrol Listesi":"Decision prerequisites"}</h4><ul>{(Object.keys(names) as (keyof Checks)[]).map(k=><li key={k}><span className={"tprm-flag "+(checks[k]?"valid":"missing")}>{checks[k]?(tr?"Tamam":"Met"):(tr?"Eksik":"Missing")}</span> {names[k]}</li>)}</ul></section>;
}
export type GateRecord={checks:Checks;actor:string;at:string;decision:string;riskAcceptanceReason:string;businessOwner:string;riskOwner:string;reviewer:string;score:{inherentScore:number;residualScore:number};documents:AssuranceDocument[];supportIds:string[];decisionEvidence:{versionId:string}|null};
export function GateHistory({record:r,tr}:{record?:GateRecord|null;tr:boolean}){
  if(!r)return null;
  return <details className="tprm-gate"><summary>{tr?"Karar anındaki ön koşullar":"Prerequisites at decision"}</summary>
    <p>{r.actor} · {formatDate(r.at.slice(0,10))} · {({approved:tr?"Onaylandı":"Approved",conditional:tr?"Koşullu kabul":"Conditional",rejected:tr?"Reddedildi":"Rejected"})[r.decision]}</p>
    <GateChecklist checks={r.checks} tr={tr}/><p>{tr?"İş sahibi / Risk sahibi":"Business / risk owner"} · {r.businessOwner} / {r.riskOwner}</p>
    <p>{tr?"Doğal / kalıntı risk":"Inherent / residual risk"} · {r.score.inherentScore} / {r.score.residualScore}</p>
    {r.documents.map(d=><p key={d.kind}>{d.code||"—"} · {d.title} · v{d.versionNo} · {formatDate(d.expires)}</p>)}
    {r.riskAcceptanceReason&&<p>{tr?"Risk kabul gerekçesi":"Risk acceptance rationale"} · {r.riskAcceptanceReason}</p>}</details>;
}
