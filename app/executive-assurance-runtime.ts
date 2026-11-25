import { loadEvidenceAssuranceSnapshot } from './evidence/assurance-runtime';
import { loadAuditReadinessContext } from './audit-readiness-runtime';
import { buildAuditReadinessPortfolio } from './audit-readiness-portfolio';

export async function loadExecutiveAssuranceSnapshot(db: D1Database, now = new Date()) {
  const evidence = await loadEvidenceAssuranceSnapshot(db, now);
  const context = await loadAuditReadinessContext(db, now, evidence);
  const issues: string[] = [];
  let audits: { id: string; name: string }[] = [];
  try {
    const result = await db.prepare('SELECT id,name FROM simple_audits ORDER BY id LIMIT 501').all<{ id: string; name: string }>();
    if (result.results.length > 500) issues.push('audits-incomplete');
    audits = result.results.slice(0, 500).filter(audit => {
      const valid = typeof audit.id === 'string' && !!audit.id && typeof audit.name === 'string' && !!audit.name.trim();
      if (!valid) issues.push('audits-invalid');
      return valid;
    });
  } catch { issues.push('audits-unavailable'); }
  const auditPortfolio = buildAuditReadinessPortfolio(audits, context, issues);
  return { ...evidence, evidenceVerified: evidence.verified, evidenceIssues: evidence.issues, auditPortfolio,
    verified: evidence.verified && auditPortfolio.verified, issues: [...new Set([...evidence.issues, ...auditPortfolio.issues])] };
}
