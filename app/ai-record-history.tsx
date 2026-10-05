"use client";
import {useEffect,useRef,useState} from 'react';
import {withBasePath} from './base-path';
type Entry={id:string;actor:string;action:string;status:string;detail:string;createdAt:string;promptHash?:string|null};
type Props={recordId:string;revision:string;disabled?:boolean;lang?:string};
const labels:Record<string,[string,string]>={
 'model-inventory-create':['Model oluşturuldu','Model created'],'model-inventory-edit':['Model düzenlendi','Model edited'],
 'model-inventory-delete':['Taslak silindi','Draft deleted'],'model-inventory-approved':['Model onaylandı','Model approved'],'model-inventory-suspended':['Model askıya alındı','Model suspended'],
 'ai-finding-create':['Bulgu oluşturuldu','Finding created'],'ai-finding-start':['Aksiyon başlatıldı','Action started'],'ai-finding-submit':['Doğrulamaya gönderildi','Submitted for verification'],'ai-finding-resolve':['Bulgu doğrulandı ve kapatıldı','Finding verified and closed'],'ai-finding-reopen':['Bulgu yeniden açıldı','Finding reopened'],
 'ai-assurance-alert-observe':['Yeni güvence gözlemi','New assurance observation'],'ai-assurance-alert-acknowledge':['Alarm kabul edildi','Alert acknowledged'],'ai-assurance-alert-escalate':['Alarm bulguya dönüştürüldü','Alert escalated to finding'],'ai-assurance-alert-resolve':['Alarm çözüldü','Alert resolved'],'ai-assurance-alert-reopen':['Alarm yeniden açıldı','Alert reopened'],
 'ai-decommission-create':['Emeklilik planı oluşturuldu','Retirement plan created'],'ai-decommission-approve':['Emeklilik onaylandı','Retirement approved'],'ai-decommission-start':['Emeklilik başlatıldı','Retirement started'],'ai-decommission-verify':['Emeklilik doğrulandı','Retirement verified'],
};
export function AiRecordHistory(props:Props){return <History key={`${props.recordId}:${props.revision}`} {...props}/>;}
function History({recordId,disabled=false,lang='tr'}:Props){
 const en=lang==='en',t=(tr:string,eng:string)=>en?eng:tr;
 const[open,setOpen]=useState(false),[logs,setLogs]=useState<Entry[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(false),[more,setMore]=useState(false);
 const request=useRef(0);useEffect(()=>()=>{request.current++;},[]);
 async function load(){const ticket=++request.current;setLoading(true);setError(false);setLogs([]);setMore(false);
  try{const response=await fetch(withBasePath(`/api/ai/audit?id=${encodeURIComponent(recordId)}&limit=50`),{cache:'no-store'}),body=await response.json();
   if(!response.ok||!Array.isArray(body.logs)||!body.logs.every((r:Entry)=>r&&typeof r.id==='string'&&typeof r.actor==='string'&&typeof r.action==='string'&&typeof r.status==='string'&&typeof r.detail==='string'&&typeof r.createdAt==='string'))throw new Error('Invalid history');
   if(request.current===ticket){setLogs(body.logs);setMore(body.hasMore===true);}
  }catch{if(request.current===ticket)setError(true);}finally{if(request.current===ticket)setLoading(false);}
 }
 return <div className="ai-record-history"><button type="button" aria-expanded={open} disabled={disabled} onClick={()=>{if(open){request.current++;setOpen(false);setLoading(false);}else{setOpen(true);void load();}}}>{t('İşlem geçmişi','Activity history')}</button>
 {open&&<div className="ai-record-history-panel" role="region" aria-label={t('Kaydın işlem geçmişi','Record activity history')} aria-busy={loading}>
 <div className="ai-record-history-tools"><small>{t('Bu kayda bağlı son 50 olay','Latest 50 events linked to this record')}</small><button type="button" disabled={disabled||loading} onClick={()=>void load()}>{t('Yenile','Refresh')}</button></div>
 {loading?<p role="status">{t('Geçmiş yükleniyor…','Loading history…')}</p>:error?<p role="alert">{t('Geçmiş yüklenemedi. Yenile ile tekrar deneyin.','History could not be loaded. Select Refresh to retry.')}</p>:logs.length===0?<p>{t('Bu kayda bağlı denetim olayı bulunamadı.','No linked audit events found.')}</p>:<ol>{logs.map(log=><li key={log.id}><b>{labels[log.action]?.[en?1:0]||log.action}</b><span>{log.status==='success'?t('Tamamlandı','Completed'):log.status==='denied'?t('Engellendi','Denied'):log.status==='error'?t('Hata','Error'):log.status}</span><div>{log.actor} · <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString(en?'en-GB':'tr-TR')}</time></div><p>{log.detail}</p>{log.promptHash&&<code>SHA-256: {log.promptHash}</code>}</li>)}</ol>}
 {more&&!loading&&!error&&<p>{t('Daha eski olaylar da var; burada son 50 olay gösteriliyor.','Older events exist; only the latest 50 are shown here.')}</p>}
 </div>}</div>;
}
