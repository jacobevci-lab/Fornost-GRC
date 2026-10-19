import type { AuditRequestWorkflow } from './audit-requests';
import type { WorkplanPlan } from './audit-workplan';
import type { ReportRecord } from './report-export';

export type AuditReportItem = { kind: 'requirement' | 'request' | 'finding' | 'workpaper'; id: string; record: ReportRecord };
export type AuditReportSource = {
  audit: { id: string; name: string; template: string; auditType: string; auditor: string; owner: string; status: string };
  catalog: Record<string, unknown> | null; plan: WorkplanPlan; workflow: AuditRequestWorkflow;
  sourceRevision: string; items: AuditReportItem[];
};
export type AuditStatusReport = AuditReportSource & {
  schemaVersion: 1; id: string; title: string; summary: string; limitations: string; createdAt: string; createdBy: string;
};
export type AuditReportDetail = { snapshot: AuditStatusReport; sha256: string; integrity: 'verified' | 'broken' | 'unavailable' };
export type AuditReportListItem = { id: string; title: string; createdAt: string; createdBy: string; itemCount: number };
export const auditReportLimits = { requirement: 2000, request: 500, finding: 1000, workpaper: 100, bytes: 8_000_000 } as const;
export class AuditReportError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const reportCanonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(reportCanonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${reportCanonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
export async function auditReportHash(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reportCanonical(value)));
  return Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('');
}
export function auditReportSummary(items: AuditReportItem[]) {
  const requirements = items.filter(i => i.kind === 'requirement'), requests = items.filter(i => i.kind === 'request'), findings = items.filter(i => i.kind === 'finding');
  return {
    workpapers: items.filter(i => i.kind === 'workpaper').length, outstandingWorkpapers: items.filter(i => i.kind === 'workpaper' && !['approved', 'cancelled'].includes(String(i.record.data.status))).length,
    requirements: requirements.length, unfinishedRequirements: requirements.filter(i => !['Kapatıldı', 'Kapalı', 'Tamamlandı'].includes(String(i.record.data.status))).length,
    requests: requests.length, outstandingRequests: requests.filter(i => !['accepted', 'cancelled'].includes(String(i.record.data.status))).length,
    acceptedRequests: requests.filter(i => i.record.data.status === 'accepted').length, cancelledRequests: requests.filter(i => i.record.data.status === 'cancelled').length,
    findings: findings.length, unresolvedFindings: findings.filter(i => i.record.data.status !== 'closed').length,
  };
}
