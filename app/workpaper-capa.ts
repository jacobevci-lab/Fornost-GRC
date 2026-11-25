import { validateFinding } from './findings/domain';
import { AuditRequestError, type AuditRequestEvidence } from './audit-requests';
import type { WorkpaperSample } from './audit-workpapers';

export type WorkpaperCapaOrigin = {
  auditId: string; auditName: string; workpaperId: string; workpaperTitle: string;
  revision: string; owner: string; reviewer: string; sample: WorkpaperSample;
  evidence: AuditRequestEvidence; reason: string;
};
export type WorkpaperCapaLink = {
  findingId: string; code: string; title: string; status: string; missing: boolean;
  sourceRevision: string; origin: WorkpaperCapaOrigin; actor: string; createdAt: string;
};
export type WorkpaperCapaFields = Omit<ReturnType<typeof validateFinding>, 'sourceType' | 'sourceRef' | 'sourceTitle'>;
export function workpaperSampleKey(reference: string) { return reference.trim().toLowerCase(); }
export function workpaperCapaFinding(fields: unknown, origin: Pick<WorkpaperCapaOrigin, 'auditId' | 'auditName'>, today?: string) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new AuditRequestError('fields');
  const allowed = ['findingType','title','description','severity','owner','reviewer','rootCause','correctiveAction','preventiveAction','dueDate','riskRef','controlRef'];
  if (Object.keys(fields).some(k => !allowed.includes(k)) || allowed.some(k => typeof (fields as Record<string, unknown>)[k] !== 'string')) throw new AuditRequestError('fields');
  try { return validateFinding({ ...fields, sourceType: 'audit', sourceRef: origin.auditId, sourceTitle: origin.auditName }, today); }
  catch { throw new AuditRequestError('capa-fields'); }
}
