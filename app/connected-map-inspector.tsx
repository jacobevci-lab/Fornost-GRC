"use client";
import {useRef,useState} from 'react';
import {withBasePath} from './base-path';
import {contextId,storedContextType} from './connected-map-context';
import {editableEdge,linkChoices} from './connected-map-links';
import {mapArrow,arrowLabel} from './connected-map-layout';
import {mapTitle,mapCode} from './connected-map-model';
import {issueLabels,recordOwner,type WorkbenchIssue} from './connected-grc-workbench-model';
import type {ConnectedGrcLink as Link,ConnectedGrcRow as Row} from './connected-grc-model';
import type {AccessSubject} from './module-access';
export default function MapInspector({row,links,issues,actor,tr,moduleLabel,select,openRecord,edit,refresh,refocus}:{refocus?:()=>void;row:Row;links:Link[];issues:WorkbenchIssue[];actor:AccessSubject;tr:boolean;moduleLabel:(s:string)=>string;select:(r:Row)=>void;openRecord:(r:Row)=>void;edit:()=>void;refresh:()=>Promise<boolean>}){
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),pending=useRef(false);
  const [history,setHistory]=useState<{id:string;actor:string;action:string;created_at:string;note:string}[]|null>(null);
  const [historyFailed,setHistoryFailed]=useState(false);
  async function readHistory(){
    setHistoryFailed(false);
    try{
      const response=await fetch(withBasePath('/api/connected-grc/links?sourceId='+encodeURIComponent(contextId(row))),{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('history');
      setHistory((await response.json()).events);
    }catch{setHistoryFailed(true)}
  }
  const groups=new Map<string,{edge:Link;other:Row;out:boolean}[]>();
  for(const edge of links){
    const out=edge.source.id===row.id;if(!out&&edge.target.id!==row.id)continue;
    const other=out?edge.target:edge.source,group=groups.get(other.module)||[];
    group.push({edge,other,out:mapArrow(edge).from.id===row.id});groups.set(other.module,group);
  }
  async function unlink(edge:Link,field:string){
    if(pending.current)return;pending.current=true;setBusy(true);setMessage('');
    try{
      const response=await fetch(withBasePath('/api/connected-grc/links'),{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({action:'unlink',kind:edge.field==='mapContext'?'context':'core',edgeId:edge.matched,relation:storedContextType(edge.relation),sourceId:edge.field==='mapContext'?contextId(edge.source):edge.source.id,targetId:edge.field==='mapContext'?contextId(edge.target):edge.target.id,field,expectedUpdatedAt:edge.source.updatedAt,note:tr?'İlişki haritasından kaldırıldı.':'Removed from relationship map.'})});
      if(!response.ok){setMessage(tr?'Bağlantı kaldırılamadı. Güncel kaydı kontrol edin.':'Could not remove the link. Check the current record.');return;}
      if(history!==null)void readHistory();
      setMessage(await refresh()?(tr?'Bağlantı kaldırıldı.':'Relationship removed.'):(tr?'Bağlantı kaldırıldı. Görünümü yenileyin.':'Relationship removed. Refresh the view.'));
    }catch{setMessage(tr?'Sonuç doğrulanamadı. Görünümü yenileyin.':'Outcome unknown. Refresh the view.')}
    finally{pending.current=false;setBusy(false)}
  }
  return <aside className="cgw-inspector cm-inspector"><small>{mapCode(row)} · {moduleLabel(row.module)}</small><h3>{mapTitle(row,tr)}</h3><p>{recordOwner(row)}</p>
    {!!linkChoices(row,actor,[row.module]).length&&<button type="button" className="primary" onClick={edit}><span aria-hidden="true">+ </span>{tr?'Bağlantı ekle':'Add relationship'}</button>}
    {refocus&&<button type="button" onClick={refocus}>{tr?'Bu kaydın haritası':'Map this record'}</button>}
    <button type="button" onClick={()=>openRecord(row)}>{tr?'Kaynak kaydı aç':'Open source record'}</button>
    {[...groups].map(([module,items])=><section key={module}><h4>{moduleLabel(module)} <span>{items.length}</span></h4>{items.map(({edge,other,out})=>{const field=editableEdge(edge,links,actor);return <div className="cm-relation" key={[edge.source.id,edge.target.id,edge.field,edge.relation].join('|')}>
      <button onClick={()=>select(other)}><small>{out?(tr?'Giden':'Outgoing'):(tr?'Gelen':'Incoming')} · {arrowLabel(edge,tr)}</small><b>{mapCode(other)} · {mapTitle(other,tr)}</b></button>
      {field?<button type="button" disabled={busy} aria-label={(tr?'Bağlantıyı kaldır':'Remove relationship')+' · '+mapTitle(other,tr)} title={tr?'Bağlantıyı kaldır':'Remove relationship'} onClick={()=>void unlink(edge,field)}>×</button>:<button type="button" title={tr?'Kaynak kayıtta yönetilir':'Managed in the source record'} aria-label={(tr?'Kaynak bağlantıyı incele':'Inspect source relationship')+' · '+mapTitle(other,tr)} onClick={()=>openRecord(edge.source)}>↗</button>}</div>})}</section>)}
    {!groups.size&&<p>{tr?'Görünür ilişki yok.':'No visible relationships.'}</p>}
    {issues.filter(i=>i.row.id===row.id).map(i=><small className="cm-issue" key={i.id}>{issueLabels[i.kind][tr?0:1]}</small>)}
    <details className="cm-history" onToggle={e=>{if(e.currentTarget.open)void readHistory()}}><summary>{tr?'Bağlantı işlem geçmişi':'Relationship change history'}</summary>
      {historyFailed?<button onClick={()=>void readHistory()}>{tr?'Geçmişi yeniden yükle':'Retry history'}</button>:history===null?<p>{tr?'Yükleniyor…':'Loading…'}</p>:!history.length?<p>{tr?'İşlem kaydı yok.':'No changes recorded.'}</p>:history.map(e=><article key={e.id}><b>{e.action==='link'?(tr?'Eklendi':'Added'):(tr?'Kaldırıldı':'Removed')}</b><small>{e.actor} · {new Date(e.created_at).toLocaleString(tr?'tr-TR':'en-US')}</small><p>{e.note}</p></article>)}
    </details>
    {message&&<p role="status">{message}</p>}
  </aside>;
}
