"use client";
import {useEffect,useState} from 'react';
import {withBasePath} from './base-path';
import {AiRelatedRecordLink} from './ai-related-record-link';
type Props={modelId:string;revision:string;disabled?:boolean;lang?:string};
type Row={id:string;modelId:string;title:string;status:string;severity:string};
export function AiModelLinkedWork(props:Props){return <LinkedWork key={`${props.modelId}:${props.revision}`} {...props}/>;}
function LinkedWork({modelId,disabled=false,lang='tr'}:Props){
 const[open,setOpen]=useState(false);const en=lang==='en';
 return <div className="ai-record-history ai-model-linked-work"><button type="button" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(!open)}>{en?'Linked alerts and findings':'Bağlı alarmlar ve bulgular'}</button>{open&&<div className="ai-record-history-panel" role="region" aria-label={en?'Model linked work':'Modele bağlı aksiyonlar'}><Source modelId={modelId} source="alerts" disabled={disabled} en={en}/><Source modelId={modelId} source="findings" disabled={disabled} en={en}/></div>}</div>;
}
function Source({modelId,source,disabled,en}:{modelId:string;source:'alerts'|'findings';disabled:boolean;en:boolean}){
 const[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[page,setPage]=useState(0),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();
  void(async()=>{try{const response=await fetch(withBasePath(`/api/ai/${source==='alerts'?'assurance-alerts':'findings'}?modelId=${encodeURIComponent(modelId)}`),{cache:'no-store',signal:controller.signal}),body=await response.json(),items=body[source];
   if(!response.ok||!Array.isArray(items)||!items.every((row:Row)=>row&&typeof row.id==='string'&&row.modelId===modelId&&typeof row.title==='string'&&typeof row.status==='string'&&typeof row.severity==='string'))throw new Error('Invalid linked records');
   if(active)setRows(items);
  }catch{if(active)setError(true);}finally{if(active)setLoading(false);}})();
  return()=>{active=false;controller.abort();};
 },[modelId,source,reload]);
 const title=source==='alerts'?(en?'Alerts':'Alarmlar'):(en?'Findings':'Bulgular');
 const statuses:Record<string,string>={open:'Açık',acknowledged:'Kabul edildi',escalated:'Bulguya dönüştürüldü',resolved:'Çözüldü','in-progress':'İşlemde',verification:'Doğrulamada',dismissed:'Reddedildi'};
 const severities:Record<string,string>={Critical:'Kritik',High:'Yüksek',Medium:'Orta',Low:'Düşük'};
 return <section aria-label={title} aria-busy={loading}><div className="ai-record-history-tools"><b>{title}{!loading&&!error?` (${rows.length})`:''}</b><button type="button" disabled={disabled||loading} onClick={()=>{setLoading(true);setError(false);setRows([]);setPage(0);setReload(value=>value+1);}}>{en?'Refresh':'Yenile'}</button></div>
 {loading?<p role="status">{en?'Loading…':'Yükleniyor…'}</p>:error?<p role="alert">{en?'Could not load records. Select Refresh to retry.':'Kayıtlar yüklenemedi. Yenile ile tekrar deneyin.'}</p>:rows.length===0?<p>{en?'No linked records.':'Bağlı kayıt bulunamadı.'}</p>:<><ol>{rows.slice(page*5,page*5+5).map(row=><li key={row.id}><AiRelatedRecordLink kind={source==='alerts'?'ai-alert':'ai-finding'} recordRef={row.id} label={row.title} disabled={disabled}/><p>{en?row.severity:severities[row.severity]||row.severity} · {en?row.status:statuses[row.status]||row.status}</p></li>)}</ol>{rows.length>5&&<div className="ai-record-history-tools"><button type="button" disabled={disabled||page===0} onClick={()=>setPage(value=>value-1)}>{en?'Previous':'Önceki'}</button><small>{page+1} / {Math.ceil(rows.length/5)}</small><button type="button" disabled={disabled||(page+1)*5>=rows.length} onClick={()=>setPage(value=>value+1)}>{en?'Next':'Sonraki'}</button></div>}{rows.length===500&&<p>{en?'Up to 500 linked records are shown.':'En fazla 500 bağlı kayıt gösterilir.'}</p>}</>}
 </section>;
}
