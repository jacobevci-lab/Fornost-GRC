'use client';
import {useEffect,useRef,useState} from 'react';
import {matchesRequirement} from './requirements';
import type {Requirement} from './types';

type Props={rows:Requirement[];selected:string;tr:boolean;onPick:(row:Requirement)=>void};
const annexLabels:Record<string,[string,string]>={
  'A.5':['Organizasyonel','Organizational'], 'A.6':['Kişiler','People'],
  'A.7':['Fiziksel','Physical'], 'A.8':['Teknolojik','Technological'],
};

export function RequirementIndex({rows,selected,tr,onPick}:Props) {
  const [search,setSearch]=useState(''),[mobileOpen,setMobileOpen]=useState(false);
  const index=useRef<HTMLDivElement>(null);
  const found=rows.filter(r=>matchesRequirement(r,search,tr));
  const groups=new Map<string,Requirement[]>();
  for(const row of found){
    const branch=groups.get(row.group);
    if(branch)branch.push(row);else groups.set(row.group,[row]);
  }
  const isIso=rows.some(r=>r.annex);
  const treeHeading=tr?'Madde ağacı':'Requirement outline';
  useEffect(()=>{
    const item=index.current?.querySelector('button[aria-current="true"]');
    for(let el=item?.parentElement; el && el!==index.current; el=el.parentElement){
      if(el instanceof HTMLDetailsElement)el.open=true;
    }
  },[selected,search]);
  const groupNode=([group,members]:[string,Requirement[]])=>{
    const title=annexLabels[group]?group+' · '+annexLabels[group][tr?0:1]:
      isIso && !members[0].annex?(tr?'Yönetim sistemi maddeleri':'Management clauses'):group;
    return <details key={group} open={search.trim()?true:undefined}>
      <summary>{title} <small>{members.length}</small></summary>
      <div className="posture-leaves">{members.map(r=><button type="button" key={r.ref}
        aria-current={r.ref===selected?'true':undefined}
        onClick={()=>{setMobileOpen(false);onPick(r);}}><b>{r.ref}</b> {r.title}</button>)}</div>
    </details>;
  };
  const branches=[...groups];
  return <section className="posture-outline" ref={index} aria-label={treeHeading}>
    <h3>{treeHeading}</h3>
    <button type="button" className="posture-index-toggle" aria-expanded={mobileOpen}
      aria-controls="posture-tree-body" onClick={()=>setMobileOpen(!mobileOpen)}>{treeHeading} <span aria-hidden="true"/></button>
    <div id="posture-tree-body" className={'posture-tree-body'+(mobileOpen?' is-open':'')}>
      <input type="search" aria-label={tr?'Madde ağacında ara':'Search outline'} placeholder={tr?'Madde ağacında ara…':'Search outline…'} value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="posture-branches">{branches.filter(([,members])=>!members[0].annex).map(groupNode)}
      {found.some(r=>r.annex)&&<details open><summary>{tr?'Ek A kontrolleri':'Annex A controls'}</summary><div className="posture-nested">{branches.filter(([,members])=>members[0].annex).map(groupNode)}</div></details>}
      {!found.length&&<p>{tr?'Eşleşen madde yok.':'No matching requirements.'}</p>}</div>
    </div>
  </section>;
}
