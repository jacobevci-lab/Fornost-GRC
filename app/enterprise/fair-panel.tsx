'use client';
import {annualLossMinor,currencies,exposure,money,readEstimate} from './fair';
const fields=[
 ['frequency','Yıllık gerçekleşme sıklığı (%)','Annual occurrence probability (%)'],
 ['minimum','Minimum kayıp','Minimum loss'],['likely','En olası kayıp','Most likely loss'],['maximum','Maksimum kayıp','Maximum loss'],
] as const;
export function FairFields({tr,value,update}:{tr:boolean;value:unknown;update:(v:unknown)=>void}){
 const draft=(value??{}) as Record<string,string>,estimate=readEstimate(value);
 return <details className="wide ec-finance"><summary>{tr?'Finansal Etki ve Maruziyet (FAIR-Lite)':'Financial impact and exposure (FAIR-Lite)'}</summary>
 <label><input type="checkbox" checked={value!=null} onChange={e=>update(e.target.checked?{currency:'TRY'}:null)}/> {tr?'Finansal tahmin gir':'Include financial estimate'}</label>
 {value!=null&&<><label>{tr?'Para birimi':'Currency'}<select value={draft.currency} onChange={e=>update({...draft,currency:e.target.value})}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
 {fields.map(([key,t,en])=><label key={key}>{tr?t:en}<input type="number" required min="0" max={key==='frequency'?100:999999999999.99} step=".01" value={draft[key]??''} onChange={e=>update({...draft,[key]:e.target.value})}/></label>)}
 <p aria-live="polite">{estimate?(tr?'Yıllık beklenen kayıp (ALE) · ':'Annualized loss expectancy (ALE) · ')+money(annualLossMinor(estimate),estimate.currency,tr):(tr?'Tüm değerleri girin. Minimum ≤ en olası ≤ maksimum.':'Enter all values. Minimum ≤ most likely ≤ maximum.')}</p></>}
 </details>;
}
export function ExposureCard({tr,risks}:{tr:boolean;risks:ReadonlyArray<{data:Record<string,unknown>}>}){
 const x=exposure(risks);
 return <section className="ec-exposure"><strong>{tr?'Yıllık beklenen kayıp (ALE)':'Annualized loss expectancy (ALE)'}</strong>
 {x.measured?currencies.filter(c=>x.totals.has(c)).map(c=><b key={c}>{money(x.totals.get(c)!,c,tr)}</b>):<span>{tr?'Finansal tahmin girilmemiş':'No financial estimates recorded'}</span>}
 <small>{tr?`${x.total} riskin ${x.measured} tanesinde tahmin var`:`${x.measured} of ${x.total} risks quantified`}</small></section>;
}
export function FairDetail({tr,value}:{tr:boolean;value:unknown}){
 const e=readEstimate(value);if(!e)return null;
 return <section className="ec-exposure"><strong>{tr?'Finansal etki ve maruziyet':'Financial impact and exposure'} · FAIR-Lite</strong>
 <span>{tr?'Yıllık sıklık':'Annual probability'} · {e.frequency}%</span>{fields.slice(1).map(([k,t,en])=><span key={k}>{tr?t:en} · {money(BigInt(Math.round(e[k]*100)),e.currency,tr)}</span>)}
 <b>ALE · {money(annualLossMinor(e),e.currency,tr)}</b></section>;
}
