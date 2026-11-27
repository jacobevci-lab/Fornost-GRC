"use client";
import { useEffect, useMemo, useState } from "react";
import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow as Row } from "./connected-grc-model";
import { loadConnectedGrcSources } from "./connected-grc-loader";
import { buildConnectedGrcEnterpriseRows } from "./connected-grc-sources";
import { businessContext } from "./business-context";
import { RelationshipCard, RelationshipList, MissingRelationship, type ChainLinkActions } from "./relationship-chain-card";
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
  async function refresh(){
    if(!enabled)return true;
    const result=await loadConnectedGrcSources({includeAi:false,sourceKeys:["continuity"],signal:AbortSignal.timeout(15000)});
    setSnapshot({scope,attempt,rows:buildConnectedGrcEnterpriseRows(result.payloads),partial:!!result.issues.length});
    return !result.issues.length;
  }
  return {rows:current?.rows,loading:enabled&&!current,partial:!!current?.partial,retry:()=>setAttempt(v=>v+1),refresh};
}
const labels={asset:["Varlık","Asset"],risk:["Risk","Risk"],bia:["İş etki analizi (BIA)","Business impact analysis (BIA)"],plan:["İş sürekliliği planı","Business continuity plan"]};
const modules={asset:"Varlık Envanteri",risk:"Risk Assessment",bia:"BIA",plan:"İş Sürekliliği"};
export function BusinessContextView({anchor,links,tr,openRecord,loading=false,partial=false,scoped=false,retry,canLink,linkRecord,unavailable,incomplete=false}:{
  anchor:Row;links:ConnectedGrcLink[];tr:boolean;openRecord:(row:Row)=>void;loading?:boolean;partial?:boolean;scoped?:boolean;retry?:()=>void;incomplete?:boolean;
}&ChainLinkActions) {
  const groups=useMemo(()=>businessContext(anchor,links),[anchor,links]);
  const sources=[anchor,...groups.flatMap(group=>group.nodes.map(node=>node.row))];
  return <section className="business-context" aria-label={tr?"Varlık, risk ve iş sürekliliği":"Asset, risk and continuity"}>
    <h4>{tr?"Varlık, risk ve iş sürekliliği":"Asset, risk and continuity"}</h4>
    <div className="business-context-stages">{groups.map(({stage,nodes})=>{
      const targetModule=modules[stage],source=sources.find(row=>canLink?.(row,targetModule));
      const message=incomplete?(tr?"Kayıt bağlantıları doğrulanamadı.":"Record links could not be verified."):
        stage==="asset"&&anchor.module==="Risk Assessment"&&anchor.data.riskScope==="organization"?(tr?"Varlıktan bağımsız risk":"Asset-independent risk"):
        stage==="plan"&&loading?(tr?"Planlar yükleniyor…":"Loading plans…"):
        stage==="plan"&&scoped?(tr?"Planlar erişim kapsamı dışında.":"Plans are outside your access scope."):
        stage==="plan"&&partial?(tr?"Plan bağlantıları doğrulanamadı.":"Plan links could not be verified."):undefined;
      return <section key={stage} data-context-stage={stage}>
        <h5>{labels[stage][tr?0:1]}</h5>
        {nodes.length?<RelationshipList key={anchor.id+stage} items={nodes} tr={tr} label={labels[stage][tr?0:1]} render={({row,via})=><li key={row.id}>
          <RelationshipCard row={row} anchor={anchor} lang={tr?'tr':'en'} openRecord={openRecord}/>
          {!!via.length&&<small className="context-via">{tr?"Bağlantı yolu":"Via"} · {via.map(connectedTitle).join(" → ")}</small>}
        </li>}/>:<>
          <MissingRelationship source={source} module={targetModule} tr={tr} canLink={canLink} linkRecord={linkRecord} message={message||unavailable?.(targetModule)}/>
          {source&&source.id!==anchor.id&&!message&&<small className="context-via">{tr?'Bağlanacak kayıt':'Link from'} · {source.code} · {connectedTitle(source)}</small>}
        </>}
      </section>;
    })}</div>
    {partial && <p role="status">{tr?"Plan kaynağı eksik olabilir.":"The plan source may be incomplete."} {retry && <button onClick={retry}>{tr?"Yeniden dene":"Retry"}</button>}</p>}
  </section>;
}
