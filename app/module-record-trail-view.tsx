"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildConnectedGrcGraph, connectedRelationLabels, connectedTitle, type ConnectedGrcLink, type ConnectedGrcRow } from "./connected-grc-model";
import { buildConnectedGrcEnterpriseRows } from "./connected-grc-sources";
import { loadConnectedGrcSources } from "./connected-grc-loader";
import { indexTrailLinks, moduleTrailSources, traceRecords } from "./module-record-trail";
import { hasBusinessContext } from "./business-context";
import { BusinessContextView } from "./business-context-view";
import NavIcon from "./nav-icon";
import "./assurance-chain-view.css";
import "./module-record-trail.css";

type Row = ConnectedGrcRow;
type Lang = "tr" | "en";
type Labels = (module: string) => string;
function optionLabel(row: Row) {
  const name = connectedTitle(row);
  return row.code && row.code !== name ? name + " · " + row.code : name;
}

type TrailView = {chosen:string[]; length:number};

export function RecordTrail({root,links,lang,label,openRecord,view,onChange}: {
  root:Row; links:ConnectedGrcLink[]; lang:Lang; label:Labels; openRecord?:(row:Row)=>void; view?:TrailView; onChange?:(view:TrailView)=>void;
}) {
  const tr = lang === "tr";
  const [local,setLocal] = useState<TrailView>({chosen:[],length:3});
  const {chosen,length} = view || local;
  const change = onChange || setLocal;
  const index = useMemo(() => indexTrailLinks(links), [links]);
  const {nodes,more} = traceRecords(index,root,chosen,length);
  return <div className="assurance-chain module-trail" aria-label={tr ? "Kayıt zinciri" : "Record chain"}>
    <ol>{nodes.map(({row,alternatives,edge},i) => {
      const description = edge && connectedTitle(edge.source) + " → " + (connectedRelationLabels[edge.relation]?.[lang] || edge.relation) + " → " + connectedTitle(edge.target);
      const body = <><NavIcon module={row.module}/><span><small>{label(row.module)}{row.code && " · " + row.code}</small><strong>{connectedTitle(row)}</strong>
        {edge && <small className="trail-edge">{edge.target.id===row.id ? "→ " : "← "}{connectedRelationLabels[edge.relation]?.[lang] || edge.relation}</small>}</span></>;
      return <li key={row.id} data-stage={Math.min(i,2)} data-present="true" data-connected={i ? "yes" : "no"}>
        {openRecord && i > 0 ? <button type="button" className="chain-node" title={description} onClick={() => openRecord(row)}>{body}<i aria-hidden="true">›</i></button> :
          <div className="chain-node" title={description}>{body}</div>}
        {alternatives.length > 1 && <label className="trail-branch"><span>{tr ? "Bağlantı seç" : "Choose connection"}</span><select value={row.id}
          aria-label={tr ? i + ". bağlantıyı seç" : "Choose connection " + i}
          onChange={event => change({chosen:[...nodes.slice(1,i).map(node=>node.row.id),event.target.value],length:Math.max(3,i+1)})}>
          {alternatives.map(option=><option key={option.row.id} value={option.row.id}>{optionLabel(option.row)}</option>)}
        </select></label>}
      </li>;
    })}</ol>
    {nodes.length===1 && <p className="trail-empty">{tr ? "Yüklenen kayıtlarda bu kayıtla eşleşen bir bağlantı bulunamadı." : "No matching links were found in the loaded records."}</p>}
    {(more || length>3) && <div className="trail-controls">
      {more && <button type="button" onClick={()=>change({chosen,length:nodes.length+1})}>{tr ? "Zinciri devam ettir" : "Continue chain"}</button>}
      {length>3 && <button type="button" onClick={()=>change({chosen,length:Math.max(3,nodes.length-1)})}>{tr ? "Bir adım geri" : "Back one step"}</button>}
    </div>}
  </div>;
}

type PanelProps = {module:string; rows:Row[]; lang:Lang; label:Labels; scoped:boolean; includeAi:boolean; coreState:"ready"|"loading"|"error"; retryCore:()=>void; focusedId?:string; pinned?:{kind:string;ref:string}};

type TrailContextValue = Omit<PanelProps,"module"|"focusedId"|"pinned">;
export const ModuleTrailContext = createContext<TrailContextValue | null>(null);

export function CurrentRecordTrail({module,kind,recordRef}:{module:string;kind:string;recordRef:string}) {
  const context = useContext(ModuleTrailContext);
  if (!context || !recordRef) return null;
  return <ModuleTrailPanel key={recordRef} {...context} module={module} pinned={{kind,ref:recordRef}}/>;
}

export function ModuleTrailPanel(props: PanelProps) {
  const [activated,setActivated] = useState(false);
  const tr = props.lang === "tr";
  return <details className="module-trail-panel" onToggle={event=>{if(event.currentTarget.open)setActivated(true);}}>
    <summary><NavIcon module="Bağlantılı GRC"/><b>{tr ? "Bağlantı zinciri" : "Relationship chain"}</b><span aria-hidden="true">⌄</span></summary>
    {activated && <ModuleTrailBody {...props}/>}
  </details>;
}

