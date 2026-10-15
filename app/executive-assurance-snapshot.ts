import { parseEvidenceAssuranceSnapshot, type EvidenceAssuranceSnapshot } from './evidence/assurance-snapshot';
import { parseAuditReadinessPortfolio, type AuditReadinessPortfolio } from './audit-readiness-portfolio';

export type ExecutiveAssuranceSnapshot = EvidenceAssuranceSnapshot & { auditPortfolio: AuditReadinessPortfolio };
export function parseExecutiveAssuranceSnapshot(value: unknown): ExecutiveAssuranceSnapshot | null {
  const evidence = parseEvidenceAssuranceSnapshot(value);
  const portfolio = parseAuditReadinessPortfolio((value as ExecutiveAssuranceSnapshot | null)?.auditPortfolio);
  if (!evidence || !portfolio || portfolio.generatedAt !== evidence.generatedAt || (evidence.verified && !portfolio.verified)) return null;
  return { ...evidence, auditPortfolio: portfolio };
}
