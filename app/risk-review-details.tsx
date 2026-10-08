"use client";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { riskDecisionContext } from './risk-review-runtime';

export type RiskContext = NonNullable<ReturnType<typeof riskDecisionContext>>;
export type RiskReview = { id:string; riskId:string; status:string; proposal:Record<string,unknown>; currentRisk:RiskContext|null; approvalBlocker:string|null; submittedBy:string; submittedAt:string; reviewedBy:string; reviewedAt:string; reviewNote:string };
export const riskReviewBlockerText:Record<string,{tr:string;en:string}> = {
  'baseline-missing': {tr:'Bu eski teklif risk sürümüne bağlı değil. Reddedip güncel riskten yeni teklif oluşturun.',en:'This legacy proposal has no risk version. Reject it and submit a new proposal from the current risk.'},
  'risk-changed': {tr:'Tekliften sonra risk değişti. Güncel bilgilerle yeni bir teklif gerekli.',en:'The risk changed after submission. A new proposal based on current information is required.'},
  'risk-missing': {tr:'Bağlı risk kaydı artık mevcut değil.',en:'The linked risk no longer exists.'},
  'risk-invalid': {tr:'Bağlı risk verisi okunamıyor.',en:'The linked risk data cannot be read.'},
  'proposal-invalid': {tr:'Teklif verisi geçersiz. Reddedip yeniden oluşturun.',en:'The proposal is invalid. Reject it and submit a new one.'},
  'review-not-required': {tr:'Bu risk için artık yeniden değerlendirme beklenmiyor.',en:'This risk no longer requires reassessment.'},
};
const value = (input:unknown) => input === null || input === undefined || input === '' ? '—' : String(input);
export function RiskRating({context,label}:{context:Pick<RiskContext,'residualLikelihood'|'residualImpact'>|null;label:string}) {
  return <article><small>{label}</small><b>{context?.residualLikelihood && context?.residualImpact ? `${context.residualLikelihood} × ${context.residualImpact} = ${context.residualLikelihood * context.residualImpact}` : '—'}</b></article>;
}
export default function RiskReviewDetails({review,lang,canDecide,own,busy,message,onClose,onDecide}:{review:RiskReview;lang:'tr'|'en';canDecide:boolean;own:boolean;busy:boolean;message:string;onClose:()=>void;onDecide:(decision:'approve'|'reject',note:string)=>Promise<void>}) {
  const tr=lang==='tr',ref=useRef<HTMLElement>(null),[note,setNote]=useState('');
  const close=useRef(onClose);
  const busyRef=useRef(busy);
  useEffect(()=>{close.current=onClose;busyRef.current=busy;},[onClose,busy]);
  useEffect(()=>{
    const prior=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';ref.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busyRef.current){event.preventDefault();close.current();}
      if(event.key!=='Tab')return;
      const items=[...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,a[href],[tabindex="0"]')];
      const first=items[0],last=items.at(-1);if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;prior?.focus({preventScroll:true});};
  },[]);
  const baseline=review.proposal.baseline as {context?:RiskContext}|undefined;
  const proposed={residualLikelihood:Number(review.proposal.residualLikelihood)||null,residualImpact:Number(review.proposal.residualImpact)||null};
  const pending=review.status==='pending-review',blocked=review.approvalBlocker;
  const title=review.currentRisk?.title||baseline?.context?.title||review.riskId;
  return createPortal(<div className="ag-overlay"><section data-escape-layer ref={ref} tabIndex={-1} className="ag-dialog ag-risk-decision" role="dialog" aria-modal="true" aria-label={tr?'Risk teklifini incele':'Review risk proposal'}>
    <header><div><small>{tr?'BAĞIMSIZ RİSK KARARI':'INDEPENDENT RISK DECISION'}</small><h4>{title}</h4><p>{value(review.currentRisk?.reference||baseline?.context?.reference)} · {review.submittedBy} · {new Date(review.submittedAt).toLocaleString(tr?'tr-TR':'en-GB')}</p></div><button data-escape-close type="button" disabled={busy} onClick={onClose} aria-label={tr?'Kapat':'Close'}>×</button></header>
    <div className="ag-rating-comparison"><RiskRating context={baseline?.context||null} label={tr?'Teklif hazırlanırken':'At submission'}/><RiskRating context={proposed} label={tr?'Önerilen artık risk':'Proposed residual risk'}/></div>
    {blocked&&<div className="ag-notice" role="alert">{riskReviewBlockerText[blocked]?.[lang]||(tr?'Teklif doğrulanamadı.':'The proposal could not be verified.')}</div>}
    {blocked==='risk-changed'&&<RiskRating context={review.currentRisk} label={tr?'Güncel risk kaydı':'Current risk record'}/>}
    <dl className="ag-decision-context">
      <dt>{tr?'Risk sahibi / varlık':'Risk owner / asset'}</dt><dd>{value(review.currentRisk?.owner||baseline?.context?.owner)} · {value(review.currentRisk?.asset||baseline?.context?.asset)}</dd>
      <dt>{tr?'Değerlendirme nedeni':'Reassessment reason'}</dt><dd>{value(review.currentRisk?.reason||baseline?.context?.reason)}</dd>
      <dt>{tr?'Son kontrol koşumu':'Latest control run'}</dt><dd>{value(review.currentRisk?.lastAssuranceRunRef||baseline?.context?.lastAssuranceRunRef)}</dd>
      <dt>{tr?'Teklif gerekçesi':'Proposal rationale'}</dt><dd>{value(review.proposal.rationale)}</dd>
      <dt>{tr?'Kanıt referansı':'Evidence reference'}</dt><dd>{value(review.proposal.evidenceReference)}</dd>
      <dt>{tr?'Beyan edilen SHA-256':'Declared SHA-256'}</dt><dd><code>{value(review.proposal.evidenceSha256)}</code></dd>
    </dl>
    <p className="ag-hint">{tr?'Karar vermeden önce referans verilen kanıtı inceleyin. Bu ekrandaki özet, dosya içeriğinin doğrulandığı anlamına gelmez.':'Inspect the referenced evidence before deciding. This summary does not verify the file contents.'}</p>
    {own&&pending&&<p className="ag-notice">{tr?'Kendi teklifini sonuçlandıramazsın; başka bir yönetici incelemeli.':'Another administrator must decide on your proposal.'}</p>}
    {!pending&&<p className="ag-hint">{review.status==='approved'?(tr?'Onaylandı':'Approved'):(tr?'Reddedildi':'Rejected')} · {review.reviewedBy} · {review.reviewNote}</p>}
    {pending&&canDecide&&!own&&<label>{tr?'İnceleme notu (ret için en az 10 karakter)':'Review note (at least 10 characters for rejection)'}<textarea maxLength={1200} value={note} onChange={event=>setNote(event.target.value)} disabled={busy}/></label>}
    {message&&<p className="ag-notice" role="status">{message}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>{tr?'Kapat':'Close'}</button>{pending&&canDecide&&!own&&<><button type="button" className="reject" disabled={busy||note.trim().length<10} onClick={()=>void onDecide('reject',note)}>{tr?'Reddet':'Reject'}</button><button type="button" className="approve" disabled={busy||!!blocked} onClick={()=>void onDecide('approve',note)}>{tr?'Onayla':'Approve'}</button></>}</footer>
  </section></div>,document.body);
}
