import { buildAuditReadiness, type AuditReadinessResult } from './audit-readiness';
import type { loadAuditReadinessContext } from './audit-readiness-runtime';

export type AuditPortfolioEntry = { id: string; name: string; gate: AuditReadinessResult['gate']; verified: boolean; issues: string[]; requirements: number; current: number; blockers: number };
export type AuditReadinessPortfolio = { audits: AuditPortfolioEntry[]; verified: boolean; issues: string[]; orphanRequirements: number; generatedAt: string };
export const auditNameKey = (name: unknown) => String(name ?? '').normalize('NFKC').trim().toLocaleLowerCase('tr-TR');

export function buildAuditReadinessPortfolio(audits: { id: string; name: string }[], context: Awaited<ReturnType<typeof loadAuditReadinessContext>>, issues: string[] = []): AuditReadinessPortfolio {
  const counts = new Map<string, number>();
  for (const audit of audits) counts.set(auditNameKey(audit.name), (counts.get(auditNameKey(audit.name)) || 0) + 1);
  const orphanRequirements = context.rows.filter(row => row.module === 'Denetim Yönetimi' && !counts.has(auditNameKey(row.data.auditName))).length;
  const portfolioIssues = [...issues];
  if (orphanRequirements) portfolioIssues.push('orphan-requirements');
  const entries = audits.map(audit => {
    const result = buildAuditReadiness({ ...context, auditName: audit.name });
    const ambiguous = !auditNameKey(audit.name) || counts.get(auditNameKey(audit.name)) !== 1;
    if (ambiguous) portfolioIssues.push('audit-identity-ambiguous');
    return { id: audit.id, name: audit.name, gate: ambiguous ? 'unverified' as const : result.gate, verified: result.verified && !ambiguous,
      issues: ambiguous ? [...result.issues, 'audit-identity-ambiguous'] : result.issues, requirements: result.evidence.total, current: result.evidence.current, blockers: result.blockerCount };
  });
  // Empty portfolios still report unavailable underlying sources rather than a fabricated empty pass.
  const sourceIssues = buildAuditReadiness({ ...context, auditName: '' }).issues.filter(issue => issue !== 'scope-unmapped');
  portfolioIssues.push(...sourceIssues);
  return { audits: entries, verified: !portfolioIssues.length && entries.every(audit => audit.verified), issues: [...new Set(portfolioIssues)], orphanRequirements, generatedAt: context.now.toISOString() };
}

export const auditPortfolioGateText: Record<AuditPortfolioEntry['gate'], { tr: string; en: string }> = {
  ready: { tr: 'Hazır', en: 'Ready' }, attention: { tr: 'Dikkat gerekiyor', en: 'Needs attention' },
  'not-ready': { tr: 'Hazır değil', en: 'Not ready' }, empty: { tr: 'Kapsam boş', en: 'Empty scope' }, unverified: { tr: 'Doğrulanmadı', en: 'Unverified' },
};

export function parseAuditReadinessPortfolio(value: unknown): AuditReadinessPortfolio | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as AuditReadinessPortfolio;
  if (typeof p.verified !== 'boolean' || !Array.isArray(p.issues) || !p.issues.every(issue => typeof issue === 'string') || !Number.isSafeInteger(p.orphanRequirements) || p.orphanRequirements < 0
    || typeof p.generatedAt !== 'string' || !Number.isFinite(Date.parse(p.generatedAt)) || !Array.isArray(p.audits) || p.audits.length > 500) return null;
  const ids = new Set<string>();
  for (const a of p.audits) {
    if (!a || typeof a.id !== 'string' || !a.id || ids.has(a.id) || typeof a.name !== 'string' || !a.name.trim() || !Object.hasOwn(auditPortfolioGateText, a.gate) || typeof a.verified !== 'boolean'
      || !Array.isArray(a.issues) || !a.issues.every(issue => typeof issue === 'string') || ![a.requirements, a.current, a.blockers].every(n => Number.isSafeInteger(n) && n >= 0) || a.current > a.requirements) return null;
    if (a.verified !== (a.gate !== 'unverified') || (a.verified && a.issues.length) || (a.gate === 'ready' && (!a.requirements || a.current !== a.requirements || a.blockers)) || (a.gate === 'empty' && a.requirements)) return null;
    ids.add(a.id);
  }
  if (p.verified && (p.issues.length || p.orphanRequirements || p.audits.some(a => !a.verified))) return null;
  return p;
}
