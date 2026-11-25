"use client";
import { useState } from "react";
import "./ai-action-list.css";

type RecordItem = { id: string; title: string; modelId: string; status: string; severity: string; owner?: string; sourceRef?: string; findingId?: string; state?: string };
export const aiStatusLabels: Record<string,string> = { draft:"Taslak",approved:"Onaylı",suspended:"Askıda",retired:"Emekli",open:"Açık", "in-progress":"Aksiyonda", verification:"Doğrulamada", resolved:"Kapatılan", dismissed:"Reddedilen", acknowledged:"Kabul edilen", escalated:"CAPA'ya aktarılan", overdue:"Geciken", priority:"Öncelikli" };
export const aiSeverityLabels: Record<string,string> = { Low:"Düşük", Medium:"Orta", High:"Yüksek", Critical:"Kritik" };

export function useAiActionList<T extends RecordItem>(items:T[], focusRef:string|undefined, closeAction:()=>void) {
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[severity,setSeverity]=useState("all"),[page,setPage]=useState(0);
  const needle=query.trim().toLocaleLowerCase("tr");
  const filtered=items.filter(item=>focusRef?item.id===focusRef:
    (status==="all"||(status==="overdue"?item.state:item.status)===status)&&
    (severity==="all"||item.severity===severity)&&
    (!needle||[item.id,item.title,item.modelId,item.owner,item.sourceRef,item.findingId].filter(Boolean).join(" ").toLocaleLowerCase("tr").includes(needle)));
  const pages=Math.max(1,Math.ceil(filtered.length/10)),currentPage=Math.min(page,pages-1);
  function change(field:"query"|"status"|"severity",value:string){closeAction();setPage(0);({query:setQuery,status:setStatus,severity:setSeverity})[field](value);}
  function reset(){closeAction();setQuery("");setStatus("all");setSeverity("all");setPage(0);}
  return {query,status,severity,change,reset,filtered,visible:filtered.slice(currentPage*10,currentPage*10+10),pages,page:currentPage,setPage:(value:number)=>{closeAction();setPage(Math.max(0,Math.min(value,pages-1)));}};
}

type ListControls = Pick<ReturnType<typeof useAiActionList>,"query"|"status"|"severity"|"change"|"reset"|"page"|"pages"|"setPage">;
export function AiActionListFilters({list,statuses,disabled,severityLabel="Önem",lang="tr",hasExtraFilters=false}:{list:ListControls;statuses:string[];disabled:boolean;severityLabel?:string;lang?:"tr"|"en";hasExtraFilters?:boolean}) {
  const t=(tr:string,en:string)=>lang==="tr"?tr:en;
  return <div className="ai-action-list-filters">
    <label><span>{t("Kayıt ara", "Search records")}</span><input aria-label={t("Kayıt ara", "Search records")} placeholder={t("Başlık, sorumlu veya kayıt referansı", "Title, owner or record reference")} value={list.query} disabled={disabled} onChange={e=>list.change("query",e.target.value)}/></label>
    <label><span>{t("Durum", "Status")}</span><select aria-label={t("Kayıt durumu", "Record status")} value={list.status} disabled={disabled} onChange={e=>list.change("status",e.target.value)}><option value="all">{t("Tüm durumlar", "All statuses")}</option>{statuses.map(status=><option key={status} value={status}>{lang==="tr"?(aiStatusLabels[status]||status):status}</option>)}</select></label>
    <label><span>{severityLabel}</span><select aria-label={t("Kayıt önemi", "Record severity")} value={list.severity} disabled={disabled} onChange={e=>list.change("severity",e.target.value)}><option value="all">{t("Tüm düzeyler", "All levels")}</option>{Object.entries(aiSeverityLabels).map(([value,label])=><option key={value} value={value}>{lang==="tr"?label:value}</option>)}</select></label>
    <button disabled={disabled||(!hasExtraFilters&&!list.query&&list.status==="all"&&list.severity==="all")} onClick={list.reset}>{t("Filtreleri temizle", "Clear filters")}</button>
  </div>;
}
export function AiActionListPages({list,disabled,lang="tr"}:{list:ListControls;disabled:boolean;lang?:"tr"|"en"}) {
  const t=(tr:string,en:string)=>lang==="tr"?tr:en;
  if(list.pages<=1)return null;
  return <nav className="ai-action-list-pages" aria-label={t("Kayıt sayfaları", "Record pages")}><button disabled={disabled||list.page===0} onClick={()=>list.setPage(list.page-1)}>{t("Önceki", "Previous")}</button><span>{t("Sayfa", "Page")} {list.page+1} / {list.pages}</span><button disabled={disabled||list.page+1===list.pages} onClick={()=>list.setPage(list.page+1)}>{t("Sonraki", "Next")}</button></nav>;
}
