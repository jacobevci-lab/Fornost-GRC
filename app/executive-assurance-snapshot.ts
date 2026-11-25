import { parseEvidenceAssuranceSnapshot, type EvidenceAssuranceSnapshot } from './evidence/assurance-snapshot';
import { parseAuditReadinessPortfolio, type AuditReadinessPortfolio } from './audit-readiness-portfolio';

export type ExecutiveAssuranceSnapshot = EvidenceAssuranceSnapshot & { auditPortfolio: AuditReadinessPortfolio; evidenceVerified?: boolean; evidenceIssues?: string[] };
/** Independent source readiness never authorizes the combined export. */
export function executiveEvidenceSnapshot(snapshot: ExecutiveAssuranceSnapshot): EvidenceAssuranceSnapshot {
  return { rows: snapshot.rows, generatedAt: snapshot.generatedAt,
    verified: snapshot.evidenceVerified ?? snapshot.verified, issues: snapshot.evidenceIssues ?? snapshot.issues };
}
export function parseExecutiveAssuranceSnapshot(value: unknown): ExecutiveAssuranceSnapshot | null {
  const combined = parseEvidenceAssuranceSnapshot(value);
  const portfolio = parseAuditReadinessPortfolio((value as ExecutiveAssuranceSnapshot | null)?.auditPortfolio);
  if (!combined || !portfolio || portfolio.generatedAt !== combined.generatedAt || (combined.verified && !portfolio.verified)) return null;
  const input = value as ExecutiveAssuranceSnapshot;
  if (input.evidenceVerified !== undefined || input.evidenceIssues !== undefined) {
    if (typeof input.evidenceVerified !== 'boolean' || !Array.isArray(input.evidenceIssues)) return null;
    const evidence = parseEvidenceAssuranceSnapshot(executiveEvidenceSnapshot(input));
    if (!evidence || combined.verified !== (evidence.verified && portfolio.verified)) return null;
    const issues = new Set([...evidence.issues, ...portfolio.issues]);
    if (issues.size !== combined.issues.length || combined.issues.some(issue => !issues.has(issue))) return null;
    return { ...combined, evidenceVerified: evidence.verified, evidenceIssues: evidence.issues, auditPortfolio: portfolio };
  }
  return { ...combined, auditPortfolio: portfolio };
}
