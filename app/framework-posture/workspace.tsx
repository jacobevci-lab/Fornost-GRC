'use client';
import {Fragment,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {displayTitle} from './iso-display';
import {getCatalogStatus} from '../framework-catalog-status';
import {postureRequest,usePosture} from './client';
import {DecisionEditor,type WorkspaceProps} from './decision-editor';
import {ScopeCell} from './scope-cell';
import {matchesBranch,RequirementIndex} from './requirement-index';
import {implementationIndex,matchesRequirement,reasonLabels,requirementState,statusLabel} from './requirements';
import type {Matrix,Overview,Requirement} from './types';
import './workspace.css';

const preferred:Record<string,string>={
  'ISO/IEC 27001:2022':'ISO 27001','SOC 2 Trust Services Criteria':'SOC 2','KVKK (6698)':'KVKK',
  'NIST Cybersecurity Framework (CSF) 2.0':'NIST CSF','PCI DSS 4.0.1':'PCI DSS','DORA (EU 2022/2554)':'DORA',
};
const pageSize=12;
const rowId=(ref:string)=>'posture-ref-'+encodeURIComponent(ref);

function Program({name,enrolled,initialRef,counts,frameworks,onSaved,...props}:WorkspaceProps & {name:string;enrolled:boolean;initialRef:string;counts:Overview['controlFrameworkCounts'];frameworks:Overview['controlFrameworks'];onSaved:()=>void}) {
  const {tr}=props;
  const [revision,refresh]=useState(0),[query,setQuery]=useState(''),[openOnly,setOpenOnly]=useState(enrolled && !initialRef);
  const [page,setPage]=useState<number|null>(null),[selected,select]=useState(initialRef),[message,setMessage]=useState('');
  const [branch,setBranch]=useState(''),[shared,setShared]=useState(false);
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

  const implementation=implementationIndex(data.controls);
  const controls=new Map(data.controls.map(c=>[c.id,c]));
  const rows=data.requirements.map(row=>({row,state:requirementState(row,data.pins,implementation)}));
  const states=new Map(rows.map(({row,state})=>[row.ref,state]));
  function saved(){refresh(v=>v+1);onSaved();setMessage(tr?'Madde güncellendi.':'Requirement updated.');}
  const openRows=rows.filter(({state})=>state!=='excluded'&&state!=='covered');
  const filtered=(openOnly?openRows:rows).filter(({row,state})=>{
    if(!matchesBranch(row,branch))return false;
    if(shared && (state==='excluded'||!row.links.some(link=>counts[link.id]>1)))return false;
    if(!matchesRequirement(row,query,tr))return false;
    if(gapFilter==='all')return true;
    if(row.applicability==='excluded')return false;
    return state===gapFilter;
  });
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const selectedPage=initialRef?Math.max(0,Math.floor(filtered.findIndex(({row})=>row.ref===initialRef)/pageSize)):0;
  const current=Math.min(page??selectedPage,pages-1);
  const notice=getCatalogStatus(name);
  function pick(row:Requirement) {
    setQuery('');setGapFilter('all');setOpenOnly(false);
    setBranch(row.group);setShared(false);
    setPage(Math.floor(rows.filter(r=>r.row.group===row.group).findIndex(r=>r.row.ref===row.ref)/pageSize));select(row.ref);setMessage('');
    requestAnimationFrame(()=>{
      const trigger=document.getElementById(rowId(row.ref));
      trigger?.focus({preventScroll:true});trigger?.scrollIntoView({block:'start'});
    });
  }
  function changeView(open:boolean) {
    setOpenOnly(open);setShared(false);setPage(0);setGapFilter('all');select('');setMessage('');
  }
  function chooseBranch(next:string){
    setBranch(next);setQuery('');setShared(false);changeView(false);
  }
  function close(ref:string) {
    select('');document.getElementById(rowId(ref))?.focus();
  }
  return <div className="posture-layout">
    <section className="posture-register" aria-label={name}>
      <div className="posture-program-heading"><h3>{name}</h3>
        <details className="posture-catalog-note"><summary>{tr?'Katalog kapsamı':'Catalog scope'}</summary><p>{tr?notice.tr:notice.en}</p></details></div>
      <div className="posture-viewbar"><div className="posture-tabs">
        <button type="button" aria-pressed={!openOnly&&!shared} onClick={()=>changeView(false)}>{tr?'Tüm maddeler':'All requirements'} <b>{rows.length}</b></button>
        {enrolled&&<button type="button" aria-pressed={openOnly} onClick={()=>changeView(true)}>{tr?'Açık maddeler':'Open requirements'} <b>{openRows.length}</b></button>}
        {enrolled&&<button type="button" aria-pressed={shared} onClick={()=>{setShared(!shared);setOpenOnly(false);setPage(0);select('');}}>{tr?'Ortak Gereksinimler':'Shared requirements'}</button>}
      </div>
      <input type="search" aria-label={tr?'Madde ara':'Search requirements'} placeholder={tr?'Madde ara…':'Search requirements…'} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
      {enrolled&&<select aria-label={tr?'Nedene göre filtrele':'Filter by reason'} value={gapFilter} onChange={e=>{setGapFilter(e.target.value);setPage(0);}}>
        <option value="all">{tr?'Tüm nedenler':'All reasons'}</option><option value="unmapped">{tr?'Kontrol bağlantısı eksik':'Missing control mapping'}</option>
        <option value="partial">{tr?'Kısmi uygulama veya eşleştirme':'Partial implementation or mapping'}</option><option value="evidence">{tr?'Onaylı kanıt eksik':'Missing approved evidence'}</option>
        <option value="implementation">{tr?'Uygulanmış kontrol yok':'No implemented control'}</option>
        <option value="verification">{tr?'Bağımsız doğrulama bekliyor':'Independent verification pending'}</option><option value="decision">{tr?'SoA kararı bekliyor':'Pending SoA decision'}</option></select>}</div>
      {message&&<p role="status" className="posture-notice">{message}</p>}
      <div className="posture-ledger-wrap"><table className="posture-ledger"><thead><tr>
        <th scope="col">{tr?'Madde':'Reference'}</th><th scope="col">{tr?'Gereksinim':'Requirement'}</th>
        {enrolled&&<><th scope="col">{tr?'Durum':'Status'}</th><th scope="col">{tr?'Bağlı kontroller':'Linked controls'}</th>
          <th scope="col">{tr?'SoA Kapsam':'SoA scope'}</th><th scope="col">{tr?'Aksiyon':'Action'}</th></>}
      </tr></thead><tbody>{filtered.slice(current*pageSize,(current+1)*pageSize).map(({row,state})=>{
        const expanded=row.ref===selected;
        const shared=state==='covered'?row.links.filter(link=>counts[link.id]>1 && link.coverage==='supports' && data.pins[link.id]?.length &&
          ['uygulanıyor','implemented'].includes(implementation.get(link.id)??'')).filter(link=>data.pins[link.id]?.some(p=>p.verified)):[];
        const badge=statusLabel(state,tr);
        const toggle=()=>{select(expanded?'':row.ref);setMessage('');};
        const detailId=rowId(row.ref)+'-details';
        return <Fragment key={row.ref}><tr className={expanded?'posture-selected':''}>
          <th scope="row">{row.ref}</th><td><button id={rowId(row.ref)} type="button" className="posture-row-trigger"
            aria-expanded={expanded} aria-label={row.ref+' · '+row.title}
            aria-controls={expanded?detailId:undefined} onClick={toggle}>{row.title} <span aria-hidden="true"/></button></td>
          {enrolled&&<><td data-label={tr?'Durum':'Status'}><span className={'posture-status '+state}>{badge}</span>
            {shared.map(link=><details key={link.id} className="ec-shared"><summary>{tr?'Ortak Kontrol ile Karşılandı':'Satisfied through shared control'} ({controls.get(link.id)?.code} · {counts[link.id]} {tr?'Çerçeve':'Frameworks'})</summary><ul>{frameworks[link.id]?.map(f=><li key={f.name}>{f.name} · {f.refs.join(', ')}</li>)}</ul></details>)}
            <small className="posture-reason">{reasonLabels[state][tr?0:1]}</small></td>
            <td data-label={tr?'Bağlı kontroller':'Linked controls'}><div className="posture-chips">{row.links.map(link=><span className="posture-control-chip" key={link.id} title={controls.get(link.id)?.title}>
              <code>{controls.get(link.id)?.code}</code>{state!=='excluded' && counts[link.id]>1 && <small>{tr?counts[link.id]+' çerçevede geçerli':'Across '+counts[link.id]+' frameworks'}</small>}</span>)}
              {!row.links.length&&<span aria-label={tr?'Kontrol yok':'No controls'}>—</span>}</div></td>
            <td data-label={tr?'SoA Kapsam':'SoA scope'}><ScopeCell key={row.revision} name={name} row={row} tr={tr} write={props.write} onEdit={()=>select('')} onSave={saved} onReload={()=>refresh(v=>v+1)}/></td>
            <td data-label={tr?'Aksiyon':'Action'}><button type="button" className="posture-link-action" onClick={toggle} aria-expanded={expanded}
              aria-controls={expanded?detailId:undefined}>{!row.links.length && props.write?(tr?'+ Kontrol bağla':'+ Link control'):
                props.write?(tr?'Bağları düzenle':'Edit links'):(tr?'Ayrıntılar':'Details')}</button></td></>}
        </tr>
        {expanded&&<tr className="posture-detail-row"><td id={detailId} colSpan={enrolled?6:2}>
          {enrolled?<DecisionEditor key={row.ref+row.revision} row={row} matrix={data} {...props}
            onClose={()=>close(row.ref)} onReload={()=>refresh(v=>v+1)} onSave={saved}/>:
            <p>{tr?'Kontrol bağlamak ve kanıt kapsamını izlemek için bu çerçeveyi kapsama ekleyin.':'Add this framework to scope to link controls and track evidence coverage.'}</p>}
        </td></tr>}</Fragment>;
      })}</tbody></table></div>
      {!filtered.length&&<p className="posture-empty">{openOnly&&!query&&!branch&&!shared&&gapFilter==='all'?(tr?'Bu çerçevede açık madde yok.':'No open requirements in this framework.'):(tr?'Eşleşen madde yok.':'No matching requirements.')}</p>}
      <footer><span>{filtered.length} {tr?'madde':'requirements'} · {current+1}/{pages}</span>
        <button type="button" disabled={!current} onClick={()=>{setPage(current-1);select('');}}>{tr?'Önceki':'Previous'}</button>
        <button type="button" disabled={current+1>=pages} onClick={()=>{setPage(current+1);select('');}}>{tr?'Sonraki':'Next'}</button></footer>
    </section>
    <RequirementIndex states={states} branch={branch} onBranch={chooseBranch} tr={tr} rows={data.requirements} selected={selected} onPick={pick}/>
  </div>;
}

export function FrameworkWorkspace(props:WorkspaceProps & {initialProgram?:string}) {
  const {tr,write}=props;
  const [revision,refresh]=useState(0),[selected,select]=useState(props.initialProgram || ''),[choice,setChoice]=useState('');
  const [adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const [target,setTarget]=useState({ref:'',revision:0});
  const addTrigger=useRef<HTMLButtonElement>(null);
  const {data,error}=usePosture<Overview>({overview:'1'},revision,true);
  const retry=()=>refresh(v=>v+1);
  if(!data)return <section className="posture-workspace posture-home" role="status">{error?(tr?'Çerçeveler yüklenemedi.':'Could not load frameworks.'):(tr?'Çerçeveler yükleniyor…':'Loading frameworks…')} {error&&<button onClick={retry}>{tr?'Tekrar dene':'Retry'}</button>}</section>;
  const names=data.enrolled;
  const active=data.catalog.includes(selected)?selected:names[0];
  const available=data.catalog.filter(n=>!data.enrolled.includes(n));
  const candidate=available.includes(choice)?choice:available[0];
  async function add(name:string) {
    if(!write||!available.includes(name)||busy)return;
    setBusy(true);setFailed(false);
    try{
      await postureRequest({},undefined,{action:'enroll',name});
      select(name);setTarget({ref:'',revision:target.revision+1});setAdding(false);retry();addTrigger.current?.focus();
    }catch{setFailed(true);}finally{setBusy(false);}
  }
  function catalogPill(name:string){
    const label=preferred[name]||name;
    return <button type="button" key={name} disabled={busy} title={name} onClick={()=>{
      if(write)void add(name);else{select(name);setTarget({ref:'',revision:target.revision+1});}
    }}>{write?(tr?'+ '+label+' Ekle':'+ Add '+label):label}</button>;
  }
  return <section className="posture-workspace posture-home">
    <div className="posture-portfolio"><div className="posture-strip-head"><h2>{tr?'Çerçeveler arası karşılaştırma':'Framework comparison'}</h2>
      {write&&available.length>0&&<button className="primary workspace-create" ref={addTrigger} type="button" aria-expanded={adding} onClick={()=>{setChoice(available.includes(active)?active:available[0]);setFailed(false);setAdding(!adding);}}>{tr?'Çerçeve ekle':'Add framework'}</button>}</div>
      {!names.length&&<p className="posture-empty">{tr?'Kapsamda çerçeve yok.':'No frameworks in scope.'}</p>}
      {names.length>0&&<div className="posture-strip" style={{'--posture-columns':Math.min(6,names.length)} as CSSProperties} role="group" aria-label={tr?'Çerçeveler':'Frameworks'}>{names.map(name=>{
        const totals=data.coverage[name],percent=totals?.scope && totals.assessed?Math.round(100*totals.compliant/totals.scope):null;
        const gaps=data.comparison?.[name];
        return <div key={name} className="posture-column"><button className="posture-column-head" type="button" aria-pressed={active===name} title={name+(totals?' · '+totals.compliant+'/'+totals.scope:'')} onClick={()=>{select(name);setTarget({ref:'',revision:target.revision+1});setAdding(false);}}>
          <span><strong>{preferred[name]||name}</strong>{percent!==null&&<b className="posture-ring" style={{backgroundImage:`conic-gradient(var(--ws-brand) ${percent}%, var(--ws-line) 0)`}}><span>{tr?'%'+percent:percent+'%'}</span></b>}</span>
          {percent!==null?<small>{totals.compliant}/{totals.scope} {tr?'uyumlu':'compliant'}</small>:<small>{totals?.scope?(tr?'Değerlendirme bekleniyor':'Awaiting assessment'):totals?(tr?'Kapsamda madde yok':'No items in scope'):(tr?'Katalogda':'In catalog')}</small>}
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
      })}</div>}
      {available.length>0&&<div className="posture-catalog-strip" aria-label={tr?'Katalogda':'In catalog'}>
        <small>{tr?'Katalogda':'In catalog'}</small>{available.filter(n=>preferred[n]).map(catalogPill)}
        {available.some(n=>!preferred[n])&&<details><summary>{tr?'Diğer çerçeveler':'More frameworks'}</summary>
          <div>{available.filter(n=>!preferred[n]).map(catalogPill)}</div></details>}
      </div>}
      {failed&&<p role="alert">{tr?'Çerçeve eklenemedi. Tekrar deneyin.':'Could not add framework. Please retry.'}</p>}
      {adding&&<div className="posture-enroll"><label>{tr?'Katalogdan seç':'Choose from catalog'}<select autoFocus disabled={busy} value={candidate} onChange={e=>setChoice(e.target.value)}>{available.map(n=><option key={n}>{n}</option>)}</select></label>
        <button type="button" className="primary" disabled={busy} onClick={()=>add(candidate)}>{tr?'Kapsama ekle':'Add to scope'}</button>
        <button type="button" disabled={busy} onClick={()=>{setAdding(false);addTrigger.current?.focus();}}>{tr?'Vazgeç':'Cancel'}</button>
        <button type="button" disabled={busy} onClick={()=>{select(candidate);setTarget({ref:'',revision:target.revision+1});setAdding(false);}}>{tr?'Maddeleri önizle':'Preview requirements'}</button></div>}
    </div>
    {active&&<Program key={active+data.enrolled.includes(active)+target.revision} initialRef={target.ref} counts={data.controlFrameworkCounts} frameworks={data.controlFrameworks} name={active} enrolled={data.enrolled.includes(active)} onSaved={retry} {...props}/>}
  </section>;
}
