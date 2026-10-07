'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from '../base-path';
import {findingsRequest} from './workspace';
import type {FindingHistoryEvent} from './history';
type Cursor={after:string;stamp:string};
export default function FindingHistoryPanel({findingId,lang}:{findingId:string;lang:'tr'|'en'}){
 const tr=lang==='tr';const [events,setEvents]=useState<FindingHistoryEvent[]>([]),[next,setNext]=useState<Cursor|null>(null),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false);
 const controller=useRef<AbortController|null>(null),retry=useRef<Cursor|null>(null);
 const load=useCallback(async(cursor:Cursor|null)=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;retry.current=cursor;setBusy(true);setFailed(false);
  if(!cursor){setEvents([]);setNext(null);}
  const params=new URLSearchParams({findingId,...(cursor||{})});
  try{
   const {response,body}=await findingsRequest(withBasePath('/api/findings/history?'+params),{signal:request.signal,cache:'no-store'});
   if(!response.ok||!Array.isArray(body.events)||body.events.length>50||body.events.some(e=>!e||e.findingId!==findingId||['id','action','actor','detail','createdAt'].some(k=>typeof e[k]!=='string'))||!(body.next===null||(typeof body.next==='object'&&typeof (body.next as Cursor).after==='string'&&typeof (body.next as Cursor).stamp==='string')))throw new Error('Invalid history');
   if(request.signal.aborted)return;
   const rows=body.events as FindingHistoryEvent[];
   setEvents(previous=>cursor?[...previous,...rows.filter(row=>!previous.some(item=>item.id===row.id))]:rows);setNext(body.next as Cursor|null);
  }catch{if(!request.signal.aborted)setFailed(true);}finally{if(!request.signal.aborted)setBusy(false);}
 },[findingId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(null),0);return()=>{clearTimeout(timer);controller.current?.abort();};},[load]);
 return <section className="finding-record-history" aria-busy={busy}>
  <header><h4>{tr?'Bu bulgunun işlem geçmişi':'This finding’s audit trail'}</h4><button type="button" disabled={busy} onClick={()=>void load(null)}>{tr?'Yenile':'Refresh'}</button></header>
  {failed&&<p role="alert">{tr?'İşlem geçmişi alınamadı.':'Audit trail could not be loaded.'} <button type="button" disabled={busy} onClick={()=>void load(retry.current)}>{tr?'Yeniden dene':'Retry'}</button></p>}
  {busy&&<p role="status">{tr?'İşlem geçmişi yükleniyor…':'Loading audit trail…'}</p>}
  {!busy&&!failed&&!events.length&&<p>{tr?'Bu bulgu için işlem kaydı yok.':'No events recorded for this finding.'}</p>}
  <ol>{events.map(event=><li key={event.id}><strong>{event.action}</strong><span>{event.actor} · <time dateTime={event.createdAt}>{event.createdAt}</time></span>{(event.fromStatus||event.toStatus)&&<small>{event.fromStatus||'—'} → {event.toStatus||'—'}</small>}<p>{event.detail}</p>{event.evidenceReference&&<small>{tr?'Kanıt':'Evidence'}: {event.evidenceReference}</small>}{event.evidenceSha256&&<code>SHA-256: {event.evidenceSha256}</code>}</li>)}</ol>
  {next&&!failed&&<button type="button" disabled={busy} onClick={()=>void load(next)}>{tr?'Daha eski olayları yükle':'Load older events'}</button>}
 </section>;
}
