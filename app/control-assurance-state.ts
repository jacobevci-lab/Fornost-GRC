import type { AssuranceRow } from './control-assurance';
import { connectedGrcNavigation } from './connected-grc-navigation';
import type { FornostNavigationRequest } from './navigation-focus';

export type ControlAssuranceSnapshot = { rows: AssuranceRow[]; verified: boolean; issues: string[]; generatedAt: string };

export function controlAssuranceRecordTarget(row: AssuranceRow): FornostNavigationRequest | null {
  // A projected remediation is the finding's workflow, not a second editable record.
  if (row.module === 'Bulgular ve CAPA' && row.data.kind === 'remediation') {
    const refs = row.data.remediationFindingRef;
    const ref = Array.isArray(refs) ? String(refs[0] || '') : String(refs || '');
    return ref ? { module: row.module, ref, filter: { findingRef: ref }, source: 'control-assurance' } : null;
  }
  const target = connectedGrcNavigation(row);
  return target ? { module: target.module, ref: target.ref, kind: target.filterKey === 'recordRef' || ['Kontroller', 'Risk Assessment'].includes(row.module) ? 'record' : undefined,
    filter: { [target.filterKey]: target.ref }, source: 'control-assurance' } : null;
}

export const controlAssuranceIssueLabel = (issue: string, lang: 'tr' | 'en') => {
  const labels: Record<string, [string, string]> = {
    records: ['GRC kayıtları', 'GRC records'], capa: ['Bulgu/CAPA', 'Findings/CAPA'],
    integrity: ['Kanıt bütünlüğü', 'Evidence integrity'], rules: ['Kontrol kuralları', 'Control rules'],
    findings: ['Otomasyon bulguları', 'Automation findings'], work: ['Güvence iş kuyruğu', 'Assurance work queue'],
  };
  const [source, reason] = issue.split('-');
  const label = labels[source]?.[lang === 'tr' ? 0 : 1] || source;
  return `${label}: ${reason === 'unavailable' ? (lang === 'tr' ? 'yüklenemedi' : 'unavailable') : (lang === 'tr' ? 'değerlendirme eksik' : 'evaluation incomplete')}`;
};

export const controlAssuranceReasonLabels: Record<string, { tr: string; en: string }> = {
  "retest-unresolved": { tr: "Yeniden test sonucu çözümlenmemiş", en: "Re-test outcome unresolved" },
  "owner-missing": { tr: "Kontrol sahibi eksik", en: "Control owner missing" },
  "test-owner-missing": { tr: "Test sahibi eksik", en: "Test owner missing" },
  "test-date-missing": { tr: "Test tarihi planlanmamış", en: "Test date not planned" },
  "test-overdue": { tr: "Kontrol testi gecikmiş", en: "Control test overdue" },
  "test-failed": { tr: "Son kontrol testi başarısız", en: "Latest control test failed" },
  "evidence-missing": { tr: "Bağlı kanıt yok", en: "No linked evidence" },
  "evidence-stale": { tr: "Kanıt güncel değil", en: "Evidence is not current" },
  "evidence-integrity-broken": { tr: "Kanıt bütünlük zinciri bozuk", en: "Evidence integrity chain broken" },
  "evidence-integrity-legacy": { tr: "Kanıt bütünlüğü eski formatta doğrulanamıyor", en: "Legacy evidence integrity is unverified" },
  "evidence-integrity-unavailable": { tr: "Kanıt bütünlük doğrulaması kullanılamıyor", en: "Evidence integrity verification unavailable" },
  "audit-missing": { tr: "Denetim izi yok", en: "No audit trace" },
  "open-findings": { tr: "Açık bulgu var", en: "Open finding exists" },
  "automation-failing": { tr: "Otomatik kontrol başarısız", en: "Automated control failing" },
  "automation-stale": { tr: "Otomatik kanıt bayat/eksik", en: "Automated evidence stale/missing" },
  "automation-attention": { tr: "Otomasyon sinyali dikkat istiyor", en: "Automation signal needs attention" },
  "automation-finding-open": { tr: "Açık otomasyon bulgusu", en: "Open automation finding" },
  "remediation-open": { tr: "Açık CAPA / remediation", en: "Open CAPA / remediation" },
  "risk-link-missing": { tr: "Bulgu risk bağlantısı eksik", en: "Finding risk link missing" },
  "control-needs-improvement": { tr: "Kontrol iyileştirme bekliyor", en: "Control needs improvement" },
};
