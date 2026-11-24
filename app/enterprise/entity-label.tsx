'use client';
import {useEffect,useState} from 'react';
import {request,type Kind} from './client';
// One authorized request per module/render batch, rather than one request per row.
const cache=new Map<string,{name:string;at:number}>(),waiting=new Map<Kind,Map<string,((name:string)=>void)[]>>();
let scheduled=false;
function read(kind:Kind,id:string,done:(name:string)=>void){
 const key=kind+':'+id,known=cache.get(key);if(known&&Date.now()-known.at<30000){done(known.name);return;}
 const group=waiting.get(kind)||new Map<string,((name:string)=>void)[]>();group.set(id,[...(group.get(id)||[]),done]);waiting.set(kind,group);
 if(scheduled)return;scheduled=true;
 setTimeout(()=>{scheduled=false;const groups=[...waiting];waiting.clear();for(const [kind,group] of groups){const ids=[...group.keys()];for(let i=0;i<ids.length;i+=100){const part=ids.slice(i,i+100);void request<{labels:Record<string,string>}>(`enterprise/records?view=labels&kind=${kind}&ids=${encodeURIComponent(JSON.stringify(part))}`).then(data=>{for(const id of part){const name=data.labels[id]||'';cache.set(kind+':'+id,{name,at:Date.now()});for(const fn of group.get(id)||[])fn(name)}}).catch(()=>{for(const id of part)for(const fn of group.get(id)||[])fn('')})}}},0);
}
export function EntityLabel({kind,id,tr}:{kind:Kind;id:string;tr:boolean}){
 const [value,setValue]=useState<{key:string;name:string}>();
 useEffect(()=>{let active=true;const load=()=>read(kind,id,name=>{if(active)setValue({key:kind+':'+id,name})});load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load)}},[kind,id]);
 return <small className="ec-entity-label">{value?.key===kind+':'+id?(value.name||(tr?'Kapsam okunamadı':'Scope unavailable')):'…'}</small>;
}
