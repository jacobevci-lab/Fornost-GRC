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
export default function IncidentHistoryPanel({id,tr,view,showEvidence}:{id:string;tr:boolean;view:"summary"|"evidence"|"history"|"crisis";showEvidence:()=>void}) {
  const [events,setEvents]=useState<Row[]>([]),[pins,setPins]=useState<WorkflowEvidencePin[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
  const pending=useRef<AbortController|null>(null),retryCursor=useRef<string|null>(null);
  const load=useCallback(async(before:string|null)=>{
    pending.current?.abort();const controller=new AbortController();pending.current=controller;retryCursor.current=before;setLoading(true);setFailed(false);
    try {
      const params=new URLSearchParams({view:'history',incidentId:id});if(before)params.set('cursor',before);
      const {response,body}=await requestJsonWithDeadline(withBasePath('/api/incidents?'+params),{signal:controller.signal,cache:'no-store'},fetch,10_000);
      if(!response.ok||!Array.isArray(body.events)||!Array.isArray(body.evidencePins)||!(body.nextCursor===null||typeof body.nextCursor==='string'))throw new Error('history');
      if(!body.events.every(event=>event&&typeof event.id==="string"&&event.incident_id===id)||
        !body.evidencePins.every(pin=>pin&&pin.entityId===id&&pin.evidence&&typeof pin.evidence.fileKey==="string"&&typeof pin.evidence.fileName==="string"))throw new Error("Incident history scope mismatch");
      if(controller.signal.aborted||pending.current!==controller)return;
      setEvents(previous=>[...new Map([...(before?previous:[]),...body.events as Row[]].map(row=>[row.id,row])).values()]);
      setPins(previous=>[...new Map([...(before?previous:[]),...body.evidencePins as WorkflowEvidencePin[]].map(row=>[row.id,row])).values()]);setCursor(body.nextCursor as string|null);
    } catch {if(!controller.signal.aborted&&pending.current===controller)setFailed(true);}
    finally {if(!controller.signal.aborted&&pending.current===controller)setLoading(false);}
  },[id]);
  useEffect(()=>{const timer=setTimeout(()=>void load(null),0);return()=>{clearTimeout(timer);pending.current?.abort();};},[load]);
  const evidenceOnly=view==="evidence"||view==="summary";
  const withEvidence=events.filter(event=>pins.some(pin=>pin.eventId===event.id)||event.evidence_reference);
  const visible=view==="summary"?withEvidence.slice(0,1):evidenceOnly?withEvidence:events;
  const title=view==="summary"?(tr?"Son müdahale kanıtı":"Latest response evidence"):view==="evidence"?(tr?"Olay kanıtları":"Case evidence"):view==="crisis"?(tr?"Karar günlüğü":"Decision log"):(tr?"Olayın karar geçmişi":"Incident decision history");
  return <section className="incident-record-history ic-history-panel" aria-label={title}><header><h4>{title}</h4>
    {view==="summary"?<button type="button" onClick={showEvidence}>{tr?"Kanıtları incele":"Inspect evidence"}</button>:<button type="button" disabled={loading} onClick={()=>void load(null)}>{tr?'Yenile':'Refresh'}</button>}</header>
    {loading&&<p role="status">{tr?'Geçmiş yükleniyor…':'Loading history…'}</p>}{failed&&<p role="alert">{tr?'Geçmiş yüklenemedi. Gösterilen kayıtlar son başarılı okumaya aittir.':'History could not be loaded. Displayed entries are from the last successful read.'} <button type="button" onClick={()=>void load(retryCursor.current)}>{tr?'Tekrar dene':'Retry'}</button></p>}
    {visible.map(event=>{const detail=incidentDecisionDetail(String(event.detail)),eventPins=pins.filter(pin=>pin.eventId===event.id);return <article key={String(event.id)}><b>{incidentLabel(String(event.action),tr?'tr':'en')}</b><p>{String(event.actor)} · <time dateTime={String(event.created_at)}>{new Date(String(event.created_at)).toLocaleString(tr?'tr-TR':'en-GB')}</time></p>{!evidenceOnly&&<><p>{event.from_status&&incidentLabel(String(event.from_status),tr?'tr':'en')} → {incidentLabel(String(event.to_status||''),tr?'tr':'en')}</p><p>{detail?.note||String(event.detail)}</p></>}
      {view==="history"&&detail&&<details><summary>{tr?'Kararda incelenen olay ve gerekçe':'Incident and rationale reviewed in this decision'}</summary><IncidentContextDetails tr={tr} record={detail.reviewedSource}/>{Object.entries(detail.decision).filter(([,value])=>value).map(([key,value])=><p key={key}><b>{({rootCause:tr?'Kök neden':'Root cause',lessonsLearned:tr?'Çıkarılan dersler':'Lessons learned',notificationDecision:tr?'Bildirim kararı':'Notification decision',notificationRationale:tr?'Bildirim kararı gerekçesi':'Notification rationale'} as Record<string,string>)[key]}:</b> {incidentLabel(value,tr?'tr':'en')}</p>)}</details>}
      {view==="summary"?eventPins.map(pin=><div key={pin.id} className="ic-proof">
        <div><strong>{pin.evidence.evidenceTitle} · {tr?"Sürüm":"Version"} {pin.evidence.versionNo}</strong><small>{pin.evidence.fileName}</small></div>
        <a href={withBasePath("/api/evidence?key="+encodeURIComponent(pin.evidence.fileKey))} target="_blank" rel="noopener noreferrer">{tr?"Kanıtı aç":"Open evidence"}</a>
      </div>):<WorkflowEvidenceHistory tr={tr} pins={eventPins} entityId={id} historical/>}
      {!eventPins.length&&event.evidence_reference&&<p>{tr?'Eski kanıt beyanı':'Legacy evidence declaration'}: {String(event.evidence_reference)}<br/><code>{String(event.evidence_sha256||'')}</code></p>}
    </article>;})}
    {!loading&&!failed&&!visible.length&&<p>{evidenceOnly?(cursor?(tr?"Yüklenen kararlarda kanıt yok. Daha eski kararları kanıtlar görünümünde inceleyebilirsiniz.":"No evidence in the loaded decisions. Older decisions are available in the evidence view."):(tr?"Henüz müdahale kanıtı kaydedilmedi.":"No response evidence has been recorded.")):(tr?"Geçmiş kaydı yok.":"No history entries.")}</p>}
    {view!=="summary"&&cursor&&<button type="button" disabled={loading||failed} onClick={()=>void load(cursor)}>{tr?'Daha eski 50 kayıt':'Older 50 entries'}</button>}
  </section>;
}
