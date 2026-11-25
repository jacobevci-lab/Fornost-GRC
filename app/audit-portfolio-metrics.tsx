'use client';
import {useChoices} from './workflow-selection-fields';
import type {AuditItemCoverage} from './audit-evidence-assurance';
import {auditNameKey} from './audit-readiness-portfolio';
import type {AuditPortfolioItem} from './audit-portfolio-workspace';

export function AuditPortfolioMetrics({audits,coverage,lang}:{audits:AuditPortfolioItem[];coverage:AuditItemCoverage[]|null;lang:'tr'|'en'}) {
  const {data,error,retry}=useChoices<{pbc:number|null;findings:number|null}>('/api/audits?view=metrics');
  const tr=lang==='tr';
  const active = audits.filter(a => !a.archived && a.closure_state !== 'closed');
  const names = new Set(active.map(a => auditNameKey(a.name)));
  let scoped = 0, current = 0;
  for (const item of coverage ?? []) {
    if (names.has(auditNameKey(item.auditName))) {
      scoped += item.scoped;
      current += item.current;
    }
  }
  const readiness = scoped ? Math.round(100 * current / scoped) : null;
  return <div className="audit-portfolio-kpis">
    <section><span>{tr?'Aktif Denetim':'Active audits'}</span><strong>{active.length}</strong></section>
    <section title={tr?'Aktif denetimlerde güncel kanıtı olan kapsam içi maddelerin yüzdesi':'Percentage of in-scope requirements with current evidence across active audits'}><span>{tr?'Genel Kanıt Hazırlığı (%)':'Overall evidence readiness (%)'}</span><strong>{readiness===null?'—':readiness+'%'}</strong></section>
    <section><span>{tr?'Açık Kanıt Talepleri (PBC)':'Open evidence requests (PBC)'}</span><strong>{data.pbc??'—'}</strong></section>
    <section><span>{tr?'Açık Denetim Bulgusu':'Open audit findings'}</span><strong>{data.findings??'—'}</strong></section>
    {error&&<button type="button" onClick={retry}>{tr?'Sayaçları yeniden yükle':'Retry counts'}</button>}
  </div>;
}
