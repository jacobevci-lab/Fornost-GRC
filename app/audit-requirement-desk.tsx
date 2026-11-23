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
type InheritedControl={id:string;code:string;title:string;owner?:string};
type RequirementDeskProps = {
 inheritedControls?:InheritedControl[]; inheritedEvidence?:import('./framework-posture/types').Pin[]; baselineUnavailable?:boolean;
 row: Item;
 auditId: string;
 evidence: Item[];
 lang: 'tr' | 'en';
 canWrite: boolean;
 position: number;
 total: number;
 onEdit: () => void;
 onClose: () => void;
 onPrevious: () => void;
 onNext: () => void;
};
export function AuditRequirementDesk({row,auditId,evidence,inheritedControls=[],inheritedEvidence=[],baselineUnavailable=false,lang,canWrite,position,total,onEdit,onClose,onPrevious,onNext}: RequirementDeskProps) {
 const tr=lang==='tr',t=(a:string,b:string)=>tr?a:b,[tab,setTab]=useState('assignment');
 const desk = useRef<HTMLElement>(null);
 const close = useRef<HTMLButtonElement>(null);
 useEffect(() => {
   const active = document.activeElement;
   if (!desk.current?.contains(active) || active?.matches(':disabled')) close.current?.focus();
   if (desk.current) desk.current.scrollTop = 0;
 }, [row.id]);
 const d=row.data,title=String(d.requirementTitle||d.title||d.requirementRef||row.code||row.id);
 const refs=String(d.evidenceRef||'').split(/[;,|\n]/).map(v=>v.trim().toLowerCase());
 const linked=evidence.filter(e=>refs.includes(e.id.toLowerCase())||!!e.code&&refs.includes(e.code.toLowerCase()));
 const val=(v:unknown)=>String(v||t('Belirtilmedi','Not specified'));
 return <section ref={desk} className="audit-item-desk" role="region" aria-label={t('Madde çalışma alanı','Requirement workspace')} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header><div><small>{val(d.requirementRef)}</small><h3 aria-live="polite">{title}</h3></div><button ref={close} type="button" onClick={onClose}>{t('Maddeyi kapat','Close requirement')} ×</button></header>
  <div role="navigation" className="audit-item-navigation" aria-label={t('Maddeler arasında gezinme','Requirement navigation')}>
   <button type="button" disabled={position <= 1} onClick={onPrevious}>{t('Önceki madde','Previous requirement')}</button>
   <span role="status">{position} / {total}</span>
   <button type="button" disabled={position >= total} onClick={onNext}>{t('Sonraki madde','Next requirement')}</button>
  </div>
  <div className="audit-item-states"><span>{t('Kanıt','Evidence')}: <b>{val(d.evidenceStatus)}</b></span><span>{t('Madde','Requirement')}: <b>{val(d.status)}</b></span><span>{t('Denetçi sonucu','Auditor result')}: <b>{val(d.auditorResult)}</b></span></div>
  {(inheritedControls.length>0||baselineUnavailable)&&<section className="audit-inheritance"><h4>{t('Devralınan kontroller ve onaylı dönem kanıtları','Inherited controls and approved period evidence')}</h4>{baselineUnavailable?<p>—</p>:<><p>{inheritedControls.map(c=>[c.code===c.id?'':c.code,c.title].filter(Boolean).join(' · ')).join(', ')}</p>{inheritedEvidence.length?inheritedEvidence.map(p=><p key={p.id}><b>{p.code||'—'}</b> · {p.title} · v{p.version}</p>):<p>{t('Bu madde için dönem kanıtı devralınmadı.','No period evidence was inherited for this requirement.')}</p>}</>}</section>}
  {canWrite&&auditId&&<div className="actions"><button type="button" onClick={()=>setTab('evidence')}>{t('Kanıt Talep Et (PBC)','Request evidence (PBC)')}</button><button type="button" onClick={()=>setTab('test')}>{t('Çalışma Kâğıdı / Test Sonucu','Workpaper / test result')}</button></div>}
  <WorkspaceTabs key={row.id} label={t('Madde adımları','Requirement steps')} active={tab} onChange={setTab} items={[
   {key:'assignment',label:t('1 · Sorumlu ve termin','1 · Owner and deadline'),content:<div className="audit-item-context"><p>{val(d.requirementStatement||d.expectedEvidence||d.requirementGuidance)}</p><dl><div><dt>{t('Sorumlu','Owner')}</dt><dd>{val(d.owner)}</dd></div><div><dt>{t('Termin','Due date')}</dt><dd>{val(auditRequirementDeadline(d))}</dd></div><div><dt>{t('Test yaklaşımı','Test approach')}</dt><dd>{val(d.typeIITestApproach||d.requirementAssessment)}</dd></div></dl>{canWrite&&<button type="button" className="primary" onClick={onEdit}>{t('Maddeyi düzenle','Edit requirement')}</button>}<button type="button" onClick={()=>{window.dispatchEvent(new CustomEvent('fornost:open-ai',{detail:{module:'Denetim Yönetimi',prompt:tr?`Denetim maddesi ${row.id} (${title}) için erişebildiğim kayıtları kaynak göstererek uygun kanıt adaylarını ve test taslağını öner. Eksik kaynakları açıkla. Kabul veya onay kararı verme.`:`For audit requirement ${row.id} (${title}), cite accessible records and suggest evidence candidates and a test draft. Explain missing sources. Do not accept or approve.`}}));}}>{t('AI ile kaynaklı taslak hazırla','Prepare a sourced draft with AI')}</button><p className="fw-muted">{t('AI önerisi kullanıcı incelemesine sunulur. Kanıt yüklemek veya maddeyi kapatmak bağımsız onay yerine geçmez.','AI suggestions require user review. Uploading evidence or closing a requirement does not replace independent approval.')}</p></div>},
   {key:'evidence',label:t('2 · Kanıt ve talepler','2 · Evidence and requests'),content:<><h4>{t('Bağlı kanıtlar','Linked evidence')}</h4>{linked.length?linked.map(e=><details key={e.id}><summary>{val(e.data.evidenceTitle||e.code)}</summary><EvidenceDocumentPreview fileKey={String(e.data.fileKey||'')} fileName={String(e.data.fileName||'')} title={val(e.data.evidenceTitle)} lang={lang}/></details>):<p>{t('Bu maddede erişilebilir bir kanıt bağlantısı yok. Kanıt ilişkisini maddeyi düzenleyerek ekleyebilirsiniz.','No accessible evidence is linked to this requirement. Add a link through Edit requirement.')}</p>}{auditId&&<AuditRequestPanel auditId={auditId} lang={lang} readOnly={!canWrite} requirementId={row.id} requirementTitle={title} suggestedOwners={inheritedControls.length?inheritedControls.map(c=>c.owner||''):[String(d.owner||'')]}/>}</>},
   {key:'test',label:t('3 · Test, inceleme ve geçmiş','3 · Test, review and history'),content:<><p>{t('Testi hazırlayan ile onaylayan farklı olmalıdır. Test sonuçları ve karar geçmişi çalışma kâğıdında tutulur.','The preparer and approver must differ. Test results and decision history are retained in the workpaper.')}</p>{auditId?<AuditWorkpaperPanel auditId={auditId} lang={lang} readOnly={!canWrite} requirementId={row.id} requirementTitle={title}/>:<p>{t('Çalışma kâğıdı için denetim bağlantısı gerekir.','Workpapers require an audit link.')}</p>}</>},
  ]}/><CurrentRecordTrail module="Denetim Yönetimi" kind="record" recordRef={row.id}/>
 </section>;
}
export function AuditRequirementBoard({items,lang,onOpen,selectedId}:{items:Item[];selectedId?:string;lang:'tr'|'en';onOpen:(row:Item)=>void}) {
 const tr=lang==='tr';
 return <div className="audit-requirement-board" aria-label={tr?'Madde panosu':'Requirement board'}>{(['todo','doing','review','closed'] as const).map((lane,i)=>{const rows=items.filter(r=>auditBoardLane(r.data)===lane);return <section key={lane}><h4>{(tr?['Başlanacak','Çalışılıyor','İnceleme','Kapalı']:['To do','In progress','Review','Closed'])[i]} <span>{rows.length}</span></h4>{rows.map(row=><button type="button" key={row.id} data-requirement-id={row.id} aria-current={row.id===selectedId ? "true" : undefined} onClick={()=>onOpen(row)}><small>{String(row.data.requirementRef||row.code||'')}</small><b>{String(row.data.requirementTitle||row.data.title||row.id)}</b><span>{String(row.data.owner||(tr?'Sorumlu atanmadı':'Unassigned'))}</span><small>{auditRequirementDeadline(row.data)||'—'}</small></button>)}{!rows.length&&<p>{tr?'Bu aşamada madde yok.':'No requirements in this stage.'}</p>}</section>;})}</div>;
}
