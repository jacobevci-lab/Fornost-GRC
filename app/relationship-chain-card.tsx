"use client";
import { useId, useState, type ReactNode } from 'react';
import { connectedTitle, type ConnectedGrcRow as Row } from './connected-grc-model';
import { displayRecordCode } from './record-codes';
import { domainModuleLabel } from './domain-identity';
import { relationshipStatus } from './relationship-chain-model';
import NavIcon from './nav-icon';
import './relationship-chain.css';

export type ChainLinkActions={unavailable?:(module:string)=>string|undefined;canLink?:(source:Row,module:string)=>boolean;linkRecord?:(source:Row,module:string)=>void};
export function RelationshipCard({row,anchor,lang,openRecord}:{row:Row;anchor:Row;lang:'tr'|'en';openRecord:(row:Row)=>void}){
  const current=row.id===anchor.id,status=relationshipStatus(row,lang);
  return <button type="button" className="relationship-card chain-node" data-record-id={row.id} aria-current={current?'true':undefined}
    aria-label={`${displayRecordCode(row)} · ${connectedTitle(row)} · ${status.label}${current?(lang==='tr'?' · Geçerli kayıt':' · Current record'):''}`}
    onClick={()=>{if(!current)openRecord(row)}}>
    <NavIcon module={row.module}/><span className="relationship-identity"><span className="relationship-meta"><small>{displayRecordCode(row)}</small><span className="relationship-status" data-typography="badge" data-tone={status.tone}>{status.label}</span></span><strong>{connectedTitle(row)}</strong></span>
    {!current&&<i aria-hidden="true">›</i>}
  </button>;
}
export function RelationshipList<T>({items,render,tr,label}:{items:T[];render:(item:T,index:number)=>ReactNode;tr:boolean;label:string}){
  const [expanded,setExpanded]=useState(false),id=useId();
  return <><ul id={id} className="relationship-list">{(expanded?items:items.slice(0,2)).map(render)}</ul>
    {items.length>2&&<button className="relationship-more" type="button" aria-expanded={expanded} aria-controls={id}
      aria-label={`${label} · ${expanded?(tr?'Daha az göster':'Show less'):(tr?`+${items.length-2} kayıt daha`:`+${items.length-2} more records`)}`}
      onClick={()=>setExpanded(!expanded)}>{expanded?(tr?'Daha az göster':'Show less'):(tr?`+${items.length-2} kayıt daha`:`+${items.length-2} more records`)}</button>}</>;
}
export function MissingRelationship({source,module,tr,canLink,linkRecord,message}:{source?:Row;module:string;tr:boolean;message?:string}&ChainLinkActions){
  const names:Record<string,string[]>={'İş Sürekliliği':['BCP tanımlı değil','No BCP defined'],Kontroller:['Kontrol bağlı değil','No control linked'],Kanıtlar:['Kanıt bağlı değil','No evidence linked']};
  const text=message||names[module]?.[tr?0:1]||(domainModuleLabel(module,tr?'tr':'en')+(tr?' bağlı değil':' not linked'));
  const allowed=!message&&source&&canLink?.(source,module)&&linkRecord;
  return allowed?<button type="button" className="relationship-empty" onClick={()=>linkRecord(source!,module)}>{text} · <b>{tr?'+ Bağla':'+ Link'}</b></button>:<p className="relationship-empty">{text}</p>;
}
