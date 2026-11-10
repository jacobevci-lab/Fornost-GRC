"use client";
import {useContext,useMemo,type ReactNode} from "react";
import {withBasePath} from "../base-path";
import {useWorkflowRecords} from "../use-workflow-records";
import {ModuleTrailContext} from "../module-record-trail-view";
import {resolveCoreRecord} from "../core-record-focus";
import {navigateToFornost} from "../navigation-focus";
import {comparePolicyText} from "./text-comparison";

export type Version={sourceName?:string;sourceHash?:string;id:string;policyId:string;versionNumber:number;summary:string;content:string;contentSha256:string;controlRefs:string[];regulationRefs:string[];riskRefs:string[];effectiveDate:string;status:string;createdBy:string;submittedBy?:string;approvedBy?:string;publishedBy?:string;updatedAt:string};
type Policy={id:string;code:string;title:string;owner:string;reviewer:string;current_version_id:string|null;status:string};
type Link={id:string;label:string};
export type RelatedKind="exceptions"|"assignments"|"campaigns";
type Comparison={exceptions:Link[];assignments:Link[];campaigns:Link[];policy:Policy;selected:Version;published:Version|null;history:{id:string;number:number;status:string}[]};
const labels:Record<string,[string,string]>={draft:["Taslak","Draft"],review:["İncelemede","In review"],approved:["Onaylandı","Approved"],published:["Yayında","Published"],rejected:["Reddedildi","Rejected"],superseded:["Önceki sürüm","Superseded"]};

