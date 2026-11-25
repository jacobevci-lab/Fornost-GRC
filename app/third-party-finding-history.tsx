"use client";
import { useRef, useState } from 'react';
import { useWorkflowRecords } from './use-workflow-records';
import { WorkflowEvidenceHistory } from './workflow-selection-fields';
import { findingEventLabel, findingStatusLabel, type FindingHistory } from './third-party-risk/finding-history';

export function ThirdPartyFindingHistoryDisclosure({findingId,tr}:{findingId:string;tr:boolean}) {
  const [open,setOpen]=useState(false);
  return <details className="tprm-finding-history-disclosure wide" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{tr?'Bulgu karar geçmişi':'Finding decision history'}</summary>{open&&<ThirdPartyFindingHistory findingId={findingId} tr={tr}/>}</details>;
}

export function ThirdPartyFindingHistory({findingId,tr}:{findingId:string;tr:boolean}) {
  const [cursors,setCursors]=useState<(string|null)[]>([null]),before=cursors[cursors.length-1],heading=useRef<HTMLHeadingElement>(null);
  const resource=useWorkflowRecords<FindingHistory>(`/api/third-party-risk?view=finding-history&findingId=${encodeURIComponent(findingId)}${before?'&before='+encodeURIComponent(before):''}`,null);
  const data=resource.ready&&resource.data?.finding?.id===findingId&&resource.data.before===before&&Array.isArray(resource.data.rows)?resource.data:null;
  function move(next:(string|null)[]) {setCursors(next);heading.current?.focus()}
  return <section className="tprm-finding-history" aria-label={tr?'Bulgu geçmişi':'Finding history'}>
    <h3 tabIndex={-1} ref={heading}>{tr?'Kaydedilmiş kararlar ve gerekçeler':'Recorded decisions and reasons'}</h3>
    <p>{tr?'Her kayıt, o işlemde saklanan gerekçeyi ve varsa dosya sürümünü gösterir. Eski kayıtlar sonradan oluşturulmuş ayrıntılar içermez.':'Each entry shows the reason and any file version retained for that event. Missing historical details are not reconstructed.'}</p>
    <button type="button" disabled={resource.loading} onClick={()=>void resource.reload()}>{tr?'Geçmişi yenile':'Refresh history'}</button>
    {resource.loading?<p role="status">{tr?'Bulgu geçmişi yükleniyor…':'Loading finding history…'}</p>:!data?<p role="alert">{tr?'Bulgu geçmişi yüklenemedi. Yenileyerek tekrar deneyin.':'Finding history could not be loaded. Refresh to try again.'}</p>:<>
      <div className="tprm-finding-current"><strong>{data.finding.title}</strong><span>{findingStatusLabel(data.finding.status,tr)} · {data.finding.owner} · {data.finding.dueDate}</span>{data.finding.actionNote&&<p><b>{tr?'Son işlem notu':'Latest action note'}: </b>{data.finding.actionNote}</p>}</div>
      {!data.rows.length&&<p>{tr?'Bu bulgu için kaydedilmiş işlem geçmişi yok.':'No retained event history for this finding.'}</p>}
      <ol>{data.rows.map(row=><li key={row.id}>
        <h4>{findingEventLabel(row,tr)}</h4><span>{row.actor} · <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(tr?'tr-TR':'en-GB')}</time></span>
        {row.from&&row.to&&<p>{findingStatusLabel(row.from,tr)} → {findingStatusLabel(row.to,tr)}</p>}
        {row.action==='finding-deadline-changed' ? row.deadline ? <div className="tprm-finding-deadline-event"><p><b>{tr?'Önceki / yeni termin':'Previous / new deadline'}:</b> {row.deadline.previousDate} → {row.deadline.nextDate}</p><p>{tr?'Değişiklik anında':'At the time of change'}: {row.deadline.wasOverdue?(tr?'Önceki termin gecikmişti':'Previous deadline was overdue'):(tr?'Önceki termin gecikmemişti':'Previous deadline was not overdue')}</p><p>#{row.deadline.cycleNumber} · {row.deadline.owner} · {findingStatusLabel(row.deadline.status,tr)} · {row.deadline.severity}</p><p className="tprm-finding-note">{row.deadline.note}</p></div> : <p role="alert">{tr?'Termin değişikliğinin saklanan ayrıntıları okunamadı.':'The retained deadline change details could not be read.'}</p> : <p className="tprm-finding-note">{row.note|| (tr?'Bu kayıtta gerekçe saklanmamış.':'No reason was retained for this event.')}</p>}
        {row.pin?<WorkflowEvidenceHistory tr={tr} pins={[row.pin]} entityId={findingId} historical/>:row.pinIssue?<p role="alert">{tr?'Bu işlemin saklanan kanıt kaydı doğrulanamadı. Yöneticinizle kontrol edin.':'This event’s retained evidence record could not be validated. Check with your administrator.'}</p>:['finding-submit-finding','finding-verify-finding'].includes(row.action)?<p>{tr?'Bu işlem için saklanmış dosya sürümü bağlantısı yok.':'No retained file-version link for this event.'}</p>:null}
      </li>)}</ol>
    </>}
    <nav aria-label={tr?'Bulgu geçmişi sayfaları':'Finding history pages'}>
      <button type="button" disabled={resource.loading||cursors.length===1} onClick={()=>move(cursors.slice(0,-1))}>{tr?'Daha yeni':'Newer'}</button>
      <span>{tr?'Sayfa':'Page'} {cursors.length}</span>
      <button type="button" disabled={!data?.nextCursor||resource.loading} onClick={()=>{if(data?.nextCursor)move([...cursors,data.nextCursor])}}>{tr?'Daha eski':'Older'}</button>
      {cursors.length>1&&<button type="button" disabled={resource.loading} onClick={()=>move([null])}>{tr?'En yeni kayıtlar':'Latest entries'}</button>}
    </nav>
  </section>;
}
