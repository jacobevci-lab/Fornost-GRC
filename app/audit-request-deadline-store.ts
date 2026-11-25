import type { Actor } from './api/auth/security';
import { AuditRequestError, type AuditRequestFields } from './audit-requests';
import { canWriteModule, parseModuleAccess } from './module-access';
import { deadlineCalendarGuard, prepareDeadlineAdjustment } from './audit-deadline-adjustment-store';

/** Requests inherit the work plan's zone; a preview must never change it. */
export async function prepareRequestDeadlineAdjustment(db: D1Database, actor: Actor, auditId: string, value: unknown, expectedWorkflowRevision: unknown, fields: AuditRequestFields) {
  if (value === undefined) return null;
  const workflow = await db.prepare('SELECT state,revision,time_zone FROM audit_request_workflows WHERE audit_id=?').bind(auditId).first<{state: string; revision: string; time_zone: string}>();
  if (expectedWorkflowRevision !== (workflow?.revision || '')) throw new AuditRequestError('conflict', 409);
  const adjustment = await prepareDeadlineAdjustment(db, auditId, 'save', value, { dueDate: fields.dueDate, reviewDueDate: fields.reviewDueDate, timeZone: workflow?.time_zone || 'UTC' });
  const person = await db.prepare('SELECT u.id,lower(u.email) AS email,u.role,a.policy_json AS policy FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND u.status=\'Active\'').bind(actor.id).first<{id: string; email: string; role: string; policy: string | null}>();
  if (!person || person.email !== actor.email.toLowerCase() || person.role !== actor.role || !canWriteModule({role: person.role, moduleAccess: parseModuleAccess(person.policy)}, 'Denetim Yönetimi')) throw new AuditRequestError('forbidden', 403);
  return { ...adjustment!, workflow: JSON.stringify(workflow ? [workflow.state, workflow.revision, workflow.time_zone] : null), person };
}

export const requestDeadlineGuard = `${deadlineCalendarGuard}
  AND (?=0 OR (COALESCE((SELECT json_array(state,revision,time_zone) FROM audit_request_workflows WHERE audit_id=?),'null')=?
    AND EXISTS(SELECT 1 FROM local_users u LEFT JOIN user_module_access a ON a.user_id=u.id WHERE u.id=? AND lower(u.email)=? AND u.role=? AND u.status='Active' AND a.policy_json IS ?)))`;
export function requestDeadlineGuardArgs(auditId: string, adjustment: Awaited<ReturnType<typeof prepareRequestDeadlineAdjustment>>) {
  return [adjustment ? 1 : 0, auditId, adjustment?.revision || '', adjustment?.raw || '', adjustment ? 1 : 0, auditId, adjustment?.workflow || 'null', adjustment?.person.id || '', adjustment?.person.email || '', adjustment?.person.role || '', adjustment?.person.policy ?? null];
}
