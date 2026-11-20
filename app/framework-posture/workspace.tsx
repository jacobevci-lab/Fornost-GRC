'use client';
import {Fragment,useEffect,useMemo,useRef,useState} from 'react';
import {displayTitle} from './iso-display';
import {getCatalogStatus} from '../framework-catalog-status';
import {postureRequest,usePosture} from './client';
import {DecisionEditor,type WorkspaceProps} from './decision-editor';
import {RequirementIndex} from './requirement-index';
import {matchesRequirement,reasonLabels,requirementState,statusLabel} from './requirements';
import type {Matrix,Overview,Requirement} from './types';
import './workspace.css';

const preferred:Record<string,string>={
  'ISO/IEC 27001:2022':'ISO 27001','SOC 2 Trust Services Criteria':'SOC 2','KVKK (6698)':'KVKK',
  'NIST Cybersecurity Framework (CSF) 2.0':'NIST CSF','PCI DSS 4.0.1':'PCI DSS','DORA (EU 2022/2554)':'DORA',
};
const pageSize=12;
const rowId=(ref:string)=>'posture-ref-'+encodeURIComponent(ref);

function Program({name,enrolled,initialRef,onSaved,...props}:WorkspaceProps & {name:string;enrolled:boolean;initialRef:string;onSaved:()=>void}) {
  const {tr}=props;
  const [revision,refresh]=useState(0),[query,setQuery]=useState(''),[openOnly,setOpenOnly]=useState(enrolled && !initialRef);
  const [page,setPage]=useState<number|null>(null),[selected,select]=useState(initialRef),[message,setMessage]=useState('');
  const [gapFilter,setGapFilter]=useState('all');
  const {data:matrix,error}=usePosture<Matrix>(enrolled?{name}:{name,preview:'1'},revision);
  const pendingFocus=useRef(initialRef);
  const loaded=!!matrix;
  useEffect(()=>{
    if(loaded && pendingFocus.current){
      document.getElementById(rowId(pendingFocus.current))?.focus();
      pendingFocus.current='';
    }
  },[loaded]);
  const data=useMemo(()=>matrix && {...matrix,requirements:matrix.requirements.map(row=>({...row,title:displayTitle(name,row.ref,row.title,tr)}))},[matrix,name,tr]);
  if(!data)return <p role="status">{error?(tr?'Maddeler yüklenemedi.':'Could not load requirements.'):(tr?'Maddeler yükleniyor…':'Loading requirements…')} {error&&<button onClick={()=>refresh(v=>v+1)}>{tr?'Tekrar dene':'Retry'}</button>}</p>;

  const rows=data.requirements.map(row=>({row,state:requirementState(row,data.pins)}));
  const openRows=rows.filter(({state})=>state!=='excluded'&&state!=='covered');
  const filtered=(openOnly?openRows:rows).filter(({row})=>{
    if(!matchesRequirement(row,query,tr))return false;
    if(gapFilter==='all')return true;
    if(row.applicability==='excluded')return false;
    if(gapFilter==='partial')return row.links.some(l=>l.coverage==='partial');
    if(gapFilter==='evidence')return !row.links.some(l=>data.pins[l.id]?.length);
    return !row.links.length;
  });
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const selectedPage=initialRef?Math.max(0,Math.floor(filtered.findIndex(({row})=>row.ref===initialRef)/pageSize)):0;
  const current=Math.min(page??selectedPage,pages-1);
  const notice=getCatalogStatus(name);
  function pick(row:Requirement) {
    setQuery('');setGapFilter('all');setOpenOnly(false);
    setPage(Math.floor(rows.findIndex(r=>r.row.ref===row.ref)/pageSize));select(row.ref);setMessage('');
    requestAnimationFrame(()=>{
      const trigger=document.getElementById(rowId(row.ref));
      trigger?.focus({preventScroll:true});trigger?.scrollIntoView({block:'start'});
    });
  }
  function changeView(open:boolean) {
    setOpenOnly(open);setPage(0);setGapFilter('all');select('');setMessage('');
  }
  function close(ref:string) {
    select('');document.getElementById(rowId(ref))?.focus();
  }
  return <div className="posture-layout">
    <section className="posture-register" aria-label={name}>
      <div className="posture-program-heading"><h3>{name}</h3>
        <details className="posture-catalog-note"><summary>{tr?'Katalog kapsamı':'Catalog scope'}</summary><p>{tr?notice.tr:notice.en}</p></details></div>
      <div className="posture-viewbar"><div className="posture-tabs">
        <button type="button" aria-pressed={!openOnly} onClick={()=>changeView(false)}>{tr?'Tüm maddeler':'All requirements'} <b>{rows.length}</b></button>
        {enrolled&&<button type="button" aria-pressed={openOnly} onClick={()=>changeView(true)}>{tr?'Açık maddeler':'Open requirements'} <b>{openRows.length}</b></button>}
      </div>
      <input type="search" aria-label={tr?'Madde ara':'Search requirements'} placeholder={tr?'Madde ara…':'Search requirements…'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
      {enrolled&&<select aria-label={tr?'Nedene göre filtrele':'Filter by reason'} value={gapFilter} onChange={e=>{setGapFilter(e.target.value);setPage(0);}}>
        <option value="all">{tr?'Tüm nedenler':'All reasons'}</option><option value="unmapped">{tr?'Kontrol bağlantısı eksik':'Missing control mapping'}</option>
        <option value="partial">{tr?'Kısmi eşleştirme':'Partial mapping'}</option><option value="evidence">{tr?'Onaylı kanıt eksik':'Missing approved evidence'}</option></select>}</div>
      {message&&<p role="status" className="posture-notice">{message}</p>}
      <table className="posture-ledger"><thead><tr>
        <th scope="col">{tr?'Madde':'Reference'}</th><th scope="col">{tr?'Gereksinim':'Requirement'}</th>
        {enrolled&&<><th scope="col">{tr?'Durum':'Status'}</th><th scope="col">{tr?'Neden':'Reason'}</th></>}
      </tr></thead><tbody>{filtered.slice(current*pageSize,(current+1)*pageSize).map(({row,state})=>{
        const expanded=row.ref===selected;
        const badge=statusLabel(state,tr);
        const toggle=()=>{select(expanded?'':row.ref);setMessage('');};
        const detailId=rowId(row.ref)+'-details';
        return <Fragment key={row.ref}><tr className={expanded?'posture-selected':''}>
          <th scope="row">{row.ref}</th><td><button id={rowId(row.ref)} type="button" className="posture-row-trigger"
            aria-expanded={expanded} aria-label={row.ref+' · '+row.title}
            aria-controls={expanded?detailId:undefined} onClick={toggle}>{row.title} <span aria-hidden="true"/></button></td>
          {enrolled&&<><td><button type="button" className={'posture-status '+state} onClick={toggle}
            aria-expanded={expanded} aria-controls={expanded?detailId:undefined}
            aria-label={row.ref+' · '+badge+' · '+(tr?'Durum ayrıntısı':'Status details')}>{badge}</button></td><td className="posture-reason">{reasonLabels[state][tr?0:1]}</td></>}
        </tr>
        {expanded&&<tr className="posture-detail-row"><td id={detailId} colSpan={enrolled?4:2}>
          {enrolled?<DecisionEditor key={row.ref+row.revision} row={row} matrix={data} {...props}
            onClose={()=>close(row.ref)} onReload={()=>refresh(v=>v+1)} onSave={()=>{refresh(v=>v+1);onSaved();setMessage(tr?'Madde güncellendi.':'Requirement updated.');}}/>:
            <p>{tr?'Kontrol bağlamak ve kanıt kapsamını izlemek için bu çerçeveyi kapsama ekleyin.':'Add this framework to scope to link controls and track evidence coverage.'}</p>}
        </td></tr>}</Fragment>;
      })}</tbody></table>
      {!filtered.length&&<p className="posture-empty">{openOnly&&!query&&gapFilter==='all'?(tr?'Bu çerçevede açık madde yok.':'No open requirements in this framework.'):(tr?'Eşleşen madde yok.':'No matching requirements.')}</p>}
      <footer><span>{filtered.length} {tr?'madde':'requirements'} · {current+1}/{pages}</span>
        <button type="button" disabled={!current} onClick={()=>{setPage(current-1);select('');}}>{tr?'Önceki':'Previous'}</button>
        <button type="button" disabled={current+1>=pages} onClick={()=>{setPage(current+1);select('');}}>{tr?'Sonraki':'Next'}</button></footer>
    </section>
    <RequirementIndex tr={tr} rows={data.requirements} selected={selected} onPick={pick}/>
  </div>;
}

export function FrameworkWorkspace(props:WorkspaceProps) {
  const {tr,write}=props;
  const [revision,refresh]=useState(0),[selected,select]=useState(''),[choice,setChoice]=useState('');
  const [adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const [target,setTarget]=useState({ref:'',revision:0});
  const addTrigger=useRef<HTMLButtonElement>(null);
  const {data,error}=usePosture<Overview>({overview:'1'},revision,true);
  const retry=()=>refresh(v=>v+1);
  if(!data)return <section className="posture-workspace posture-home" role="status">{error?(tr?'Çerçeveler yüklenemedi.':'Could not load frameworks.'):(tr?'Çerçeveler yükleniyor…':'Loading frameworks…')} {error&&<button onClick={retry}>{tr?'Tekrar dene':'Retry'}</button>}</section>;
  const names=[...new Set([...data.enrolled,...Object.keys(preferred).filter(n=>data.catalog.includes(n))])];
  const active=names.includes(selected)?selected:names[0];
  const available=data.catalog.filter(n=>!data.enrolled.includes(n));
  const candidate=available.includes(choice)?choice:available[0];
  async function add() {
    if(!candidate||busy)return;
    setBusy(true);setFailed(false);
    try{
      await postureRequest({},undefined,{action:'enroll',name:candidate});
      select(candidate);setTarget({ref:'',revision:target.revision+1});setAdding(false);retry();addTrigger.current?.focus();
    }catch{setFailed(true);}finally{setBusy(false);}
  }
  return <section className="posture-workspace posture-home">
    <div className="posture-portfolio"><div className="posture-strip-head"><h2>{tr?'Çerçeveler arası karşılaştırma':'Framework comparison'}</h2>
      {write&&available.length>0&&<button className="primary workspace-create" ref={addTrigger} type="button" aria-expanded={adding} onClick={()=>{setChoice(available.includes(active)?active:available[0]);setFailed(false);setAdding(!adding);}}>{tr?'Çerçeve ekle':'Add framework'}</button>}</div>
      <div className="posture-strip" role="group" aria-label={tr?'Çerçeveler':'Frameworks'}>{names.map(name=>{
        const totals=data.coverage[name],percent=totals?.scope?Math.round(100*totals.evidenced/totals.scope):null;
        const gaps=data.comparison?.[name];
        return <div key={name} className="posture-column"><button className="posture-column-head" type="button" aria-pressed={active===name} title={name+(totals?' · '+totals.evidenced+'/'+totals.scope:'')} onClick={()=>{select(name);setTarget({ref:'',revision:target.revision+1});setAdding(false);}}>
          <span><strong>{preferred[name]||name}</strong>{percent!==null&&<b className="posture-ring" style={{backgroundImage:`conic-gradient(var(--ws-brand) ${percent}%, var(--ws-line) 0)`}}><span>{tr?'%'+percent:percent+'%'}</span></b>}</span>
          {percent!==null?<small>{totals.evidenced}/{totals.scope} {tr?'kanıtlı':'evidenced'}</small>:<small>{totals?(tr?'Kapsamda madde yok':'No items in scope'):(tr?'Katalogda':'In catalog')}</small>}
        </button>
        {gaps&&<div className="posture-column-gaps">
          <small>{gaps.openCount} {tr?'açık madde':'open requirements'}</small>
          {gaps.items.map(item=><button type="button" key={item.ref} className="posture-gap" onClick={()=>{
            select(name);setAdding(false);setTarget({ref:item.ref,revision:target.revision+1});
          }}><b>{item.ref}</b><strong>{displayTitle(name,item.ref,item.title,tr)}</strong>
            <span>{reasonLabels[item.state][tr?0:1]}</span>{item.controlCode&&<code>{item.controlCode}</code>}
            <small>{write && item.state==='unmapped'?(tr?'Kontrol bağla':'Link control'):(tr?'Maddeyi aç':'Open requirement')}</small>
          </button>)}
        </div>}</div>;
      })}</div>
      {adding&&<div className="posture-enroll"><label>{tr?'Katalogdan seç':'Choose from catalog'}<select autoFocus disabled={busy} value={candidate} onChange={e=>setChoice(e.target.value)}>{available.map(n=><option key={n}>{n}</option>)}</select></label>
        <button type="button" className="primary" disabled={busy} onClick={add}>{tr?'Kapsama ekle':'Add to scope'}</button>
        <button type="button" disabled={busy} onClick={()=>{setAdding(false);addTrigger.current?.focus();}}>{tr?'Vazgeç':'Cancel'}</button>
        {failed&&<p role="alert">{tr?'Çerçeve eklenemedi. Tekrar deneyin.':'Could not add framework. Please retry.'}</p>}</div>}
    </div>
    {active&&<Program key={active+data.enrolled.includes(active)+target.revision} initialRef={target.ref} name={active} enrolled={data.enrolled.includes(active)} onSaved={retry} {...props}/>}
  </section>;
}
