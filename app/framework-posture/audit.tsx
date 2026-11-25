'use client';
import {useState,useEffect} from 'react';
import {usePosture} from './client';
import {navigateToFornost} from '../navigation-focus';
import {withBasePath} from '../base-path';
import {applicabilityLabel} from './requirements';
import type {Applicability,Baseline,Coverage} from './types';

export type AuditChoice=false|null|{period:string;token:string};
function EvidenceSummary({baseline,tr}:{baseline:Baseline;tr:boolean}){
  return <p><b>{baseline.withEvidence}</b> {tr?'maddede bu döneme ait onaylı kanıt var':'requirements with approved evidence for this period'} · <b>{baseline.total-baseline.excluded-baseline.withEvidence}</b> {tr?'maddede dönem kanıtı eksik':'requirements missing period evidence'} · <b>{baseline.excluded}</b> {tr?'hariç':'excluded'}</p>;
}
export function AuditPostureChoice({template,tr,choice,onChange,range=''}:{template:string;tr:boolean;choice:AuditChoice;onChange:(c:AuditChoice)=>void;range?:string}){
  const [period,setPeriod]=useState(''),[revision,setRevision]=useState(0);
  const selected=range||period.trim(),enabled=choice!==false;
  const {data:periods}=usePosture<{periods:string[]}>(enabled&&!range?{name:template,periods:'1'}:null);
  const {data,error}=usePosture<{controls:number;evidence:number;withEvidence:number;token:string}>({name:template,period:selected||'∅',counts:'1'},revision);
  useEffect(()=>{
    if(enabled && selected && data)onChange({period:selected,token:data.token});
  },[enabled,selected,data,onChange]);
  return <fieldset className="posture-choice wide"><label><input type="checkbox" checked={enabled} onChange={e=>onChange(e.target.checked?null:false)}/> {tr?'Mevcut kontrolleri ve onaylı dönem kanıtlarını devral':'Reuse existing controls and approved period evidence'}</label>
    <p role="status">{data?(tr?`Bu şablon için ${data.controls} kontrol eşleşti. `:`${data.controls} controls mapped to this template. `)+(selected?(tr?`${data.evidence} onaylı kanıt devralınmaya hazır.`:`${data.evidence} approved evidence records ready to inherit.`):(tr?'Onaylı kanıt sayısı için dönem seçin.':'Choose an observation period to count approved evidence.')):error==='404'?(tr?'Bu çerçeve Uyum Yönetimi’nde etkin değil.':'This framework is inactive in Compliance Management.'):(tr?'Devralma önizlemesi':'Inheritance preview')+' · —'}</p>
    {enabled&&!range&&<><label>{tr?'Kanıt dönemi':'Evidence period'}<input value={period} list="posture-periods" maxLength={120} onChange={e=>{setPeriod(e.target.value);onChange(null);}}/></label>
    <datalist id="posture-periods">{periods?.periods.map(p=><option key={p}>{p}</option>)}</datalist></>}
    {(enabled||error)&&<button type="button" onClick={()=>{if(enabled)onChange(null);setRevision(v=>v+1);}}>{tr?'Dönemi önizle':'Preview period'}</button>}
    {enabled&&selected&&data&&<p>{data.withEvidence} {tr?'maddede bu döneme ait onaylı kanıt var':'requirements with approved evidence for this period'}</p>}
  </fieldset>;
}
export function AuditBaseline({auditId,tr,records}:{auditId:string;tr:boolean;records:Map<string,string>}){
  const [open,setOpen]=useState(false),[filter,setFilter]=useState('evidence'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[rev,setRev]=useState(0);
  const {data,error}=usePosture<{baseline:(Baseline&{capturedAt:string})|null}>(open?{auditId}:null,rev);
  const b=data?.baseline;
  const entries=b?.entries.filter(r=>(filter==='all'||(r.applicability!=='excluded' && !!(r.directEvidence?.length||r.controls.some(c=>c.evidence.length))===(filter==='evidence'))) && (r.ref+' '+r.title).toLocaleLowerCase().includes(search.toLocaleLowerCase()))||[];
  return <details className="posture-workspace" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{tr?'Denetim başlangıcındaki kontrol ve kanıtlar':'Controls and evidence at audit start'}</summary>
    {open&&!b&&<p role="status">{error||data?(tr?'Başlangıç kaydı yüklenemedi.':'Baseline unavailable.'):(tr?'Yükleniyor…':'Loading…')} {error&&<button onClick={()=>setRev(rev+1)}>{tr?'Yenile':'Retry'}</button>}</p>}
    {open&&b&&<><p>{b.framework} · {b.period} · {new Date(b.capturedAt).toLocaleString(tr?'tr-TR':'en-GB')}</p><EvidenceSummary baseline={b} tr={tr}/>
    <div className="posture-fields"><label>{tr?'Madde ara':'Find requirement'}<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><label>{tr?'Görünüm':'View'}<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="evidence">{tr?'Dönem kanıtı var':'Has period evidence'}</option><option value="missing">{tr?'Dönem kanıtı eksik':'Missing period evidence'}</option><option value="all">{tr?'Tümü':'All'}</option></select></label></div>
    {entries.slice(page*12,page*12+12).map(r=><details key={r.ref}><summary>{r.ref} · {r.title}</summary><p>{applicabilityLabel(r.applicability,tr)} {r.reason}</p>
    {records.has(r.ref)&&<button type="button" onClick={()=>navigateToFornost({module:'Denetim Yönetimi',kind:'record',ref:records.get(r.ref)})}>{tr?'Denetim maddesini aç':'Open audit requirement'}</button>}
    {r.directEvidence?.map(id=>{const p=b.evidence[id];return <p key={id}><a href={withBasePath('/api/evidence')+'?key='+encodeURIComponent(p.fileKey)}>{p.code} · {p.title} · v{p.version}</a> · {p.period}</p>;})}
    {r.directPolicies?.map(p=><p key={p.id}>{p.code} · {p.title} · {tr?'Yayındaki politika':'Published policy'}</p>)}
    {r.controls.map(c=><div key={c.id}><b>{c.code} · {c.title}</b> {c.coverage==='partial'?(tr?'Kısmi':'Partial'):''}
    {c.evidence.map(id=>{const p=b.evidence[id];return <p key={id}><a href={withBasePath("/api/evidence")+"?key="+encodeURIComponent(p.fileKey)}>{p.title} · v{p.version}</a> · {p.period} <code>SHA-256 {p.hash}</code></p>;})}</div>)}</details>)}
    {!entries.length&&<p>{tr?'Bu görünümde madde yok.':'No requirements in this view.'}</p>}<footer><span>{entries.length} {tr?'madde':'requirements'}</span><button disabled={!page} onClick={()=>setPage(page-1)}>{tr?'Önceki':'Previous'}</button><button disabled={(page+1)*12>=entries.length} onClick={()=>setPage(page+1)}>{tr?'Sonraki':'Next'}</button></footer></>}
  </details>;
}
export function FrameworkImpact({controlId,tr}:{controlId:string;tr:boolean}){
  const [revision,setRevision]=useState(0);
  const {data,error}=usePosture<{impact:{framework:string;ref:string;title:string;coverage:Coverage;applicability:Applicability}[]}>({controlId},revision);
  return <section className="posture-impact"><h4>{tr?'Çerçeveler arası etki':'Cross-framework impact'}</h4>
    {data?(data.impact.length?<ul>{data.impact.map(r=><li key={r.framework+r.ref}><b>{r.framework} · {r.ref}</b> · {r.title} · {r.coverage==='partial'?(tr?'Kısmen destekler':'Partially supports'):(tr?'Destekler':'Supports')} · {applicabilityLabel(r.applicability,tr)}</li>)}</ul>:<p>{tr?'Etkin çerçevelerde bu kontrole bağlı madde yok.':'No requirements in active frameworks link to this control.'}</p>):<p>{error?(tr?'Bağlantılar alınamadı.':'Mappings unavailable.'):(tr?'Yükleniyor…':'Loading…')} {error&&<button type="button" onClick={()=>setRevision(revision+1)}>{tr?'Yenile':'Retry'}</button>}</p>}
  </section>;
}
