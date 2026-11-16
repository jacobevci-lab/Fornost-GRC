"use client";
import { useEffect, useRef, useState } from 'react';
import { AuditRequestPanel } from './audit-request-panel';
import { AuditWorkpaperPanel } from './audit-workpaper-panel';
import { WorkspaceTabs } from './workspace-tabs';
import { EvidenceDocumentPreview } from './evidence-document-preview';
import { auditRequirementDeadline } from './audit-overdue-requirements';
import { CurrentRecordTrail } from './module-record-trail-view';
import { auditBoardLane } from './audit-workspace-state';
type Item={id:string;code?:string;module:string;data:Record<string,unknown>;created_at?:string;updated_at?:string};
export function AuditRequirementDesk({row,auditId,evidence,lang,canWrite,onEdit,onClose}:{row:Item;auditId:string;evidence:Item[];lang:'tr'|'en';canWrite:boolean;onEdit:()=>void;onClose:()=>void}) {
 const tr=lang==='tr',t=(a:string,b:string)=>tr?a:b,[tab,setTab]=useState('assignment'),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 const d=row.data,title=String(d.requirementTitle||d.title||d.requirementRef||row.code||row.id);
 const refs=String(d.evidenceRef||'').split(/[;,|\n]/).map(v=>v.trim().toLowerCase());
 const linked=evidence.filter(e=>refs.includes(e.id.toLowerCase())||!!e.code&&refs.includes(e.code.toLowerCase()));
 const val=(v:unknown)=>String(v||t('Belirtilmedi','Not specified'));
 return <section className="audit-item-desk" role="region" aria-label={t('Madde çalışma alanı','Requirement workspace')} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header><div><small>{val(d.requirementRef)}</small><h3>{title}</h3></div><button ref={close} type="button" onClick={onClose}>{t('Maddeyi kapat','Close requirement')} ×</button></header>
  <div className="audit-item-states"><span>{t('Kanıt','Evidence')}: <b>{val(d.evidenceStatus)}</b></span><span>{t('Madde','Requirement')}: <b>{val(d.status)}</b></span><span>{t('Denetçi sonucu','Auditor result')}: <b>{val(d.auditorResult)}</b></span></div>
  <WorkspaceTabs label={t('Madde adımları','Requirement steps')} active={tab} onChange={setTab} items={[
   {key:'assignment',label:t('1 · Sorumlu ve termin','1 · Owner and deadline'),content:<div className="audit-item-context"><p>{val(d.requirementStatement||d.expectedEvidence||d.requirementGuidance)}</p><dl><div><dt>{t('Sorumlu','Owner')}</dt><dd>{val(d.owner)}</dd></div><div><dt>{t('Termin','Due date')}</dt><dd>{val(auditRequirementDeadline(d))}</dd></div><div><dt>{t('Test yaklaşımı','Test approach')}</dt><dd>{val(d.typeIITestApproach||d.requirementAssessment)}</dd></div></dl>{canWrite&&<button type="button" className="primary" onClick={onEdit}>{t('Maddeyi düzenle','Edit requirement')}</button>}<button type="button" onClick={()=>{window.dispatchEvent(new CustomEvent('fornost:open-ai',{detail:{module:'Denetim Yönetimi',prompt:tr?`Denetim maddesi ${row.id} (${title}) için erişebildiğim kayıtları kaynak göstererek uygun kanıt adaylarını ve test taslağını öner. Eksik kaynakları açıkla. Kabul veya onay kararı verme.`:`For audit requirement ${row.id} (${title}), cite accessible records and suggest evidence candidates and a test draft. Explain missing sources. Do not accept or approve.`}}));}}>{t('AI ile kaynaklı taslak hazırla','Prepare a sourced draft with AI')}</button><p className="fw-muted">{t('AI önerisi kullanıcı incelemesine sunulur. Kanıt yüklemek veya maddeyi kapatmak bağımsız onay yerine geçmez.','AI suggestions require user review. Uploading evidence or closing a requirement does not replace independent approval.')}</p></div>},
   {key:'evidence',label:t('2 · Kanıt ve talepler','2 · Evidence and requests'),content:<><h4>{t('Bağlı kanıtlar','Linked evidence')}</h4>{linked.length?linked.map(e=><details key={e.id}><summary>{val(e.data.evidenceTitle||e.code)}</summary><EvidenceDocumentPreview fileKey={String(e.data.fileKey||'')} fileName={String(e.data.fileName||'')} title={val(e.data.evidenceTitle)} lang={lang}/></details>):<p>{t('Bu maddede erişilebilir bir kanıt bağlantısı yok. Kanıt ilişkisini maddeyi düzenleyerek ekleyebilirsiniz.','No accessible evidence is linked to this requirement. Add a link through Edit requirement.')}</p>}{auditId&&<AuditRequestPanel auditId={auditId} lang={lang} readOnly={!canWrite} requirementId={row.id} requirementTitle={title}/>}</>},
   {key:'test',label:t('3 · Test, inceleme ve geçmiş','3 · Test, review and history'),content:<><p>{t('Testi hazırlayan ile onaylayan farklı olmalıdır. Test sonuçları ve karar geçmişi çalışma kâğıdında tutulur.','The preparer and approver must differ. Test results and decision history are retained in the workpaper.')}</p>{auditId?<AuditWorkpaperPanel auditId={auditId} lang={lang} readOnly={!canWrite} requirementId={row.id} requirementTitle={title}/>:<p>{t('Çalışma kâğıdı için denetim bağlantısı gerekir.','Workpapers require an audit link.')}</p>}</>},
  ]}/><CurrentRecordTrail module="Denetim Yönetimi" kind="record" recordRef={row.id}/>
 </section>;
}
export function AuditRequirementBoard({items,lang,onOpen}:{items:Item[];lang:'tr'|'en';onOpen:(row:Item)=>void}) {
 const tr=lang==='tr';
 return <div className="audit-requirement-board" aria-label={tr?'Madde panosu':'Requirement board'}>{(['todo','doing','review','closed'] as const).map((lane,i)=>{const rows=items.filter(r=>auditBoardLane(r.data)===lane);return <section key={lane}><h4>{(tr?['Başlanacak','Çalışılıyor','İnceleme','Kapalı']:['To do','In progress','Review','Closed'])[i]} <span>{rows.length}</span></h4>{rows.map(row=><button type="button" key={row.id} onClick={()=>onOpen(row)}><small>{String(row.data.requirementRef||row.code||'')}</small><b>{String(row.data.requirementTitle||row.data.title||row.id)}</b><span>{String(row.data.owner||(tr?'Sorumlu atanmadı':'Unassigned'))}</span><small>{auditRequirementDeadline(row.data)||'—'}</small></button>)}{!rows.length&&<p>{tr?'Bu aşamada madde yok.':'No requirements in this stage.'}</p>}</section>;})}</div>;
}
