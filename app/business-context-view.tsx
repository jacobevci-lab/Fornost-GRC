"use client";
import { useEffect, useMemo, useState } from "react";
import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow as Row } from "./connected-grc-model";
import { loadConnectedGrcSources } from "./connected-grc-loader";
import { buildConnectedGrcEnterpriseRows } from "./connected-grc-sources";
import { businessContext } from "./business-context";
import NavIcon from "./nav-icon";
import "./business-context.css";

export function useContinuityContext(enabled:boolean,scope:Row[]) {
  const [attempt,setAttempt]=useState(0);
  const [snapshot,setSnapshot]=useState<{scope:Row[];attempt:number;rows:Row[];partial:boolean}|null>(null);
  useEffect(()=>{
    if (!enabled) return;
    const controller=new AbortController();
    void loadConnectedGrcSources({includeAi:false,sourceKeys:["continuity"],signal:controller.signal}).then(result=>{
      if (!controller.signal.aborted) setSnapshot({scope,attempt,rows:buildConnectedGrcEnterpriseRows(result.payloads),partial:!!result.issues.length});
    });
    return ()=>controller.abort();
  },[enabled,scope,attempt]);
  const current=enabled && snapshot?.scope===scope && snapshot.attempt===attempt ? snapshot : null;
  return {rows:current?.rows,loading:enabled&&!current,partial:!!current?.partial,retry:()=>setAttempt(v=>v+1)};
}
const labels={asset:["Varlık","Asset"],risk:["Risk","Risk"],bia:["İş etki analizi (BIA)","Business impact analysis (BIA)"],plan:["İş sürekliliği planı","Business continuity plan"]};
export function BusinessContextView({anchor,links,tr,openRecord,loading=false,partial=false,scoped=false,retry}:{
  anchor:Row;links:ConnectedGrcLink[];tr:boolean;openRecord:(row:Row)=>void;loading?:boolean;partial?:boolean;scoped?:boolean;retry?:()=>void;
}) {
  const groups=useMemo(()=>businessContext(anchor,links),[anchor,links]);
  return <section className="business-context" aria-label={tr?"Varlık, risk ve iş sürekliliği":"Asset, risk and continuity"}>
    <h4>{tr?"Varlık, risk ve iş sürekliliği":"Asset, risk and continuity"}</h4>
    <div className="business-context-stages">{groups.map(({stage,nodes})=><section key={stage} data-context-stage={stage}>
      <h5>{labels[stage][tr?0:1]}</h5>
      {nodes.length?<ul>{nodes.map(({row,via})=><li key={row.id}>
        <button type="button" aria-current={row.id===anchor.id?"true":undefined} disabled={row.id===anchor.id} onClick={()=>openRecord(row)}>
          <NavIcon module={row.module}/><span><small>{row.code}</small><b>{connectedTitle(row)}</b></span>
        </button>
        {via.length>0 && <small className="context-via">{tr?"Bağlantı yolu":"Via"} · {via.map(connectedTitle).join(" → ")}</small>}
      </li>)}</ul>:<p>{stage==="asset" && anchor.module==="Risk Assessment" && anchor.data.riskScope==="organization"?(tr?"Varlıktan bağımsız risk":"Asset-independent risk"):
        stage==="plan" && loading?(tr?"Planlar yükleniyor…":"Loading plans…"):
        stage==="plan" && scoped?(tr?"Planlar erişim kapsamı dışında.":"Plans are outside your access scope."):
        stage==="plan" && partial?(tr?"Plan bağlantıları doğrulanamadı.":"Plan links could not be verified."):
        (tr?"Görünür bağlantı yok":"No visible link")}</p>}
    </section>)}</div>
    {partial && <p role="status">{tr?"Plan kaynağı eksik olabilir.":"The plan source may be incomplete."} {retry && <button onClick={retry}>{tr?"Yeniden dene":"Retry"}</button>}</p>}
  </section>;
}
