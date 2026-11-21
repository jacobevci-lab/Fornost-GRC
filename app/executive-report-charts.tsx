"use client";

import { useMemo, useState } from "react";
import type { AssuranceRow } from "./control-assurance";
import { connectedTitle } from "./connected-grc-model";
import { reportRiskBand, riskMatrixEntries } from "./executive-report-data";
import { dashboardCode, dashboardRecord, recordOwner } from "./dashboard-actions";
import { navigateToFornost } from "./navigation-focus";

function openRecord(row: AssuranceRow) {
  navigateToFornost(dashboardRecord(row));
}
export function ReportMatrix({risks,tr}:{risks:AssuranceRow[];tr:boolean}) {
  const entries=useMemo(()=>riskMatrixEntries(risks),[risks]);
  const [cell,setCell]=useState("");
  const [more,setMore]=useState(false);
  const coord=(l:number,i:number)=>l+"×"+i;
  const buckets=new Map<string,typeof entries>();
  entries.forEach(item=>{const key=coord(item.likelihood,item.impact);const group=buckets.get(key)||[];group.push(item);buckets.set(key,group);});
  const selected=buckets.get(cell);
  return <section className="report-chart report-matrix" aria-labelledby="report-matrix-title">
    <h3 id="report-matrix-title">{tr?"Olasılık ve etki matrisi":"Likelihood and impact matrix"}</h3>
    <div className="report-matrix-wrap"><span className="report-y">{tr?"Etki":"Impact"}</span><div className="report-cells">
      {[5,4,3,2,1].map(impact=><div className="report-matrix-row" key={impact}><span>{impact}</span>{[1,2,3,4,5].map(likelihood=>{
        const k=coord(likelihood,impact), group=buckets.get(k)||[];
        const label=(tr?"Olasılık ":"Likelihood ")+likelihood+(tr?", etki ":", impact ")+impact+" · "+group.length+" risk";
        return group.length?<button type="button" key={k} data-band={reportRiskBand(likelihood*impact)} aria-label={label} aria-pressed={cell===k} title={label}
          onClick={()=>{setCell(cell===k?"":k);setMore(false);}}><b>{group.length}</b></button>:<i key={k} aria-hidden="true" data-band={reportRiskBand(likelihood*impact)}/>;
      })}</div>)}
      <div className="report-matrix-row axis-labels"><span/>{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}</div>
      <div className="report-x">{tr?"Olasılık":"Likelihood"}</div>
    </div></div>
    {selected && <section className="risk-cell-preview" aria-label={tr?"Seçili hücre":"Selected cell"}><strong>{cell} · {selected.length} {tr?"risk":"risk(s)"}</strong>
      <ul>{selected.map(({row})=><li key={row.id}><b>{dashboardCode(row)}</b><span title={connectedTitle(row)}>{connectedTitle(row)===row.id?"—":connectedTitle(row)}</span><small>{recordOwner(row)}</small><button onClick={()=>openRecord(row)}>{tr?"Kayda Git →":"Open record →"}</button></li>)}</ul></section>}
    {entries.length>0 && <div className="report-risk-key">{(more?entries:entries.slice(0,3)).map(({row,likelihood,impact})=><button key={row.id} title={connectedTitle(row)} onClick={()=>setCell(coord(likelihood,impact))}><b>{dashboardCode(row)}</b><span>{connectedTitle(row)===row.id?"—":connectedTitle(row)}</span><small>{coord(likelihood,impact)}</small></button>)}
      {entries.length>3 && <button onClick={()=>setMore(!more)}>{more?(tr?"Daha az":"Show less"):(tr?"Tümü":"Show all")+" ("+entries.length+")"}</button>}</div>}
    {(!entries.length || risks.length>entries.length) && <p>{!risks.length?(tr?"Kayıtlı risk yok.":"No risks recorded."):(risks.length-entries.length)+" "+(tr?"risk için 1–5 ölçeğinde değerlendirme bekleniyor.":"risks await a 1–5 rating.")}</p>}
  </section>;
}
