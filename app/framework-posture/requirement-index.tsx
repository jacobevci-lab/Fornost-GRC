'use client';
import {useState} from 'react';
import {matchesRequirement,type RequirementState} from './requirements';
import type {Requirement} from './types';

export const annexBranch='@iso-annex';
export function matchesBranch(row:Requirement,branch:string){
  return !branch || (branch===annexBranch?row.annex:row.group===branch);
}
type Props={rows:Requirement[];states:Map<string,RequirementState>;selected:string;branch:string;tr:boolean;
  onBranch:(branch:string)=>void;onPick:(row:Requirement)=>void};
const annexLabels:Record<string,[string,string]>={
  'A.5':['Organizasyonel','Organizational'],'A.6':['Kişiler','People'],'A.7':['Fiziksel','Physical'],'A.8':['Teknolojik','Technological'],
};
export function RequirementIndex({rows,states,selected,branch,tr,onBranch,onPick}:Props){
  const [search,setSearch]=useState(''),[mobileOpen,setMobileOpen]=useState(false);
  const groups=new Map<string,Requirement[]>();
  for(const row of rows){
    const group=groups.get(row.group);
    if(group)group.push(row);else groups.set(row.group,[row]);
  }
  const annex=rows.filter(r=>r.annex), heading=tr?'Madde ağacı':'Requirement outline';
  function branchButton(id:string,title:string,members:Requirement[]){
    const total=members.filter(r=>states.get(r.ref)!=='excluded').length;
    const compliant=members.filter(r=>states.get(r.ref)==='covered').length;
    const label=tr?compliant+' uyumlu / '+total+' kapsamda':compliant+' compliant / '+total+' in scope';
    return <button className="posture-branch" type="button" aria-pressed={branch===id}
      onClick={()=>onBranch(id===branch?'':id)}><span>{title}</span>
      <small title={label} aria-label={label}><i aria-hidden="true" data-tone={!total?'none':!compliant?'open':compliant===total?'covered':'partial'}/>{compliant}/{total}</small></button>;
  }
  function groupNode([id,members]:[string,Requirement[]]){
    const visible=members.filter(r=>matchesRequirement(r,search,tr));
    if(!visible.length)return null;
    const title=annexLabels[id]?id+' · '+annexLabels[id][tr?0:1]:annex.length&&!members[0].annex?(tr?'Yönetim sistemi maddeleri':'Management clauses'):id;
    const expanded=branch===id || !!search.trim() || (!branch && !!selected && members.some(r=>r.ref===selected));
    return <div key={id}>{branchButton(id,title,members)}
      {expanded&&<div className="posture-leaves">{visible.map(r=><button type="button" key={r.ref}
        aria-current={selected===r.ref?'true':undefined} onClick={()=>{setMobileOpen(false);onPick(r);}}><b>{r.ref}</b> {r.title}</button>)}</div>}</div>;
  }
  const list=[...groups];
  return <section className="posture-outline" aria-label={heading}>
    <h3>{heading}</h3><button type="button" className="posture-index-toggle" aria-expanded={mobileOpen}
      aria-controls="posture-tree-body" onClick={()=>setMobileOpen(!mobileOpen)}>{heading} <span aria-hidden="true"/></button>
    <div id="posture-tree-body" className={'posture-tree-body'+(mobileOpen?' is-open':'')}>
      <input type="search" aria-label={tr?'Madde ağacında ara':'Search outline'} placeholder={tr?'Madde ağacında ara…':'Search outline…'} value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="posture-branches">{branchButton('',tr?'Tüm dallar':'All branches',rows)}
        {list.filter(([,rs])=>!rs[0].annex).map(groupNode)}
        {annex.some(r=>matchesRequirement(r,search,tr))&&<>{branchButton(annexBranch,tr?'Ek A kontrolleri':'Annex A controls',annex)}
          <div className="posture-nested">{list.filter(([,rs])=>rs[0].annex).map(groupNode)}</div></>}
        {!rows.some(r=>matchesRequirement(r,search,tr))&&<p>{tr?'Eşleşen madde yok.':'No matching requirements.'}</p>}</div>
    </div></section>;
}
