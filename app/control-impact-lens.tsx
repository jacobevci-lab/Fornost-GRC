"use client";
import type { ControlAssuranceDetail } from './control-assurance';
import './control-impact-lens.css';

/** Native child of the control workspace: selection and evaluation are shared. */
export default function ControlImpactLens({ detail, lang }: { detail: ControlAssuranceDetail; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr';
  return <div className="control-impact-lens" aria-label={tr ? 'Kontrol etki özeti' : 'Control impact summary'}>
    <strong>{tr ? 'Bu kontrolün bağlı olduğu alanlar' : 'Where this control is connected'}</strong>
    <p>{tr
      ? `${detail.frameworks.length} framework eşlemesi · ${detail.audits.length} denetim gereksinimi · ${detail.risks.length} risk`
      : `${detail.frameworks.length} framework mappings · ${detail.audits.length} audit requirements · ${detail.risks.length} risks`}</p>
    <span>{tr ? 'Aşağıdaki ilişkileri açarak ilgili kayda geçebilirsiniz.' : 'Expand the relationships below to open the relevant record.'}</span>
  </div>;
}
