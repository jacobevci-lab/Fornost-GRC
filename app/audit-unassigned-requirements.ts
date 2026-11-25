import { auditNameKey } from './audit-readiness-portfolio';

/** The same normalized audit identity used by readiness; never infer an assignment. */
export function unassignedAuditRequirements<T extends { data: Record<string, unknown> }>(rows: T[], audits: { name: string }[]): T[] {
  const names = new Set(audits.map(audit => auditNameKey(audit.name)).filter(Boolean));
  return rows.filter(row => !names.has(auditNameKey(row.data.auditName)));
}
