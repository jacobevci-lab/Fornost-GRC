'use client';
import {useChoices} from './workflow-selection-fields';
import type {AuditPortfolioItem} from './audit-portfolio-workspace';

export function AuditPortfolioMetrics({audits,readiness,lang}:{audits:AuditPortfolioItem[];readiness:number|null;lang:'tr'|'en'}) {
  const {data,error,retry}=useChoices<{pbc:number|null;findings:number|null}>('/api/audits?view=metrics');
  const tr=lang==='tr';
  return <div className="audit-portfolio-kpis">
    <section><span>{tr?'Aktif Denetim':'Active audits'}</span><strong>{audits.filter(a=>!a.archived && a.closure_state!=='closed').length}</strong></section>
    <section><span>{tr?'Genel Kanıt Hazırlığı (%)':'Overall evidence readiness (%)'}</span><strong>{readiness===null?'—':readiness+'%'}</strong></section>
    <section><span>{tr?'Açık Kanıt Talepleri (PBC)':'Open evidence requests (PBC)'}</span><strong>{data.pbc??'—'}</strong></section>
    <section><span>{tr?'Açık Denetim Bulgusu':'Open audit findings'}</span><strong>{data.findings??'—'}</strong></section>
    {error&&<button type="button" onClick={retry}>{tr?'Sayaçları yeniden yükle':'Retry counts'}</button>}
  </div>;
}