function ModuleTrailBody({module,rows,lang,label,scoped,includeAi,coreState,retryCore,focusedId,pinned}: PanelProps) {
  const tr = lang === "tr";
  const [selection,setSelection]=useState(focusedId || "");
  const [query,setQuery]=useState("");
  const [revision,setRevision]=useState(0);
  const [snapshot,setSnapshot]=useState<{revision:number; data:Awaited<ReturnType<typeof loadConnectedGrcSources>>}|null>(null);
  const sources = moduleTrailSources[module];
  useEffect(()=>{
    if(scoped || !sources.length) return;
    const controller=new AbortController();
    void loadConnectedGrcSources({includeAi,signal:controller.signal,sourceKeys:sources}).then(data=>{
      if(!controller.signal.aborted) setSnapshot({revision,data});
    });
    return ()=>controller.abort();
  },[sources,scoped,includeAi,revision]);
  const result = !scoped && snapshot?.revision===revision ? snapshot.data : undefined;
  const records = useMemo(()=>{
    const byId = new Map(rows.map(row=>[row.id,row]));
    if(result) for(const row of buildConnectedGrcEnterpriseRows(result.payloads)) byId.set(row.id,row);
    return [...byId.values()];
  },[rows,result]);
  const graph=useMemo(()=>buildConnectedGrcGraph(records),[records]);
  const options=useMemo(()=>records.filter(row=>row.module===module && optionLabel(row).toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang))),[records,module,query,lang]);
  const pinnedMatches = pinned ? options.filter(row => (row.data.kind === pinned.kind || (pinned.kind === "finding" && row.data.kind === "finding-manual")) &&
    (row.id === pinned.ref || row.code === pinned.ref || row.data.vendorId === pinned.ref ||
      (Array.isArray(row.data.canonicalRefs) && row.data.canonicalRefs.includes(pinned.ref)))) : [];
  const selected=pinned ? (pinnedMatches.length===1 ? pinnedMatches[0] : undefined) : options.find(row=>row.id===selection)||options[0];
  const pending=coreState==="loading" || (!scoped && sources.length>0 && !result);
  const partial=coreState==="error" || !!result?.issues.length;
  return <div className="module-trail-body">
    <div className="trail-picker"><h3>{label(module)}</h3>
      {!pinned && <label>{tr?"Kayıt ara":"Search records"}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
      {!pinned && !!options.length && <label>{tr?"Başlangıç kaydı":"Starting record"}<select value={selected?.id || ""} onChange={e=>setSelection(e.target.value)}>
        {options.map(row=><option key={row.id} value={row.id}>{optionLabel(row)}</option>)}</select></label>}
      {(pending||partial) && <p role="status">{pending?(tr?"Kaynaklar yükleniyor…":"Loading sources…"):(tr?"Bazı kaynaklar okunamadı. Zincir kısmi olabilir.":"Some sources could not be read. This chain may be partial.")}</p>}
      {!pending && <button type="button" onClick={()=>{retryCore();setRevision(revision+1);}}>{partial?(tr?"Yeniden dene":"Retry"):(tr?"Zinciri yenile":"Refresh chain")}</button>}
    </div>
    {selected ? <TrailSession key={selected.id} root={selected} records={records} links={graph.links} lang={lang} label={label} scoped={scoped} partial={partial} loading={pending}/> :
      !pending && <p role="status">{pinned?(tr?"Seçili kaydın bağlantıları çözümlenemedi.":"The selected record could not be resolved.") : query?(tr?"Aramayla eşleşen kayıt yok.":"No records match your search."):(tr?"Yüklenen kaynaklarda bu modüle ait kayıt bulunamadı.":"No records for this module in the loaded sources.")}</p>}
  </div>;
}

function TrailSession({root,records,links,lang,label,scoped,partial,loading}:{root:Row;records:Row[];links:ConnectedGrcLink[];lang:Lang;label:Labels;scoped:boolean;partial:boolean;loading:boolean}) {
  const [path,setPath] = useState<string[]>([]);
  const [views,setViews] = useState<Record<string,TrailView>>({});
  const selected = records.find(row=>row.id===path.at(-1)) || root;
  const tr = lang === "tr";
  function follow(row:Row) {
      if(row.id === root.id) setPath([]);
      else { const index=path.indexOf(row.id);setPath(index<0?[...path,row.id]:path.slice(0,index+1)); }
    }
  return <div className="trail-session">
    {!!path.length && <button type="button" onClick={()=>setPath(path.slice(0,-1))}>{tr?"Önceki kayda dön":"Back to previous record"}</button>}
    {hasBusinessContext(selected) && <BusinessContextView anchor={selected} links={links} tr={tr} openRecord={follow} scoped={scoped} partial={partial} loading={loading}/>}
    <RecordTrail key={selected.id} root={selected} links={links} lang={lang} label={label} view={views[selected.id]} onChange={v=>setViews(previous=>({...previous,[selected.id]:v}))} openRecord={follow}/>
  </div>;
}
