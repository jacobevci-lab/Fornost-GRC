'use client';
import {useState} from 'react';
import {getCatalogStatus} from '../framework-catalog-status';
import {postureRequest,usePosture} from './client';
import {CreateControl} from './create-control';
import type {Control,Applicability,Coverage,Matrix,ProgramIndex,Requirement} from './types';
import './workspace.css';

type Props={tr:boolean;write:boolean;createControl:boolean;onControlCreated:()=>void};
export function applicabilityLabel(value:Applicability,tr:boolean){
  return {required:tr?'Katalog kapsamında':'In catalog',undecided:tr?'Karar bekliyor':'Undecided',included:tr?'Uygulanabilir':'Applicable',excluded:tr?'Hariç':'Excluded'}[value];
}
function DecisionEditor({row,matrix,tr,write,createControl,onControlCreated,onSave,onClose}:{row:Requirement;matrix:Matrix;onSave:()=>void;onClose:()=>void}&Props){
  const [links,setLinks]=useState(row.links),[app,setApp]=useState(row.applicability),[reason,setReason]=useState(row.reason);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');
  const [created,setCreated]=useState<Control[]>([]);
  const controls=[...matrix.controls,...created];
  const available=controls.filter(c=>!links.some(l=>l.id===c.id) && (c.code+' '+c.title).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  async function save(){
    setPending(true);setError('');
    try{
      await postureRequest({},undefined,{action:'save',name:matrix.name,ref:row.ref,revision:row.revision,applicability:app,reason,links});
      onSave();
    }catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  return <section className="posture-editor" aria-label={tr?'Madde ayrıntısı':'Requirement details'}>
    <header><h4>{row.ref} · {row.title}</h4><button type="button" disabled={pending} onClick={onClose}>{tr?'Kapat':'Close'}</button></header>
    <fieldset disabled={!write||pending}>
    {row.annex && <div className="posture-fields"><label>{tr?'Uygulanabilirlik':'Applicability'}<select value={app} onChange={e=>setApp(e.target.value as Applicability)}>{(['undecided','included','excluded'] as const).map(k=><option key={k} value={k}>{applicabilityLabel(k,tr)}</option>)}</select></label>
    <label>{tr?'Karar gerekçesi':'Decision rationale'}<textarea value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} /></label></div>}
    <h5>{tr?'Bağlı kontroller':'Linked controls'}</h5>
    {links.length===0&&<p>{tr?'Bu maddeye bağlı kontrol yok.':'No control is linked to this requirement.'}</p>}
    {links.map(link=>{
      const c=controls.find(item=>item.id===link.id);
      if(!c)return null;
      return <div key={c.id} className="posture-linked"><strong>{c.code} · {c.title}</strong><span>{c.implementation}</span>
        <label>{tr?'Katkı':'Coverage'}<select value={link.coverage} onChange={e=>setLinks(links.map(l=>l.id===c.id?{...l,coverage:e.target.value as Coverage}:l))}>
          <option value="supports">{tr?'Destekler':'Supports'}</option><option value="partial">{tr?'Kısmen destekler':'Partially supports'}</option></select></label>
        {write&&<button type="button" onClick={()=>setLinks(links.filter(l=>l.id!==c.id))}>{tr?'Bağı kaldır':'Unlink'}</button>}
        <ul>{(matrix.pins[c.id]||[]).map(p=><li key={p.id}>{p.title} · v{p.version} · {p.period}</li>)}</ul></div>;
    })}
    {write&&<div className="posture-fields"><label>{tr?'Kontrol ara':'Search controls'}<input value={search} onChange={e=>setSearch(e.target.value)} /></label>
      <label>{tr?'Mevcut kontrolü bağla':'Link existing control'}<select value="" onChange={e=>{if(e.target.value)setLinks([...links,{id:e.target.value,coverage:'supports'}]);}}>
      <option value="">{tr?'Kontrol seçin':'Select a control'}</option>{available.slice(0,100).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label></div>}
    {write&&createControl&&<CreateControl tr={tr} onCreated={c=>{onControlCreated();setCreated(previous=>[...previous,c]);setLinks(previous=>[...previous,{id:c.id,coverage:'supports'}]);}}/>}
    {created.length>0&&<p role="status">{tr?'Taslak kütüphaneye eklendi. Maddeye bağlamak için eşleştirmeyi kaydedin.':'Draft added to the library. Save the mapping to link it to this requirement.'}</p>}
    {write&&<button type="button" className="primary" disabled={['included','excluded'].includes(app)&&!reason.trim()} onClick={save}>{tr?'Eşleştirmeyi kaydet':'Save mapping'}</button>}
    </fieldset>
    {error&&<p role="alert">{error==='409'?(tr?'Kayıt değişti. Güncel sürümü yükleyip tekrar düzenleyin.':'The record changed. Load the current version and edit again.'):(tr?'Kaydedilemedi. Tekrar deneyin.':'Could not save. Please retry.')} {error==='409'&&<button type="button" onClick={onSave}>{tr?'Yenile':'Reload'}</button>}</p>}
  </section>;
}
function Program({name,tr,write,createControl,onControlCreated}:{name:string}&Props){
  const [revision,setRevision]=useState(0),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[group,setGroup]=useState('all'),[page,setPage]=useState(0),[ref,setRef]=useState('');
  const {data,error}=usePosture<Matrix>({name},revision);
  if(!data)return <p role="status">{error?(tr?'Matris yüklenemedi.':'Matrix unavailable.'):(tr?'Matris yükleniyor…':'Loading matrix…')} {error&&<button onClick={()=>setRevision(revision+1)}>{tr?'Yenile':'Retry'}</button>}</p>;
  const inScope=data.requirements.filter(r=>r.applicability!=='excluded');
  const withPin=(r:Requirement)=>r.links.some(l=>data.pins[l.id]?.length);
  const filtered=data.requirements.filter(r=>(group==='all'||r.annex===(group==='annex')) && (filter==='all'||(r.applicability!=='excluded' && (filter==='gap'?!r.links.length:filter==='partial'?r.links.some(l=>l.coverage==='partial'):!withPin(r)))) && (r.ref+' '+r.title).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const count=Math.max(1,Math.ceil(filtered.length/12)),current=Math.min(page,count-1),row=data.requirements.find(r=>r.ref===ref);
  const notice=getCatalogStatus(name);
  return <><p className="posture-note">{tr?notice.tr:notice.en}</p>
    <div className="posture-totals"><span><b>{inScope.length}</b> {tr?'hariç tutulmamış madde':'requirements not excluded'}</span><span><b>{inScope.filter(r=>r.links.length).length}</b> {tr?'kontrol bağlı':'mapped'}</span><span><b>{inScope.filter(withPin).length}</b> {tr?'onaylı sürüm kanıtı var':'with approved version evidence'}</span></div>
    <div className="posture-fields"><label>{tr?'Madde ara':'Search requirements'}<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} /></label>
    {data.requirements.some(r=>r.annex)&&<label>{tr?'Bölüm':'Section'}<select value={group} onChange={e=>{setGroup(e.target.value);setPage(0);}}><option value="all">{tr?'Tümü':'All'}</option><option value="clauses">{tr?'Yönetim sistemi maddeleri':'Management clauses'}</option><option value="annex">{tr?'Ek A · Uygulanabilirlik Bildirgesi (SoA)':'Annex A · Statement of Applicability (SoA)'}</option></select></label>}
    <label>{tr?'Görünüm':'View'}<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">{tr?'Tüm maddeler':'All requirements'}</option><option value="gap">{tr?'Kontrol bağlantısı eksik':'Missing control mapping'}</option><option value="partial">{tr?'Kısmi eşleştirme':'Partial mapping'}</option><option value="evidence">{tr?'Onaylı kanıt eksik':'Missing approved evidence'}</option></select></label></div>
    {row&&<DecisionEditor key={row.ref+row.revision} row={row} matrix={data} onControlCreated={onControlCreated} createControl={createControl} tr={tr} write={write} onClose={()=>setRef('')} onSave={()=>setRevision(revision+1)} />}
    <div className="posture-scroll"><table><thead><tr><th>{tr?'Madde':'Requirement'}</th><th>{tr?'Kapsam':'Scope'}</th><th>{tr?'Bağlı kontrol':'Linked controls'}</th><th>{tr?'Onaylı kanıt':'Approved evidence'}</th></tr></thead>
    <tbody>{filtered.slice(current*12,current*12+12).map(r=><tr key={r.ref}><td><button type="button" aria-expanded={r.ref===ref} onClick={()=>setRef(r.ref)}>{r.ref} · {r.title}</button></td><td>{applicabilityLabel(r.applicability,tr)}</td><td>{r.links.length}</td><td>{r.applicability==='excluded'?'—':new Set(r.links.flatMap(l=>(data.pins[l.id]||[]).map(p=>p.id))).size}</td></tr>)}</tbody></table></div>
    {!filtered.length&&<p>{tr?'Eşleşen madde yok.':'No matching requirements.'}</p>}
    <footer><span>{filtered.length} {tr?'madde':'requirements'} · {current+1}/{count}</span><button disabled={!current} onClick={()=>setPage(current-1)}>{tr?'Önceki':'Previous'}</button><button disabled={current+1>=count} onClick={()=>setPage(current+1)}>{tr?'Sonraki':'Next'}</button></footer></>;
}
export function FrameworkWorkspace({tr,write,createControl,onControlCreated}:Props){
  const [revision,setRevision]=useState(0),[selected,setSelected]=useState(''),[choice,setChoice]=useState(''),[pending,setPending]=useState(false),[failed,setFailed]=useState(false);
  const {data,error}=usePosture<ProgramIndex>({},revision);
  const available=data?.catalog.filter(n=>!data.enrolled.includes(n))||[], candidate=available.includes(choice)?choice:available[0], active=data?.enrolled.includes(selected)?selected:data?.enrolled[0];
  async function add(){
    if(!candidate)return;
    setPending(true);setFailed(false);
    try{await postureRequest({},undefined,{action:'enroll',name:candidate});setSelected(candidate);setRevision(v=>v+1);}catch{setFailed(true);}finally{setPending(false);}
  }
  return <section className="posture-workspace"><header><h3>{tr?'Çerçeve ve gereksinim matrisi':'Framework and requirement matrix'}</h3></header>
    {!data&&<p role="status">{error?(tr?'Çerçeveler yüklenemedi.':'Frameworks unavailable.'):(tr?'Yükleniyor…':'Loading…')} {error&&<button onClick={()=>setRevision(revision+1)}>{tr?'Yenile':'Retry'}</button>}</p>}
    {data&&<><div className="posture-fields">{!!data.enrolled.length&&<label>{tr?'Etkin çerçeve':'Active framework'}<select value={active} onChange={e=>setSelected(e.target.value)}>{data.enrolled.map(n=><option key={n}>{n}</option>)}</select></label>}
    {write&&available.length>0&&<><label>{tr?'Katalogdan seç':'Choose from catalog'}<select disabled={pending} value={candidate} onChange={e=>setChoice(e.target.value)}>{available.map(n=><option key={n}>{n}</option>)}</select></label><button disabled={pending} className="primary" onClick={add}>{tr?'Çerçeve ekle':'Add framework'}</button></>}</div>
    {failed&&<p role="alert">{tr?'Çerçeve eklenemedi.':'Could not add framework.'}</p>}
    {active?<Program key={active} name={active} onControlCreated={onControlCreated} createControl={createControl} tr={tr} write={write}/>:<p>{tr?'Henüz çerçeve eklenmedi. Seçilen çerçevenin maddeleri katalogdan gelir.':'No framework added yet. Selecting a framework loads its requirements from the catalog.'}</p>}</>}
  </section>;
}
