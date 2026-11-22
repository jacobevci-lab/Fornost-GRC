"use client";
import {useContext,useMemo,useState} from "react";
import {ChoiceInput} from "./risk-editor-fields";
import {ModuleTrailContext} from "./module-record-trail-view";
import {buildConnectedGrcGraph,connectedTitle,type ConnectedGrcRow} from "./connected-grc-model";
import {navigateToFornost} from "./navigation-focus";
import {normalizeRiskSearch} from "./risk-record-options";

export {DirectoryPersonCombobox as VendorPerson} from "./directory-person-combobox";
export function recordCode(row:ConnectedGrcRow){return [row.code,row.id].find(v=>v&&/^(AST|BIA|EVD)-\d{3,}$/i.test(v));}
export function VendorEvidenceField({tr,selected,change}:{tr:boolean;selected:string[];change:(refs:string[])=>void}){
  const context=useContext(ModuleTrailContext),[query,setQuery]=useState("");
  const items=useMemo(()=>(context?.rows||[]).filter(r=>r.module==="Kanıtlar").map(r=>({value:r.id,code:recordCode(r),label:[recordCode(r),r.data.evidenceTitle||r.data.title].filter(Boolean).join(" · ")||"—"})),[context?.rows]);
  const ready=context?.coreState==="ready",search=normalizeRiskSearch(query);
  return <div className="wide"><ChoiceInput tr={tr} label={tr?"Destekleyici Güvence Belgeleri / Kanıtlar (SOC 2, ISO 27001, DPA)":"Supporting assurance documents / evidence (SOC 2, ISO 27001, DPA)"}
    query={query} onQuery={setQuery} options={ready?items.filter(o=>!selected.some(ref=>ref===o.value||ref===o.code)&&normalizeRiskSearch(o.label).includes(search)):[]}
    choose={id=>change([...new Set([...selected,id])])} pending={context?.coreState==="loading"} />
    {context?.coreState==="error"&&<button type="button" onClick={context.retryCore}>{tr?"Kanıtları yeniden yükle":"Retry evidence list"}</button>}
    <div className="tprm-chips">{selected.map(id=><button type="button" key={id} onClick={()=>change(selected.filter(k=>k!==id))}>{items.find(x=>x.value===id||x.code===id)?.label||"—"} ×</button>)}</div>
  </div>;
}
export function useVendorLinks(includeAssetProcesses=false){
  const context=useContext(ModuleTrailContext), coreRows=context?.rows, ready=context?.coreState==="ready";
  return useMemo(()=>{
    if(!ready || !coreRows)return null;
    const rows=coreRows.filter(r=>["Varlık Envanteri","BIA","Tedarikçiler"].includes(r.module));
    const result=new Map<string,ConnectedGrcRow[]>();
    const edges=buildConnectedGrcGraph(rows).links;
    for(const link of edges){
      if(!["asset-vendor","bia-supplier"].includes(link.relation))continue;
      const set=result.get(link.target.id)||[];
      if(!set.some(r=>r.id===link.source.id))set.push(link.source);
      result.set(link.target.id,set);
    }
    if(includeAssetProcesses){
      const processes=new Map<string,ConnectedGrcRow[]>();
      for(const edge of edges){
        const pair=[edge.source,edge.target];
        const asset=pair.find(r=>r.module==="Varlık Envanteri"),bia=pair.find(r=>r.module==="BIA");
        if(asset&&bia){const group=processes.get(asset.id)||[];group.push(bia);processes.set(asset.id,group);}
      }
      for(const [id,direct] of result){
        const all=new Map(direct.map(r=>[r.id,r]));
        for(const asset of direct.filter(r=>r.module==="Varlık Envanteri")){
          for(const bia of processes.get(asset.id)||[])all.set(bia.id,bia);
        }
        result.set(id,[...all.values()]);
      }
    }
    return result;
  },[ready,coreRows,includeAssetProcesses]);
}
export function VendorRecordLinks({rows,tr}:{rows?:ConnectedGrcRow[];tr:boolean}){
  return rows?.length?<div className="tprm-chips">{rows.map(row=><button type="button" key={row.id} title={connectedTitle(row)}
    onClick={()=>navigateToFornost({module:row.module,kind:"record",ref:recordCode(row)||row.id})}>{recordCode(row)||String(row.data.process||row.data.title||row.data.evidenceTitle||(tr?"Kaydı aç":"Open record"))}</button>)}</div>:<>—</>;
}
