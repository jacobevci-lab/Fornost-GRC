import { buildAuditEvidenceAssurance, type AssuranceRecord } from './audit-evidence-assurance';
import { buildContinuousAssuranceDashboard, type AssurancePriority } from './continuous-assurance-dashboard';
import type { loadContinuousAssuranceSnapshots } from './continuous-assurance-store';

export type AuditReadinessRow = AssuranceRecord & { module: string };
export type AuditReadinessIssue = 'records-unavailable' | 'records-incomplete' | 'scope-unmapped' | 'rules-unavailable' | 'rules-incomplete' | 'findings-unavailable' | 'findings-incomplete' | 'work-unavailable' | 'work-incomplete' | 'integrity-unavailable' | 'integrity-incomplete';
type Sources = Awaited<ReturnType<typeof loadContinuousAssuranceSnapshots>>;
const normalized = (value: unknown) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
const refs = (value: unknown) => String(value ?? '').split(/[;,|\n]+/).map(value => value.trim()).filter(Boolean);
const blockingStates = new Set(['integrity-failed', 'failing', 'failed-retest', 'retest-error', 'overdue-remediation']);
const blockingReasons = new Set(['evidence-integrity-failed', 'control-failing', 'failed-retest', 'retest-error', 'remediation-overdue']);
export function priorityBlocksAudit(priority: AssurancePriority) { return blockingStates.has(normalized(priority.state)) || blockingReasons.has(normalized(priority.reason)); }

export function auditRowsInScope(rows: AuditReadinessRow[], auditName: string) {
  return rows.filter(row => row.module === 'Denetim Yönetimi' && (!auditName || normalized(row.data.auditName) === normalized(auditName)));
}

export function buildAuditReadiness(input: {
  rows: AuditReadinessRow[]; auditName: string; sources: Sources;
  recordsAvailable: boolean; recordsComplete: boolean; now?: Date;
}) {
  const now = input.now || new Date(), scopeRows = auditRowsInScope(input.rows, input.auditName);
  const evidence = buildAuditEvidenceAssurance(scopeRows, input.rows.filter(row => row.module === 'Kanıtlar'), now);
  const scope = new Set(evidence.requirements.map(item => normalized(item.reference)));
  // Project the complete loaded signal set before applying audit scope. The operational
  // dashboard's top-100 display window must never determine an audit readiness decision.
  const dashboard = buildContinuousAssuranceDashboard({ ...input.sources, now, priorityLimit: null });
  const signals = dashboard.priorities.flatMap(item => {
    const matches = (item.targetControlRefs || refs(item.targetControlRef)).filter(ref => scope.has(normalized(ref)));
    return matches.length ? [{ ...item, targetControlRef: matches[0], targetControlRefs: matches, blocking: priorityBlocksAudit(item) }] : [];
  });
  const quality = input.sources.dataQuality, issues: AuditReadinessIssue[] = [];
  if (!input.recordsAvailable) issues.push('records-unavailable');
  else if (!input.recordsComplete) issues.push('records-incomplete');
  if (scopeRows.some(row => !refs(row.data.controlRef).length && !refs(row.data.requirementRef).length)) issues.push('scope-unmapped');
  for (const [available, complete, unavailableIssue, incompleteIssue] of [
    [quality.rulesAvailable, quality.rulesComplete, 'rules-unavailable', 'rules-incomplete'],
    [quality.findingsAvailable, quality.findingsComplete, 'findings-unavailable', 'findings-incomplete'],
    [quality.workQueueAvailable, quality.workQueueComplete, 'work-unavailable', 'work-incomplete'],
    [quality.evidenceIntegrityAvailable, quality.evidenceIntegrityComplete, 'integrity-unavailable', 'integrity-incomplete'],
  ] as const) {
    if (!available) issues.push(unavailableIssue);
    else if (!complete) issues.push(incompleteIssue);
  }
  const blockerCount = signals.filter(item => item.blocking).length;
  const monitored = new Set(input.sources.rules.flatMap(rule => refs(rule.controlRefs)).map(normalized));
  const unmonitored = evidence.requirements.filter(item => !monitored.has(normalized(item.reference))).map(item => item.reference);
  const gate = issues.length ? 'unverified' : evidence.gate !== 'empty' && blockerCount ? 'not-ready' : evidence.gate === 'ready' && signals.length ? 'attention' : evidence.gate;
  return { auditName: input.auditName, generatedAt: now.toISOString(), gate, verified: issues.length === 0, issues, evidence, signals, blockerCount, unmonitored };
}
export type AuditReadinessResult = ReturnType<typeof buildAuditReadiness>;

export const readinessIssueText: Record<AuditReadinessIssue, { tr: string; en: string }> = {
  'records-unavailable': { tr: 'Denetim ve kanıt kayıtları okunamadı.', en: 'Audit and evidence records could not be read.' },
  'records-incomplete': { tr: 'Denetim veya kanıt kayıtları eksik ya da okunamıyor.', en: 'Audit or evidence records are incomplete or unreadable.' },
  'scope-unmapped': { tr: 'Bazı denetim maddelerinde kontrol veya gereksinim referansı eksik.', en: 'Some audit items have no control or requirement reference.' },
  'rules-unavailable': { tr: 'Otomatik kontrol verisi okunamadı.', en: 'Automated control data could not be read.' },
  'rules-incomplete': { tr: 'Otomatik kontrol verisi değerlendirme sınırını aşıyor.', en: 'Automated control data exceeds the evaluation limit.' },
  'findings-unavailable': { tr: 'Kontrol bulguları okunamadı.', en: 'Control findings could not be read.' },
  'findings-incomplete': { tr: 'Kontrol bulguları değerlendirme sınırını aşıyor.', en: 'Control findings exceed the evaluation limit.' },
  'work-unavailable': { tr: 'Güvence iş kuyruğu okunamadı.', en: 'Assurance work could not be read.' },
  'work-incomplete': { tr: 'Güvence iş kuyruğu değerlendirme sınırını aşıyor.', en: 'Assurance work exceeds the evaluation limit.' },
  'integrity-unavailable': { tr: 'Bağlı kanıtların bütünlük kontrolü yapılamadı.', en: 'Linked evidence integrity could not be checked.' },
  'integrity-incomplete': { tr: 'Bağlı kanıtların bütünlük kontrolü tamamlanamadı.', en: 'Linked evidence integrity checks are incomplete.' },
};
