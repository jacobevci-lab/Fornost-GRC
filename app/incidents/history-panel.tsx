'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {withBasePath} from '../base-path';
import {requestJsonWithDeadline} from '../bounded-json-request';
import {WorkflowEvidenceHistory} from '../workflow-selection-fields';
import type {WorkflowEvidencePin} from '../workflow-selection';
import {incidentDecisionDetail} from './decisions';
import {incidentLabel} from './labels';
import {IncidentContextDetails} from './context-details';
type Row=Record<string,string|number|null>;
export default function IncidentHistoryPanel({id,tr}:{id:string;tr:boolean}) {
  const [events,setEvents]=useState<Row[]>([]),[pins,setPins]=useState<WorkflowEvidencePin[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
  const pending=useRef<AbortController|null>(null),retryCursor=useRef<string|null>(null);
  const load=useCallback(async(before:string|null)=>{
    pending.current?.abort();const controller=new AbortController();pending.current=controller;retryCursor.current=before;setLoading(true);setFailed(false);
    try {
      const params=new URLSearchParams({view:'history',incidentId:id});if(before)params.set('cursor',before);
      const {response,body}=await requestJsonWithDeadline(withBasePath('/api/incidents?'+params),{signal:controller.signal,cache:'no-store'},fetch,10_000);
      if(!response.ok||!Array.isArray(body.events)||!Array.isArray(body.evidencePins)||!(body.nextCursor===null||typeof body.nextCursor==='string'))throw new Error('history');
      if(controller.signal.aborted||pending.current!==controller)return;
      setEvents(previous=>[...new Map([...(before?previous:[]),...body.events as Row[]].map(row=>[row.id,row])).values()]);
      setPins(previous=>[...new Map([...(before?previous:[]),...body.evidencePins as WorkflowEvidencePin[]].map(row=>[row.id,row])).values()]);setCursor(body.nextCursor as string|null);
    } catch {if(!controller.signal.aborted&&pending.current===controller)setFailed(true);}
    finally {if(!controller.signal.aborted&&pending.current===controller)setLoading(false);}
  },[id]);
  useEffect(()=>{const timer=setTimeout(()=>void load(null),0);return()=>{clearTimeout(timer);pending.current?.abort();};},[load]);
  return <section className="incident-record-history" aria-label={tr?'Olayın karar geçmişi':'Incident decision history'}><header><h4>{tr?'Olayın karar geçmişi':'Incident decision history'}</h4><button type="button" disabled={loading} onClick={()=>void load(null)}>{tr?'Yenile':'Refresh'}</button></header>
    {loading&&<p role="status">{tr?'Geçmiş yükleniyor…':'Loading history…'}</p>}{failed&&<p role="alert">{tr?'Geçmiş yüklenemedi. Gösterilen kayıtlar son başarılı okumaya aittir.':'History could not be loaded. Displayed entries are from the last successful read.'} <button type="button" onClick={()=>void load(retryCursor.current)}>{tr?'Tekrar dene':'Retry'}</button></p>}
    {events.map(event=>{const detail=incidentDecisionDetail(String(event.detail)),eventPins=pins.filter(pin=>pin.eventId===event.id);return <article key={String(event.id)}><b>{incidentLabel(String(event.action),tr?'tr':'en')}</b><p>{String(event.actor)} · <time dateTime={String(event.created_at)}>{new Date(String(event.created_at)).toLocaleString(tr?'tr-TR':'en-GB')}</time></p><p>{event.from_status&&incidentLabel(String(event.from_status),tr?'tr':'en')} → {incidentLabel(String(event.to_status||''),tr?'tr':'en')}</p><p>{detail?.note||String(event.detail)}</p>
      {detail&&<details><summary>{tr?'Kararda incelenen olay ve gerekçe':'Incident and rationale reviewed in this decision'}</summary><IncidentContextDetails tr={tr} record={detail.reviewedSource}/>{Object.entries(detail.decision).filter(([,value])=>value).map(([key,value])=><p key={key}><b>{({rootCause:tr?'Kök neden':'Root cause',lessonsLearned:tr?'Çıkarılan dersler':'Lessons learned',notificationDecision:tr?'Bildirim kararı':'Notification decision',notificationRationale:tr?'Bildirim kararı gerekçesi':'Notification rationale'} as Record<string,string>)[key]}:</b> {incidentLabel(value,tr?'tr':'en')}</p>)}</details>}
      <WorkflowEvidenceHistory tr={tr} pins={eventPins} entityId={id} historical/>
      {!eventPins.length&&event.evidence_reference&&<p>{tr?'Eski kanıt beyanı':'Legacy evidence declaration'}: {String(event.evidence_reference)}<br/><code>{String(event.evidence_sha256||'')}</code></p>}
    </article>;})}
    {!loading&&!failed&&!events.length&&<p>{tr?'Geçmiş kaydı yok.':'No history entries.'}</p>}
    {cursor&&<button type="button" disabled={loading||failed} onClick={()=>void load(cursor)}>{tr?'Daha eski 50 kayıt':'Older 50 entries'}</button>}
    <p>{tr?'Kayıtlar 50’şer yüklenir; daha eski kararlar korunur.':'Entries load in pages of 50; older decisions remain retained.'}</p>
  </section>;
}
