"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import type { AuditPortfolioItem } from './audit-portfolio-workspace';

type Preview={canDelete:boolean;requirementCount:number;blockers:{kind:string;count:number;label:string;labelEn:string;section:string}[]};
export function AuditActions({audit,lang,onDelete,onChanged,onSection}:{audit:AuditPortfolioItem;lang:'tr'|'en';onDelete:(audit:AuditPortfolioItem)=>Promise<boolean|void>|void;onChanged:()=>Promise<unknown>|void;onSection?:(section:string)=>void}) {
  const tr=lang==='tr', t=(a:string,b:string)=>tr?a:b, title=useId();
  const [open,setOpen]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
  useEffect(()=>{if(open){dialog.current?.showModal();}else{dialog.current?.close();}},[open]);
  function close(){if(lock.current||busy)return;setOpen(false);trigger.current?.focus();}
  async function inspect(){setOpen(true);setPreview(null);setError('');setConfirmed(false);setBusy(true);
    try{const response=await fetch(withBasePath(`/api/audits?action=delete-preview&id=${encodeURIComponent(audit.id)}`),{cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok||typeof data.canDelete!=='boolean'||!Array.isArray(data.blockers))throw new Error();setPreview(data);}
    catch{setError(t('Bağlantılar kontrol edilemedi. Silme açılmadı; yeniden deneyin.','Dependencies could not be checked. Deletion is unavailable; retry.'));}finally{setBusy(false);}
  }
  async function archive(){if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const response=await fetch(withBasePath('/api/audits'),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:audit.id,action:audit.archived?'restore':'archive',expectedRevision:audit.portfolioRevision||''}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();await onChanged();setOpen(false);trigger.current?.focus();}
    catch{setError(t('İşlem doğrulanamadı. Portföyü yenileyip tekrar kontrol edin.','The outcome could not be confirmed. Refresh the portfolio and check again.'));}finally{lock.current=false;setBusy(false);}
  }
  return <><button type="button" className="ghost audit-actions-trigger" ref={trigger} onClick={()=>void inspect()}>{t('Denetim işlemleri','Audit actions')}</button>
    <dialog ref={dialog} className="audit-action-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <header><h3 id={title}>{t('Denetim işlemleri','Audit actions')}</h3><button type="button" disabled={busy} onClick={close}>{t('Kapat','Close')}</button></header><h4>{audit.name}</h4>
      <p>{t('Arşiv, portföy düzenidir. Kayıtları ve bağlantıları korur; denetimin kapanış veya onay durumunu değiştirmez.','The archive organizes the portfolio. Records and links are retained; audit closure and approval do not change.')}</p>
      <button type="button" disabled={busy} onClick={()=>void archive()}>{audit.archived?t('Portföye geri al','Restore to portfolio'):t('Portföyde arşivle','Archive in portfolio')}</button>
      <hr/><h4>{t('Denetimi sil','Delete audit')}</h4>
      {busy&&<p role="status">{t('İşlem sürüyor…','Working…')}</p>}{error&&<p role="alert">{error}</p>}
      {!preview&&!busy&&<button type="button" onClick={()=>void inspect()}>{t('Yeniden kontrol et','Check again')}</button>}
      {preview&&<><p>{preview.requirementCount} {t('denetim maddesi bu denetime bağlı.','requirements belong to this audit.')}</p>
        {preview.blockers.length>0&&<><p>{t('Aşağıdaki kayıtlar silmeyi engelliyor. Geçmişi korumak için denetimi arşivleyebilirsiniz.','These records prevent deletion. Archive the audit to retain its history.')}</p><ul>{preview.blockers.map(b=><li key={b.kind}><span>{tr?b.label:b.labelEn}{b.count>0?` (${b.count})`:''}</span>{onSection&&<button type="button" onClick={()=>{close();onSection(b.section);}}>{t('İncele','Review')}</button>}</li>)}</ul></>}
        {audit.closure_state==='closed'&&<p>{t('Kapalı denetim silinemez. Kapanış geçmişi korunur.','A closed audit cannot be deleted. Closure history is retained.')}</p>}
        {preview.canDelete&&audit.closure_state!=='closed'&&<label className="audit-delete-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('Denetimin ve maddelerinin kaldırılacağını anladım. Yönetici silme kaydı korunur.','I understand that the audit and its requirements will be removed. An administrator deletion record is retained.')}</label>}
        <button type="button" className="danger" disabled={busy||!confirmed||!preview.canDelete||audit.closure_state==='closed'} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{const result=await onDelete(audit);if(result!==false)setOpen(false);else{setPreview(null);setConfirmed(false);setError(t('Silme tamamlanmadı. Bağlantıları yeniden kontrol edin.','Deletion did not complete. Check dependencies again.'));}}finally{lock.current=false;setBusy(false);trigger.current?.focus();}}}>{t('Denetimi Sil','Delete Audit')}</button>
      </>}
    </dialog>
  </>;
}
