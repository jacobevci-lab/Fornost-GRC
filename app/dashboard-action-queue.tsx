"use client";
import {useMemo,useState} from "react";
import type {AssuranceRow} from "./control-assurance";
import {priorityActions,type ActionGroup} from "./dashboard-actions";
import {useDashboardActions} from "./use-dashboard-actions";
import {dueTimestamp,isPastDue} from "./due-date";
import {navigateToFornost} from "./navigation-focus";

const filters={all:["Tümü","All"],findings:["Açık Bulgular & CAPA","Open Findings & CAPA"],renewals:["Kanıt Yenilemeleri","Evidence Renewals"],approvals:["Onay Bekleyenler","Pending Approvals"]} as const;
const reasons={audit:["Geciken denetim maddesi","Overdue audit item"],renewal:["Yenileme","Renewal"],finding:["Açık bulgu","Open finding"],approval:["Onay bekliyor","Pending approval"]};
export function DashboardActionQueue({rows,assessedRows,tr,now,upload}:{rows:AssuranceRow[];assessedRows?:AssuranceRow[];tr:boolean;now:number;upload?:()=>void}){
  const [group,setGroup]=useState<ActionGroup>("all"),[limit,setLimit]=useState(6);
  const {findings,reviews,retry}=useDashboardActions(rows);
  const {actions,undated}=useMemo(()=>priorityActions(assessedRows ?? rows,findings?.rows??[],reviews?.rows??[],now),[rows,assessedRows,findings,reviews,now]);
  const items=group==="all"?actions:actions.filter(item=>item.groups.includes(group));
  const needFindings=group!=="renewals",needReviews=group==="all"||group==="approvals";
  const loading=(needFindings&&!findings)||(needReviews&&!reviews);
  const failed=(needFindings&&findings?.complete===false)||(needReviews&&reviews?.complete===false);
  const unknownDates=undated>0&&(group==="all"||group==="renewals");
  const l=tr?0:1;
  const fmt=new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
  return <section className="report-chart priority-actions" aria-labelledby="priority-actions-title">
    <h3 id="priority-actions-title">{tr?"Öncelikli Aksiyon Kuyruğu":"Priority Action Queue"}</h3>
    <div className="priority-tabs" role="group" aria-label={tr?"Aksiyon türü":"Action type"}>{(Object.keys(filters) as ActionGroup[]).map(key=><button type="button" key={key} aria-pressed={key===group} onClick={()=>{setGroup(key);setLimit(6)}}>{filters[key][l]}</button>)}</div>
    {items.length>0&&<ul className="priority-list">{items.slice(0,limit).map(item=><li key={item.id}><div className="priority-identity"><small title={item.code}>{item.code}</small><strong title={item.title}>{item.title}</strong><span>{item.owner}</span></div>
      <span className="priority-badge" data-late={isPastDue(item.due,now)}>{reasons[item.reason][l]}{Number.isFinite(dueTimestamp(item.due))&&<> · {fmt.format(new Date(item.due))}</>}</span>
      <button type="button" aria-label={(tr?"İncele":"Review")+" · "+item.code+" · "+item.title} onClick={()=>navigateToFornost(item.target)}>{tr?"İncele →":"Review →"}</button></li>)}</ul>}
    {items.length>limit&&<button type="button" className="report-link" onClick={()=>setLimit(n=>n+12)}>{tr?"Daha fazla göster":"Show more"} ({limit}/{items.length})</button>}
    {loading&&<p role="status">{tr?"Aksiyon kaynakları kontrol ediliyor…":"Checking action sources…"}</p>}
    {failed&&<p role="status">{tr?"Bazı aksiyon kaynakları doğrulanamadı.":"Some action sources could not be verified."} <button onClick={retry}>{tr?"Yeniden dene":"Retry"}</button></p>}
    {unknownDates&&<p>{undated} {tr?"kanıtın yenileme tarihi belirsiz.":"evidence items have an unknown renewal date."}</p>}
    {!items.length&&!loading&&!failed&&!unknownDates&&<div className="priority-empty"><p>{group==="all"?(tr?"Süresi yaklaşan kanıt veya açık aksiyon bulunmuyor":"No upcoming evidence renewals or open actions"):(tr?"Bu filtreyle eşleşen aksiyon yok.":"No actions match this filter.")}</p>
      {group==="all"&&upload&&<button type="button" className="primary" onClick={upload}>{tr?"+ Kanıt Yükle":"+ Upload evidence"}</button>}</div>}
  </section>;
}
