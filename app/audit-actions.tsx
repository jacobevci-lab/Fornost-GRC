"use client";
import { useEffect, useRef, useState } from 'react';
import type { AuditPortfolioItem } from './audit-portfolio-workspace';
import type { AuditRemovalPreview } from './audit-management';
import { auditTypes } from './audit-engagement';
import { AuditTeamFields } from './audit-team-fields';
import { withBasePath } from './base-path';
import { navigateToFornost } from './navigation-focus';
import './audit-workspace-desk.css';

const dependencyNames:Record<string,[string,string]>={
 record_links:['Bağlı kayıt referansları','Linked record references'],enterprise_findings:['Bulgu / CAPA referansları','Finding / CAPA references'],regulatory_change_impacts:['Regülasyon etki referansları','Regulatory impact references'],
 audit_requests:['Kanıt talepleri','Evidence requests'],audit_request_events:['Talep geçmişi','Request history'],audit_request_workflows:['Talep iş akışı','Request workflow'],audit_reminder_profiles:['Hatırlatma takvimi','Reminder calendar'],
 audit_workpapers:['Çalışma kâğıtları','Workpapers'],audit_workpaper_events:['Test ve inceleme geçmişi','Test and review history'],audit_milestones:['Plan görevleri','Plan tasks'],audit_milestone_events:['Görev geçmişi','Task history'],
 audit_workplan_closures:['İş planı kapanışları','Work plan closures'],audit_workplan_closure_items:['Kapanışa sabitlenen talepler','Pinned closure requests'],audit_workplan_events:['İş planı geçmişi','Work plan history'],
 audit_closure_state:['Kapanış durumu','Closure state'],audit_closure_events:['Denetim karar geçmişi','Audit decision history'],audit_status_reports:['Durum raporları','Status reports'],
};
export function AuditActions({audit,lang,canWrite,canDelete,onDelete,onChanged}:{audit:AuditPortfolioItem;lang:'tr'|'en';canWrite:boolean;canDelete:boolean;onDelete:(audit:AuditPortfolioItem)=>Promise<void>;onChanged:(name:string)=>Promise<unknown>}) {
 const tr=lang==='tr',t=(a:string,b:string)=>tr?a:b;
 const [mode,setMode]=useState(''),[draft,setDraft]=useState(audit),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<AuditRemovalPreview|null>(null),[retry,setRetry]=useState(0);
 const lock=useRef(false),closeButton=useRef<HTMLButtonElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{if(mode)closeButton.current?.focus();else trigger.current?.focus();},[mode]);
 useEffect(()=>{
  if(mode!=='delete')return;
  const controller=new AbortController();
  void fetch(withBasePath(`/api/audits?view=removal&id=${encodeURIComponent(audit.id)}`),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(async r=>{const body=await r.json();if(!r.ok||!Array.isArray(body.dependencies))throw new Error();if(!controller.signal.aborted)setPreview(body);}).catch(()=>{if(!controller.signal.aborted)setError(tr?'Bağlı kayıtlar yüklenemedi. Silmeden önce yeniden deneyin.':'Dependencies could not be loaded. Retry before deleting.');});
  return()=>controller.abort();
 },[audit.id,mode,retry,tr]);
 function open(value:string,button:HTMLButtonElement){trigger.current=button;setError('');setPreview(null);setDraft(audit);setMode(value);}
 async function save(action:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const response=await fetch(withBasePath('/api/audits'),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:draft.name,audit_type:draft.audit_type,auditor:draft.auditor,audit_owner:draft.audit_owner,id:audit.id,action,expectedUpdatedAt:audit.updated_at,expectedVisibilityRevision:audit.visibility_revision||''})});
   const result=await response.json();
   if(!response.ok){const labels:Record<string,string>={conflict:t('Denetim değişti. Portföyü yenileyip tekrar deneyin.','The audit changed. Refresh the portfolio and retry.'),'audit-closed':t('Denetim kapalı. Düzenlemek için gerekçeyle yeniden açın.','The audit is closed. Reopen it with a reason before editing.'),duplicate:t('Bu denetim adı kullanılıyor.','This audit name is already used.')};throw new Error(labels[result.error]||t('Alanları ve yetkinizi kontrol edin.','Check the fields and your permissions.'));}
   await onChanged(action==='edit'?draft.name:audit.name);setMode('');
  }catch(e){setError(e instanceof Error?e.message:t('İşlem doğrulanamadı. Portföyü yenileyin.','The outcome could not be confirmed. Refresh the portfolio.'));}finally{lock.current=false;setBusy(false);}
 }
 return <section className="audit-actions-desk" aria-label={t('Denetim işlemleri','Audit actions')}>
  <div className="actions">
   {canWrite&&<button type="button" className="ghost" disabled={audit.closure_state==='closed'} onClick={e=>open('edit',e.currentTarget)}>{t('Denetimi düzenle','Edit audit')}</button>}
   {canDelete&&<><button type="button" className="ghost" onClick={e=>open('archive',e.currentTarget)}>{audit.archived?t('Arşivden çıkar','Restore audit'):t('Arşivle','Archive')}</button><button type="button" className="ghost" onClick={e=>open('delete',e.currentTarget)}>{t('Denetimi Sil','Delete Audit')}</button></>}
  </div>
  {mode&&<section className="audit-action-panel" onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();setMode('');}}}>
   <header><h3>{mode==='edit'?t('Denetim bilgileri','Audit details'):mode==='delete'?t('Silme öncesi kontrol','Before deleting'):t('Portföy görünürlüğü','Portfolio visibility')}</h3><button ref={closeButton} type="button" disabled={busy} onClick={()=>setMode('')}>{t('Kapat','Close')} ×</button></header>
   {error&&<p role="alert">{error}</p>}
   {mode==='edit'&&<form onSubmit={e=>{e.preventDefault();void save('edit');}}><fieldset disabled={busy}><label>{t('Denetim adı','Audit name')}<input required minLength={3} maxLength={160} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>{t('Denetim türü','Audit type')}<select aria-label={t('Denetim türü','Audit type')} value={draft.audit_type} onChange={e=>setDraft({...draft,audit_type:e.target.value})}>{!auditTypes.some(([v])=>v===draft.audit_type)&&<option>{draft.audit_type}</option>}{auditTypes.map(([v,en])=><option key={v} value={v}>{tr?v:en}</option>)}</select></label>
   <AuditTeamFields tr={tr} owner={draft.audit_owner} team={draft.auditor} onOwner={audit_owner=>setDraft({...draft,audit_owner})} onTeam={auditor=>setDraft({...draft,auditor})}/><button className="primary">{busy?t('Kaydediliyor…','Saving…'):t('Kaydet','Save')}</button></fieldset></form>}
   {mode==='archive'&&<><p>{t('Arşivleme denetimi aktif portföyden ayırır. Kayıtlar, açık görevler, hatırlatmalar ve geçmiş korunur; denetimi kapatmaz.','Archiving separates the audit from the active portfolio. Records, open tasks, reminders and history remain; it does not close the audit.')}</p><button type="button" className="primary" disabled={busy} onClick={()=>void save(audit.archived?'restore':'archive')}>{audit.archived?t('Arşivden çıkar','Restore audit'):t('Arşivlemeyi onayla','Confirm archive')}</button></>}
   {mode==='delete'&&<>{!preview&&!error&&<p role="status">{t('Bağlantılar kontrol ediliyor…','Checking dependencies…')}</p>}{error&&<button onClick={()=>{setError('');setPreview(null);setRetry(v=>v+1);}}>{t('Yeniden dene','Retry')}</button>}{preview&&<><p>{preview.blocked?t('Bağlı kayıtlar ve geçmiş nedeniyle silme engellendi. İlgili çalışma alanını açabilir veya denetimi arşivleyebilirsiniz.','Linked records and history prevent deletion. Open the relevant work area or archive the audit.'):t('Bağlı iş kaydı bulunmadı. Denetim ve maddeleri silinebilir; silinen kopya yönetici arşivinde korunur.','No linked work records were found. The audit and its requirements can be deleted; a copy is retained in the administrator archive.')}</p><p>{t('Denetim maddesi','Requirements')}: <b>{preview.requirements}</b></p><ul>{preview.dependencies.map((d,i)=><li key={d.key+i}><span>{dependencyNames[d.key]?.[tr?0:1]||t('Bağlı kayıt','Linked record')}: <b>{d.count}</b></span><button type="button" onClick={()=>{setMode('');navigateToFornost({module:d.key==='regulatory_change_impacts'?'Regülasyon Merkezi':'Denetim Yönetimi',kind:'audit-area',ref:audit.id,filter:{area:d.area},source:'audit-removal'});}}>{t('İncele','Review')} →</button></li>)}</ul>{preview.blocked?<button type="button" onClick={()=>setMode('archive')}>{t('Arşivleme seçeneği','Archive option')}</button>:<button className="danger" type="button" disabled={busy||audit.closure_state==='closed'} onClick={async()=>{setBusy(true);try{await onDelete(audit);setMode('');}finally{setBusy(false);}}}>{t('Silme onayına geç','Continue to delete confirmation')}</button>}</>}</>}
  </section>}
 </section>;
}
