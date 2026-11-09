"use client";

import { useMemo, useState } from "react";
import type { AssuranceRow } from "./control-assurance";
import { connectedTitle } from "./connected-grc-model";
import { evidenceRenewals, reportRiskBand, riskMatrixEntries } from "./executive-report-data";
import { navigateToFornost } from "./navigation-focus";

function openRecord(row: AssuranceRow) {
  navigateToFornost({module:row.module,kind:"record",ref:row.id,source:"executive-report",returnTo:{module:"Ana Sayfa"}});
}
const dayTime = (day: string) => Date.parse(day + "T00:00:00Z");

export function RenewalChart({rows,now,ready,loading,retry,tr}: {
  rows:AssuranceRow[]; now:number; ready:boolean; loading:boolean; retry:()=>void; tr:boolean;
}) {
  const data = useMemo(() => evidenceRenewals(rows,now),[rows,now]);
  const [expanded,setExpanded] = useState(false);
  const [selection,setSelection] = useState("");
  const fmt = new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
  const today = dayTime(new Date(now).toISOString().slice(0,10));
  const points = data.markers.map(item=>dayTime(item.day));
  const start = Math.min(today-86400000,...points), end = Math.max(today+86400000,...points);
  const percent = (date:number) => 5+90*(date-start)/(end-start);
  const position = (date:number) => percent(date)+"%";
  const lanes:number[]=[];
  const markers=data.markers.map(item=>{
    const x=percent(dayTime(item.day));
    let lane=lanes.findIndex(previous=>x-previous>=32);
    if(lane<0) lane=lanes.length;
    lanes[lane]=x;
    return {item,lane};
  });
  const dateLabel=(day:string)=>new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{day:"numeric",month:"short",year:day.slice(0,4)!==new Date(now).toISOString().slice(0,4)?"numeric":undefined,timeZone:"UTC"}).format(dayTime(day));
  const key = (item:typeof data.all[number]) => item.day + (item.overdue?"-past":"-next");
  const shown = expanded ? data.all : data.markers;
  const allUndated = data.total>0 && data.total===data.undated;
  const chosen = shown.find(item=>key(item)===selection);
  function dateButton(item:typeof data.all[number],lane?:number) {
    return <button type="button" key={key(item)} aria-pressed={key(item)===selection}
      style={lane===undefined?undefined:{left:`clamp(39px, ${position(dayTime(item.day))}, calc(100% - 39px))`,top:lane*45}}
      onClick={()=>setSelection(key(item)===selection?"":key(item))}>
      <b>{dateLabel(item.day)}</b><small>{item.overdue?(tr?"Gecikmiş":"Overdue"):(tr?"Yaklaşan":"Upcoming")} · {item.rows.length}</small>
    </button>;
  }
  return <section className="report-chart report-renewals" aria-labelledby="report-renewal-title">
    <h3 id="report-renewal-title">{tr?"Kanıt yenilemeleri":"Evidence renewals"}</h3>
    {!ready ? <p role="status">{loading?(tr?"Kanıtlar yükleniyor…":"Loading evidence…"):(tr?"Kanıt kaynağı doğrulanamadı.":"Evidence source unavailable.")} {!loading && <button type="button" onClick={retry}>{tr?"Yeniden dene":"Retry"}</button>}</p> : <>
      <p>{data.total} {tr?"kanıt":"evidence items"} · {allUndated ? (tr?"Yenileme tarihleri bekleniyor":"Renewal dates needed") :
        <>{data.overdue} {tr?"gecikmiş":"overdue"} · {data.upcoming} {tr?"önümüzdeki 30 gün içinde":"due in the next 30 days"}</>}</p>
      {!!data.markers.length && <><div className="report-axis" aria-hidden="true">
        <span className="report-today" style={{left:position(today)}}>{tr?"Bugün":"Today"} · {fmt.format(now)}</span>
        {data.markers.map(item=><i key={key(item)} className={item.overdue?"past":""} style={{left:position(dayTime(item.day))}}/>)}
      </div><div className={expanded?"report-dates":"report-dates report-marker-dates"} style={expanded?undefined:{minHeight:lanes.length*45}}>
        {expanded ? shown.map(item=>dateButton(item)) : markers.map(({item,lane})=>dateButton(item,lane))}
      </div></>}
      {allUndated && <div className="report-undated">
        <div className="report-horizon"><span>{tr?"Bugün":"Today"} · {fmt.format(today)}</span><span>{fmt.format(today+30*86400000)}</span></div>
        <p>{tr?"Bu kanıtlar için geçerli bir bitiş tarihi kayıtlı değil.":"These evidence items have no valid expiry date."}</p>
        <button type="button" className="report-link" onClick={()=>navigateToFornost("Kanıtlar")}>{tr?"Kanıt Kütüphanesini aç":"Open Evidence Library"} →</button>
      </div>}
      {!data.markers.length && !allUndated && <p className="report-empty">{!data.total?(tr?"Kayıtlı kanıt yok.":"No evidence recorded."):(tr?"Süresi geçen veya önümüzdeki 30 gün içinde yenilenecek tarihli kanıt yok.":"No dated evidence is overdue or due within 30 days.")}</p>}
      {data.all.length>data.markers.length && <button type="button" className="report-link" onClick={()=>setExpanded(!expanded)}>{expanded?(tr?"Daha az göster":"Show less"):(tr?"Tüm tarihleri göster":"Show all dates")}</button>}
      {chosen && <ul className="report-records">{chosen.rows.map(row=><li key={row.id}><button onClick={()=>openRecord(row)}>{connectedTitle(row)} ›</button></li>)}</ul>}
      <footer>{tr?"Tarihi eksik veya geçersiz":"Missing or invalid date"} · {data.undated}{data.later>0 && <> · {tr?"30 günden sonra":"After 30 days"} · {data.later}</>}</footer>
    </>}
  </section>;
}
export function ReportMatrix({risks,tr}:{risks:AssuranceRow[];tr:boolean}) {
  const entries=useMemo(()=>riskMatrixEntries(risks),[risks]);
  const [cell,setCell]=useState("");
  const [more,setMore]=useState(false);
  const coord=(l:number,i:number)=>l+"×"+i;
  const buckets=new Map<string,typeof entries>();
  entries.forEach(item=>{const key=coord(item.likelihood,item.impact);const group=buckets.get(key)||[];group.push(item);buckets.set(key,group);});
  const selected=buckets.get(cell);
  const list=selected||entries;
  const short=(row:AssuranceRow)=>String.fromCharCode(65+entries.findIndex(entry=>entry.row.id===row.id));
  return <section className="report-chart report-matrix" aria-labelledby="report-matrix-title">
    <h3 id="report-matrix-title">{tr?"Olasılık ve etki matrisi":"Likelihood and impact matrix"}</h3>
    <div className="report-matrix-wrap"><span className="report-y">{tr?"Etki":"Impact"}</span><div className="report-cells">
      {[5,4,3,2,1].map(impact=><div className="report-matrix-row" key={impact}><span>{impact}</span>{[1,2,3,4,5].map(likelihood=>{
        const k=coord(likelihood,impact), group=buckets.get(k)||[];
        const label=(tr?"Olasılık ":"Likelihood ")+likelihood+(tr?", etki ":", impact ")+impact+" · "+group.length+" risk";
        return group.length?<button type="button" key={k} data-band={reportRiskBand(likelihood*impact)} aria-label={label} aria-pressed={cell===k} title={label}
          onClick={()=>{setCell(cell===k?"":k);setMore(false);}}><b>{entries.length<=6 && group.length===1?short(group[0].row):group.length}</b></button>:<i key={k} aria-hidden="true" data-band={reportRiskBand(likelihood*impact)}/>;
      })}</div>)}
      <div className="report-matrix-row axis-labels"><span/>{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}</div>
      <div className="report-x">{tr?"Olasılık":"Likelihood"}</div>
    </div></div>
    {entries.length>0 && <div className="report-risk-key">{(more?list:list.slice(0,3)).map(item=><button key={item.row.id} onClick={()=>openRecord(item.row)}>{entries.length<=6 && <b>{short(item.row)}</b>}{connectedTitle(item.row)} <small>{coord(item.likelihood,item.impact)}</small></button>)}
      {list.length>3 && <button onClick={()=>setMore(!more)}>{more?(tr?"Daha az":"Show less"):(tr?"Tümü":"Show all")+" ("+list.length+")"}</button>}</div>}
    {(!entries.length || risks.length>entries.length) && <p>{!risks.length?(tr?"Kayıtlı risk yok.":"No risks recorded."):(risks.length-entries.length)+" "+(tr?"risk için 1–5 ölçeğinde değerlendirme bekleniyor.":"risks await a 1–5 rating.")}</p>}
  </section>;
}
