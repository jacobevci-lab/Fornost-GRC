'use client';
import { useState } from 'react';
import { auditPortfolioGateText, type AuditReadinessPortfolio } from './audit-readiness-portfolio';
import { readinessIssueText, type AuditReadinessIssue } from './audit-readiness';
import { navigateToFornost } from './navigation-focus';

export default function AuditReadinessPortfolioPanel({ portfolio, lang }: { portfolio?: AuditReadinessPortfolio; lang: 'tr' | 'en' }) {
  const [limit, setLimit] = useState(10), tr = lang === 'tr';
  if (!portfolio) return null;
  const labels: Record<string, string> = {
    'audits-unavailable': tr ? 'Denetim portföyü okunamadı.' : 'The audit portfolio could not be read.',
    'audits-incomplete': tr ? 'Denetim portföyü değerlendirme sınırını aşıyor.' : 'The audit portfolio exceeds the evaluation limit.',
    'audits-invalid': tr ? 'Bazı denetim kimlikleri geçersiz.' : 'Some audit identities are invalid.',
    'audit-identity-ambiguous': tr ? 'Bazı denetim adları birden fazla kapsamla eşleşiyor.' : 'Some audit names match more than one scope.',
    'orphan-requirements': tr ? `${portfolio.orphanRequirements} denetim maddesi portföydeki bir denetime bağlanamıyor.` : `${portfolio.orphanRequirements} audit items cannot be linked to a portfolio audit.`,
  };
  const issues = [...new Set([...portfolio.issues, ...portfolio.audits.flatMap(a => a.issues)])];
  return <details className="audit-readiness-portfolio">
    <summary>{tr ? 'Denetim bazında hazırlık' : 'Readiness by audit'} · {portfolio.audits.length} {tr ? 'denetim' : 'audits'}</summary>
    <p>{tr ? 'Her denetim bir kez sayılır. Hazır sonucu, güncel kanıt ve açık güvence sinyallerinden hesaplanır; denetçi görüşü veya kapanış onayı değildir.' : 'Each audit is counted once. Readiness uses current evidence and open assurance signals; it is not an audit opinion or closure approval.'}</p>
    {issues.length > 0 && <ul>{issues.map(issue => <li key={issue}>{labels[issue] || readinessIssueText[issue as AuditReadinessIssue]?.[lang] || (tr ? 'Değerlendirme tamamlanamadı.' : 'Evaluation is incomplete.')}</li>)}</ul>}
    {!portfolio.audits.length && <p>{tr ? 'Değerlendirilecek denetim yok.' : 'No audits to evaluate.'}</p>}
    <div className="audit-portfolio-rows">{portfolio.audits.slice(0, limit).map(audit => <article key={audit.id} data-audit-id={audit.id}>
      <div><b>{audit.name}</b><span>{auditPortfolioGateText[audit.gate][lang]}</span></div>
      <span>{audit.current}/{audit.requirements} {tr ? 'güncel gereksinim' : 'current requirements'}</span>
      <span>{audit.blockers} {tr ? 'engel' : 'blockers'}</span>
      <button type="button" onClick={() => navigateToFornost({ module: 'Denetim Yönetimi', kind: 'audit', ref: audit.id, source: 'executive-readiness' })}>{tr ? 'Denetimi incele' : 'Review audit'}</button>
    </article>)}</div>
    {portfolio.audits.length > limit && <button type="button" onClick={() => setLimit(count => count + 10)}>{tr ? 'Daha fazla denetim göster' : 'Show more audits'}</button>}
  </details>;
}
