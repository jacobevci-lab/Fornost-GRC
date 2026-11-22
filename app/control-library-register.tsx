"use client";
import {createContext,useContext} from "react";
import type {controlConnections} from "./control-library-model";
import type {ConnectedGrcRow} from "./connected-grc-model";
import {navigateToFornost} from "./navigation-focus";
export const ControlRegisterContext=createContext<{links:ReturnType<typeof controlConnections>;risks:boolean;evidence:boolean;attach?:(row:ConnectedGrcRow)=>void}|null>(null);
export function ControlLinksCell({row,tr,kind}:{row:ConnectedGrcRow;tr:boolean;kind:"risks"|"evidence"}){
  const ctx=useContext(ControlRegisterContext);
  if(!ctx?.[kind])return <>—</>;
  const records=Array.from(ctx.links.get(row.id)?.[kind].values()||[]);
  if(kind==="evidence")return <div className="control-evidence-cell"><span className={"coverage-count "+(records.length?"ok":"miss")}>{records.length} {tr?"kanıt":"evidence"}</span>
    {!records.length&&ctx.attach&&<button type="button" onClick={()=>ctx.attach?.(row)}>{tr?"+ Kanıt Bağla":"+ Link evidence"}</button>}</div>;
  return records.length?<div className="asset-link-counts">{records.map(r=><button type="button" key={r.id} title={String(r.data.title||"")}
    onClick={()=>navigateToFornost({module:r.module,kind:"record",ref:r.id})}>{[r.code,r.id].find(x=>x&&/^RSK-\d+$/i.test(x))||String(r.data.title||"—")}</button>)}</div>:<>—</>;
}
