import type { AuditRequest, AuditRequestWorkflow } from './audit-requests';
import type { AuditPlan } from './audit-plan';

export type WorkplanPlan = { plan: AuditPlan; revision: string; updatedAt: string | null; updatedBy: string | null };
export type WorkplanPreview = { auditName: string; workflow: AuditRequestWorkflow; plan: WorkplanPlan; requests: AuditRequest[]; complete: boolean };
export type WorkplanSnapshot = {
  schemaVersion: 1; id: string; auditId: string; auditName: string; closedAt: string; closedBy: string; note: string;
  timeZone: string; workflowRevision: string; plan: WorkplanPlan; requests: AuditRequest[];
};
export type WorkplanEvent = { id: string; audit_id: string; action: 'close' | 'reopen'; actor: string; note: string; closure_id: string; revision: string; created_at: string };
export type WorkplanClosureDetail = { snapshot: WorkplanSnapshot; sha256: string; integrity: 'verified' | 'broken' | 'unavailable'; evidenceAccess: boolean };
export const workplanResolved = (requests: AuditRequest[], complete: boolean) => complete && requests.length > 0 && requests.every(row => row.status === 'accepted' || row.status === 'cancelled');
