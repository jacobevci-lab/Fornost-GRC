"use client";
import { workpaperStatusLabels } from './audit-workpapers';
import { useEffect, useId, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { auditPlanLabels } from './audit-plan';
import { requestStatusLabels } from './audit-requests';
import { findingLabel } from './findings/presentation';
import { downloadBlob } from './report-export';
import { auditStatusReportCsv, auditStatusReportHtml, auditStatusReportPdf } from './audit-status-report-export';
import { auditReportSummary, type AuditReportDetail, type AuditReportItem, type AuditReportListItem, type AuditReportSource } from './audit-status-report';
import './audit-status-report.css';

const messages: Record<string,[string,string]>={
  changed:['Rapor kaynakları değişti. Önizlemeyi yeniden yükleyip kontrol edin; yazdıklarınız korunuyor.','Report sources changed. Reload and review the preview; your text is retained.'],
  limit:['Rapor sınırı aşıldı: en çok 2.000 madde, 500 talep, 1.000 bağlı bulgu ve 8 MB kaynak verisi. Eksik rapor oluşturulmadı.','Report limit exceeded: at most 2,000 requirements, 500 requests, 1,000 linked findings and 8 MB of source data. No partial report was created.'],
  forbidden:['Bu rapor CAPA verisi içerdiğinden yönetici yetkisi gerekir.','This report includes CAPA data and requires administrator access.'],
  fields:['Başlık 3–200, özet 10–4.000, kısıtlar en çok 4.000 karakter olmalıdır.','Use 3–200 characters for the title, 10–4,000 for the summary, and at most 4,000 for limitations.'],
  'source-invalid':['Kaynak verisi eksik veya okunamıyor; tam rapor doğrulanamadı. Kayıtları kontrol edip tekrar deneyin.','Source data is incomplete or unreadable; a complete report could not be verified. Check the records and retry.'],
  'scope-ambiguous':['Bir bulgunun kaynak referansı birden fazla denetim kaydıyla eşleşiyor. Bulguda tekil kayıt kimliğini kullanarak bağlantıyı düzeltin.','A finding source reference matches more than one audit record. Correct the link using a unique record ID.'],
  integrity:['Rapor bütünlüğü doğrulanamadı. Çıktılar kapatıldı.','Report integrity could not be verified. Exports are disabled.'],
  export:['Çıktı hazırlanamadı. PDF için desteklenmeyen karakterler olabilir; HTML veya CSV deneyin.','The export could not be prepared. PDF may contain unsupported characters; try HTML or CSV.'],
  unavailable:['İşlem sonucu doğrulanamadı. Geçmişi yenileyin veya aynı kaydı tekrar deneyin; çift rapor oluşturulmaz.','The outcome could not be confirmed. Refresh history or retry the same save; this will not create duplicate reports.'],
};
export function AuditStatusReportPanel({auditId,lang,embedded=false}:{auditId:string;lang:string;embedded?:boolean}){
  const tr=lang!=='en',t=(a:string,b:string)=>tr?a:b,formId=useId();
  const [open,setOpen]=useState(embedded),[history,setHistory]=useState<{reports:AuditReportListItem[];complete:boolean}|null>(null);
  const [source,setSource]=useState<AuditReportSource|null>(null),[detail,setDetail]=useState<AuditReportDetail|null>(null);
  const [title,setTitle]=useState(''),[summary,setSummary]=useState(''),[limitations,setLimitations]=useState('');
  const [error,setError]=useState(''),[historyError,setHistoryError]=useState(false),[busy,setBusy]=useState(false),[valid,setValid]=useState(false);
  const [refresh,setRefresh]=useState(0),pending=useRef(false),generation=useRef(0),attempt=useRef<{key:string;id:string}|null>(null);
  const endpoint=`/api/audits/reports?auditId=${encodeURIComponent(auditId)}`;
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    if(!open)return;let live=true;const controller=new AbortController();
    fetch(withBasePath(endpoint),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{if(live){setHistory(data);setHistoryError(false);}}).catch(()=>{if(live)setHistoryError(true);});
    return()=>{live=false;controller.abort();};
  },[open,endpoint,refresh]);
  async function read(url:string){const r=await fetch(withBasePath(url),{cache:'no-store',signal:AbortSignal.timeout(30000)});const body=await r.json();if(!r.ok)throw new Error(body.error||'unavailable');return body;}
  async function load(reportId?:string){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setValid(false);const sequence=++generation.current;
    try{const body=await read(endpoint+(reportId?`&reportId=${encodeURIComponent(reportId)}`:'&preview=1'));if(sequence!==generation.current)return;
      if(reportId){setDetail(body);setSource(null);}else{setSource(body);setDetail(null);setValid(true);if(!title)setTitle(`${body.audit.name} · ${t('Durum raporu','Status report')}`.slice(0,200));}
    }catch(e){if(sequence===generation.current)setError(e instanceof Error?e.message:'unavailable');}
    finally{if(sequence===generation.current){pending.current=false;setBusy(false);}}
  }
  async function save(){
    if(pending.current||!source||!valid||title.trim().length<3||summary.trim().length<10)return;
    pending.current=true;setBusy(true);setError('');const sequence=generation.current;
    const key=JSON.stringify([source.sourceRevision,title,summary,limitations]);
    if(attempt.current?.key!==key)attempt.current={key,id:`ARP-${crypto.randomUUID()}`};
    try{
      const r=await fetch(withBasePath('/api/audits/reports'),{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({auditId,reportId:attempt.current.id,expectedSourceRevision:source.sourceRevision,title,summary,limitations})});
      const result=await r.json();if(!r.ok)throw new Error(result.error||'unavailable');
      const saved=await read(endpoint+`&reportId=${encodeURIComponent(result.id)}`);if(sequence!==generation.current)return;
      setDetail(saved);setSource(null);setValid(false);setTitle('');setSummary('');setLimitations('');attempt.current=null;setRefresh(v=>v+1);
    }catch(e){if(sequence===generation.current){const code=e instanceof Error?e.message:'unavailable';setError(code);if(['changed','limit','fields','id-conflict'].includes(code))setValid(false);setRefresh(v=>v+1);}}
    finally{if(sequence===generation.current){pending.current=false;setBusy(false);}}
  }
  async function exportReport(format:'html'|'pdf'|'csv'){
    if(pending.current||!detail||detail.integrity!=='verified')return;
    pending.current=true;setBusy(true);setError('');const sequence=generation.current;
    try{
      const current:AuditReportDetail=await read(endpoint+`&reportId=${encodeURIComponent(detail.snapshot.id)}`);
      if(sequence!==generation.current)return;setDetail(current);if(current.integrity!=='verified')throw new Error('integrity');
      const blob=format==='pdf'?await auditStatusReportPdf(current,tr):new Blob([format==='html'?auditStatusReportHtml(current,tr):auditStatusReportCsv(current,tr)],{type:format==='html'?'text/html;charset=utf-8':'text/csv;charset=utf-8'});
      if(sequence===generation.current)downloadBlob(`${current.snapshot.id}-${tr?'tr':'en'}.${format}`,blob);
    }catch(e){if(sequence===generation.current)setError(e instanceof Error&&e.message==='integrity'?'integrity':'export');}
    finally{if(sequence===generation.current){pending.current=false;setBusy(false);}}
  }
  return <section className="audit-status-report" aria-busy={busy}>
    {embedded ? <h3>{t("Denetim durum raporları","Audit status reports")}</h3> : <button type="button" className="asr-toggle" aria-expanded={open} disabled={busy} onClick={()=>setOpen(v=>!v)}>{open?'▾':'▸'} {t('Denetim durum raporları','Audit status reports')}</button>}
    {open&&<div className="asr-content">
      <p>{t('Kayıtlı planı, tüm maddeleri, talepleri ve doğrudan bağlı CAPA bulgularını aynı tarihli raporda saklayın. Sonraki değişiklikler önceki raporu değiştirmez. Rapor denetimi veya bulguları kapatmaz; otomatik denetim görüşü üretmez.','Save the recorded plan, all requirements, requests and directly linked CAPA findings in one dated report. Later changes do not alter earlier reports. Reports do not close audits or findings, or generate an audit opinion.')}</p>
      <p className="asr-scope">{t('Bulgu kapsamı: kaynak türü “denetim” ve kaynak referansı bu denetimin kimliği ya da maddelerinden birinin kimliği/koduyla tam eşleşir. Serbest metin veya ortak kontrol referansları eşleştirilmez. Kanıt dosyaları ve canlı hazırlık skoru rapora eklenmez.','Finding scope: source type “audit” and source reference exactly matching this audit ID or one of its requirement IDs/codes. Free text and shared control references are not matched. File bytes and live readiness scores are excluded.')}</p>
      <div className="asr-actions"><button disabled={busy} onClick={()=>void load()}>{source?t('Önizlemeyi yeniden yükle','Reload report preview'):t('Yeni raporu incele','Preview new report')}</button><button disabled={busy} onClick={()=>setRefresh(v=>v+1)}>{t('Rapor geçmişini yenile','Refresh report history')}</button></div>
      {busy&&<p role="status">{t('Rapor hazırlanıyor…','Preparing report…')}</p>}
      {error&&<p role="alert">{(messages[error]||messages.unavailable)[tr?0:1]}</p>}
      {source&&<div className="asr-preview"><h4>{t('Yeni rapor önizlemesi','New report preview')}</h4><div className="asr-source" inert={busy}><ReportSource source={source} tr={tr}/></div>
        <fieldset disabled={busy}><div className="asr-field"><label htmlFor={`${formId}-title`}>{t('Rapor başlığı','Report title')}</label><input id={`${formId}-title`} value={title} minLength={3} maxLength={200} onChange={e=>setTitle(e.target.value)}/></div><div className="asr-field"><label htmlFor={`${formId}-summary`}>{t('Hazırlayanın özeti','Preparer summary')}</label><textarea id={`${formId}-summary`} rows={3} minLength={10} maxLength={4000} value={summary} onChange={e=>setSummary(e.target.value)}/></div><div className="asr-field"><label htmlFor={`${formId}-limitations`}>{t('Kısıtlar ve notlar (isteğe bağlı)','Limitations and notes (optional)')}</label><textarea id={`${formId}-limitations`} rows={2} maxLength={4000} value={limitations} onChange={e=>setLimitations(e.target.value)}/></div></fieldset>
        <p>{t('Yalnız kaydedilmiş plan ve kayıtlar alınır. Açık talepler ve sonuçlanmamış maddeler raporda açıkça gösterilir.','Only saved plans and records are included. Outstanding requests and unfinished requirements remain visible in the report.')}</p>
        <button disabled={busy||!valid||title.trim().length<3||summary.trim().length<10} onClick={()=>void save()}>{t('Raporu sakla','Save report snapshot')}</button>
      </div>}
      <details className="asr-history"><summary>{t('Saklanan raporlar','Saved reports')}</summary>
        {historyError?<p role="alert">{t('Rapor geçmişi yüklenemedi. Yenile ile tekrar deneyin.','Report history could not be loaded. Refresh to retry.')}</p>:!history?<p>{t('Yükleniyor…','Loading…')}</p>:<>{!history.complete&&<p>{t('En son 20 rapor gösteriliyor.','Showing the latest 20 reports.')}</p>}{!history.reports.length&&<p>{t('Henüz rapor yok.','No reports yet.')}</p>}<ol>{history.reports.map(r=><li key={r.id}><button disabled={busy} onClick={()=>void load(r.id)}>{r.title}</button><small>{r.createdBy} · {new Date(r.createdAt).toLocaleString(tr?'tr-TR':'en-GB')} · {r.itemCount} {t('kayıt','records')}</small></li>)}</ol></>}
      </details>
      {detail&&<div className="asr-saved"><h4>{detail.snapshot.title}</h4><p>{detail.snapshot.createdBy} · {detail.snapshot.createdAt}</p><p className="asr-narrative">{detail.snapshot.summary}</p>{detail.snapshot.limitations&&<p className="asr-narrative"><b>{t('Kısıtlar ve notlar','Limitations and notes')}: </b>{detail.snapshot.limitations}</p>}
        <p role="status">{detail.integrity==='verified'?t('Saklanan raporun SHA-256 özeti doğrulandı.','Saved report SHA-256 verified.'):messages.integrity[tr?0:1]}</p>
        {detail.integrity==='verified'&&<ReportSource source={detail.snapshot} tr={tr}/>}
        <div className="asr-actions">{(['html','pdf','csv']as const).map(format=><button key={format} disabled={busy||detail.integrity!=='verified'} onClick={()=>void exportReport(format)}>{format.toUpperCase()} {t('indir','download')}</button>)}{detail.integrity==='verified'&&<a href={withBasePath(`${endpoint}&reportId=${encodeURIComponent(detail.snapshot.id)}&download=1`)}>JSON {t('indir','download')}</a>}</div>
        <details><summary>{t('Rapor kimliği ve özeti','Report identity and digest')}</summary><small>{detail.snapshot.id}<br/>SHA-256 {detail.sha256}</small></details>
      </div>}
    </div>}
  </section>;
}
export function ReportSource({source,tr}:{source:AuditReportSource;tr:boolean}){
  const n=auditReportSummary(source.items),t=(a:string,b:string)=>tr?a:b;
  return <><p><b>{source.audit.name}</b> · {source.audit.template}</p><div className="asr-metrics"><p><b>{n.requirements}</b> {t('madde','requirements')}<small>{n.unfinishedRequirements} {t('sonuçlanmamış','unfinished')}</small></p><p><b>{n.requests}</b> {t('talep','requests')}<small>{n.outstandingRequests} {t('açık','outstanding')} · {n.acceptedRequests} {t('kabul','accepted')} · {n.cancelledRequests} {t('iptal','cancelled')}</small></p><p><b>{n.findings}</b> {t('bağlı bulgu','linked findings')}<small>{n.unresolvedFindings} {t('kapatılmamış','not closed')}</small></p></div>
    <details className="asr-plan"><summary>{t('Kayıtlı plan ve kapsam','Saved plan and scope')}</summary><dl>{Object.entries(source.plan.plan).map(([key,value])=><div key={key}><dt>{auditPlanLabels[key as keyof typeof auditPlanLabels]?.[tr?0:1]||key}</dt><dd>{value||'—'}</dd></div>)}</dl></details>
    <ReportItems key={`${source.sourceRevision}:${source.audit.id}`} items={source.items} tr={tr}/></>;
}
function ReportItems({items,tr}:{items:AuditReportItem[];tr:boolean}){
  const filterId=useId();
  const [kind,setKind]=useState('all'),[page,setPage]=useState(0),filtered=items.filter(i=>kind==='all'||i.kind===kind),pages=Math.max(1,Math.ceil(filtered.length/20)),index=Math.min(page,pages-1),t=(a:string,b:string)=>tr?a:b;
  const label=(k:string)=>k==='requirement'?t('Madde','Requirement'):k==='request'?t('Talep','Request'):k==='workpaper'?t('Çalışma kâğıdı','Workpaper'):t('Bulgu','Finding');
  const status=(i:AuditReportItem)=>i.kind==='workpaper'?workpaperStatusLabels[String(i.record.data.status) as keyof typeof workpaperStatusLabels]?.[tr?0:1]||String(i.record.data.status):i.kind==='request'?requestStatusLabels[String(i.record.data.status) as keyof typeof requestStatusLabels]?.[tr?0:1]||String(i.record.data.status):i.kind==='finding'?findingLabel(String(i.record.data.status),tr?'tr':'en'):tr?String(i.record.data.status):({'Başlanmadı':'Not started','Devam Ediyor':'In progress','İncelemede':'In review','Kapatıldı':'Closed'}[String(i.record.data.status)]||String(i.record.data.status));
  return <details className="asr-items"><summary>{t('Rapora dahil kayıtlar','Included report records')} · {items.length}</summary>
    <div className="asr-field"><label htmlFor={filterId}>{t('Kayıt türü','Record type')}</label><select id={filterId} value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="all">{t('Tümü','All')}</option>{['requirement','request','finding','workpaper'].map(k=><option key={k} value={k}>{label(k)}</option>)}</select></div>
    <ul>{filtered.slice(index*20,index*20+20).map(i=><li key={`${i.kind}:${i.id}`}><b>{label(i.kind)} · {String(i.record.data.title||i.record.data.requirementTitle||i.id)}</b><span>{status(i)} · {String(i.record.data.owner||'—')}</span><small>{i.record.code||i.id} · {String(i.record.data.dueDate||'—')}</small>{Boolean(i.record.data.note)&&<p>{String(i.record.data.note)}</p>}</li>)}</ul>
    {!filtered.length&&<p>{t('Bu kapsamda kayıt yok.','No records in this scope.')}</p>}
    <div className="asr-actions"><button disabled={index===0} onClick={()=>setPage(index-1)}>{t('Önceki','Previous')}</button><span>{index+1} / {pages} · {filtered.length} {t('kayıt','records')}</span><button disabled={index>=pages-1} onClick={()=>setPage(index+1)}>{t('Sonraki','Next')}</button></div>
  </details>;
}
