import { priorityBlocksAudit, readinessIssueText, type AuditReadinessResult } from './audit-readiness';
import type { AuditEvidenceRequirementState } from './audit-evidence-assurance';

export type AuditRequirementFilter = 'gaps' | 'current' | 'stale' | 'missing' | 'all';
const key = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const uniqueRefs = (refs: string[]) => refs.every(ref => !!key(ref)) && new Set(refs.map(key)).size === refs.length;

/** Validate the scope and decision contract before counts, actions or exports are enabled. */
export function parseAuditReadinessResult(value: unknown, auditName: string): AuditReadinessResult | null {
  if (!object(value) || value.auditName !== auditName.trim() || typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))
    || typeof value.verified !== 'boolean' || !strings(value.issues) || !value.issues.every(issue => Object.hasOwn(readinessIssueText, issue))
    || new Set(value.issues).size !== value.issues.length || value.verified !== !value.issues.length || !object(value.evidence)
    || !Array.isArray(value.signals) || !strings(value.unmonitored) || !uniqueRefs(value.unmonitored) || !count(value.blockerCount)) return null;
  const e = value.evidence;
  if (!Array.isArray(e.requirements) || !Array.isArray(e.gaps) || !strings(e.missing) || !strings(e.staleReferences)) return null;
  for (const row of e.requirements) {
    if (!object(row) || !['reference','title','owner','dueDate'].every(field => typeof row[field] === 'string')
      || ![row.linkedEvidence,row.currentEvidence,row.staleEvidence].every(count) || !strings(row.assessmentIssues)
      || !strings(row.eligibilityIssues) || !strings(row.requirementIds) || !row.requirementIds.length
      || row.requirementIds.some(id => !id.trim()) || new Set(row.requirementIds).size !== row.requirementIds.length) return null;
    if (Number(row.currentEvidence) + Number(row.staleEvidence) > Number(row.linkedEvidence)
      || row.status !== (!row.linkedEvidence ? 'missing' : row.currentEvidence ? 'current' : 'stale')) return null;
  }
  const rows = e.requirements as AuditEvidenceRequirementState[];
  if (!uniqueRefs(rows.map(row => row.reference))) return null;
  const scope = new Set(rows.map(row => key(row.reference)));
  if (value.unmonitored.some(ref => !scope.has(key(ref)))) return null;
  const current = rows.filter(row => row.status === 'current').length, stale = rows.filter(row => row.status === 'stale').length;
  const missing = rows.filter(row => row.status === 'missing').map(row => row.reference), linked = rows.filter(row => row.linkedEvidence > 0).length;
  const readiness = rows.length ? Math.round(current / rows.length * 100) : 100, coverage = rows.length ? Math.round(linked / rows.length * 100) : 100;
  const evidenceGate = !rows.length ? 'empty' : readiness === 100 ? 'ready' : readiness >= 80 && !missing.length ? 'attention' : 'not-ready';
  if (e.total !== rows.length || e.current !== current || e.stale !== stale || e.linked !== linked || e.readiness !== readiness || e.coverage !== coverage
    || e.gate !== evidenceGate || !same(e.missing,missing) || !same(e.staleReferences,rows.filter(row => row.status === 'stale').map(row => row.reference))
    || !same(e.gaps,rows.filter(row => row.status !== 'current'))) return null;
  const ids = new Set<string>();
  for (const signal of value.signals) {
    if (!object(signal) || !['id','kind','action','state','title','ruleId','ruleName','findingId','targetControlRef','owner','dueDate','reason','updatedAt'].every(field => typeof signal[field] === 'string')
      || !['control','finding','work-item'].includes(String(signal.kind)) || !signal.id || ids.has(String(signal.id))
      || !count(signal.priority) || typeof signal.blocking !== 'boolean' || !strings(signal.targetControlRefs) || !signal.targetControlRefs.length
      || !uniqueRefs(signal.targetControlRefs) || signal.targetControlRef !== signal.targetControlRefs[0] || signal.targetControlRefs.some(ref => !scope.has(key(ref)))) return null;
    if (signal.blocking !== priorityBlocksAudit(signal as unknown as AuditReadinessResult['signals'][number])) return null;
    ids.add(String(signal.id));
  }
  const blockers = value.signals.filter(signal => signal.blocking).length;
  const gate = value.issues.length ? 'unverified' : evidenceGate !== 'empty' && blockers ? 'not-ready' : evidenceGate === 'ready' && value.signals.length ? 'attention' : evidenceGate;
  if (value.blockerCount !== blockers || value.gate !== gate) return null;
  return value as unknown as AuditReadinessResult;
}

export function filterAuditRequirements(rows: AuditEvidenceRequirementState[], filter: AuditRequirementFilter, query: string) {
  const needle = key(query);
  return rows.filter(row => (filter === 'all' || (filter === 'gaps' ? row.status !== 'current' : row.status === filter))
    && (!needle || key([row.reference,row.title,row.owner].join(' ')).includes(needle)));
}

export const auditEligibilityLabels: Record<string, {tr:string;en:string}> = {
  expired:{tr:'Geçerlilik süresi dolmuş veya tarih geçersiz.',en:'Validity expired or the date is invalid.'},
  'approval-required':{tr:'Kanıt henüz onaylı değil.',en:'Evidence has not been approved.'},
  'review-required':{tr:'Kanıt incelemesi veya onayı bekleniyor.',en:'Evidence review or approval is pending.'},
  rejected:{tr:'Kanıt reddedilmiş veya geçersiz işaretlenmiş.',en:'Evidence was rejected or marked invalid.'},
  'validation-failed':{tr:'Kanıt doğrulaması başarısız.',en:'Evidence validation failed.'},
  'integrity-broken':{tr:'Kanıtın sürüm zinciri bozuk.',en:'The evidence version chain is broken.'},
  'integrity-unavailable':{tr:'Kanıt bütünlüğü doğrulanamadı.',en:'Evidence integrity could not be verified.'},
};