function References({refs,modules}:{refs:string[];modules:string[]}){
  const context=useContext(ModuleTrailContext);
  return refs.length?<>{refs.map(ref=>{
    for(const targetModule of modules){
      const row=context?.coreState==="ready"&&resolveCoreRecord(context.rows,{module:targetModule,kind:"record",ref});
      if(row)return <button type="button" key={ref} onClick={()=>navigateToFornost({module:targetModule,kind:"record",ref:row.id})}>{String(row.data.title||row.code||ref)}</button>;
    }
    return <span key={ref}>{ref}</span>;
  })}</>:<>—</>;
}
export function PolicyVersionComparison({id,tr,select,actions,openRelated}:{openRelated:(kind:RelatedKind,id:string)=>void;id:string;tr:boolean;select:(id:string)=>void;actions:(v:Version,p:Policy)=>ReactNode}){
  const source=useWorkflowRecords<Comparison>("/api/policy-lifecycle?view=comparison&versionId="+encodeURIComponent(id),null);
  const data=source.data;
  const v=data?.selected,p=data?.policy,live=data?.published;
  const compare=!!(live&&v&&live.id!==v.id);
  const diff=useMemo(()=>live&&v&&compare?comparePolicyText(live.content,v.content):null,[compare,live,v]);
  if(source.loading)return <p className="pwl-pad" role="status">{tr?"Sürüm yükleniyor…":"Loading version…"}</p>;
  if(!source.ready||!p||!v||v.id!==id||v.policyId!==p.id||(live&&(live.policyId!==p.id||live.id!==p.current_version_id))||!Array.isArray(data?.history))return <p className="pwl-pad" role="alert">{tr?"Seçilen sürüm alınamadı.":"The selected version is unavailable."} <button onClick={()=>void source.reload()}>{tr?"Yeniden dene":"Retry"}</button></p>;
  const status=(s:string)=>labels[s]?.[tr?0:1]||s;
  const broken=!!p.current_version_id&&!live&&p.status!=="retired";
  function documentPane(ver:Version,heading:string,parts?:{text:string;changed:boolean}[],previous=false){
    return <section className="pwl-document" aria-label={heading}><header><small>{heading}</small><h4>v{ver.versionNumber} · {status(ver.status)}</h4><span>{["draft","review","approved"].includes(ver.status)?(tr?"Planlanan yürürlük":"Planned effective date"):(tr?"Yürürlük":"Effective")} · {ver.effectiveDate}</span></header>
      <p>{parts?parts.map((part,i)=>part.changed?(previous?<del key={i}>{part.text}</del>:<ins key={i}>{part.text}</ins>):part.text):ver.content}</p></section>;
  }
  return <div className="pwl-compare">
    <div className="pwl-version-head"><div><small>{p.code}</small><h3>{p.title}</h3></div><label>{tr?"İncelenen sürüm":"Selected version"}<select value={v.id} onChange={e=>select(e.target.value)}>{data.history.map(h=><option key={h.id} value={h.id}>v{h.number} · {status(h.status)}</option>)}</select></label></div>
    <dl className="pwl-roles"><div><dt>{tr?"Politika sahibi":"Policy owner"}</dt><dd>{p.owner}</dd></div><div><dt>{tr?"Bağımsız inceleyen":"Independent reviewer"}</dt><dd>{p.reviewer}</dd></div></dl>
    <div className="pwl-summary"><b>{tr?"Değişiklik özeti":"Change summary"} · v{v.versionNumber}</b><p>{v.summary}</p></div>
    {broken?<p role="alert">{tr?"Yayındaki sürüm doğrulanamadı.":"The published version could not be verified."}</p>:!live&&<p>{p.status==="retired"?(tr?"Bu politika yürürlükten kaldırıldı.":"This policy is retired."):(tr?"Bu politikanın henüz yayımlanmış sürümü yok.":"This policy has no published version yet.")}</p>}
    {diff&&!diff.highlighted&&<p>{tr?"Uzun metinler tam olarak gösteriliyor.":"Both long texts are shown in full."}</p>}
    {diff&&live?.content===v.content&&<p>{tr?"Sürüm metinleri aynı.":"The version texts are identical."}</p>}
    <div className={compare?"pwl-documents":"pwl-documents single"}>
      {compare&&live&&documentPane(live,tr?"Yayındaki metin":"Published text",diff?.before,true)}
      {documentPane(v,tr?"Seçilen sürümün metni":"Selected version text",diff?.after)}
    </div>
    {v.sourceName&&<div className="pim-original"><a download href={withBasePath("/api/policy-lifecycle?view=original&versionId="+encodeURIComponent(v.id))}>{tr?"Özgün dosyayı indir":"Download original file"} · {v.sourceName}</a><small>SHA-256 · {v.sourceHash}</small></div>}
    <details className="pwl-references"><summary>{tr?"Bağlı kayıtlar ve içerik özeti":"Linked records and content digest"} · v{v.versionNumber}</summary>
      <dl>{([[tr?"Kontroller":"Controls",v.controlRefs,["Kontroller","Uyum"]],[tr?"Düzenlemeler":"Regulations",v.regulationRefs,[]],[tr?"Riskler":"Risks",v.riskRefs,["Risk Assessment"]]] as [string,string[],string[]][]).map(([name,refs,modules])=><div key={name}><dt>{name}</dt><dd><References refs={refs} modules={modules}/></dd></div>)}<div><dt>SHA-256</dt><dd><code>{v.contentSha256}</code></dd></div></dl>
    </details><details className="pwl-references"><summary>{tr?"Bu sürümün beyanları ve istisnaları":"Acknowledgements and exceptions for this version"}</summary>
      {(["assignments","campaigns","exceptions"] as const).map(kind=>{
        const records=data[kind];if(!records?.length)return null;
        const title=kind==="assignments"?(tr?"Bana atanan beyanlar":"My acknowledgements"):kind==="campaigns"?(tr?"Kampanyalar":"Campaigns"):(tr?"İstisnalar":"Exceptions");
        return <div key={kind}><h4>{title}</h4>{records.slice(0,20).map(record=><button key={record.id} onClick={()=>openRelated(kind,record.id)}>{record.label}</button>)}{records.length>20&&<p>{tr?"İlk 20 kayıt gösteriliyor.":"Showing the first 20 records."}</p>}</div>;
      })}
      {![data.exceptions,data.assignments,data.campaigns].some(records=>records?.length)&&<p>{tr?"Bu sürüm için görüntülenecek kayıt yok.":"There are no related records to show for this version."}</p>}
    </details>{!broken&&p.status!=="retired"&&actions(v,p)}
  </div>;
}
