import { auditReportSummary, type AuditReportDetail, type AuditReportSource } from './audit-status-report';

export type AuditClosureState = { state: 'open' | 'pending' | 'closed'; revision: string; submissionId: string; reportId: string };
export type AuditClosureAction = 'submit' | 'approve' | 'return' | 'withdraw' | 'reopen';
export type AuditClosureEvent = {
  schemaVersion: 1; id: string; auditId: string; action: AuditClosureAction; state: AuditClosureState['state'];
  previousRevision: string; actorId: string; actorEmail: string; note: string; createdAt: string;
  submissionId: string; reportId: string; reportSha256: string; sourceRevision: string;
  preparerId: string; preparerEmail: string; reviewerId: string; reviewerEmail: string; followUp: string;
};
export type AuditClosureHistory = { state: AuditClosureState; events: AuditClosureEvent[]; complete: boolean; actorId: string };
export type AuditClosureDetail = { event: AuditClosureEvent; sha256: string; report: AuditReportDetail };
export type AuditClosurePreview = { source: AuditReportSource; blockers: string[]; reviewers: { id: string; name: string; email: string }[]; reviewersComplete: boolean };
export const emptyAuditClosure: AuditClosureState = { state: 'open', revision: '', submissionId: '', reportId: '' };
export const auditClosureLabels = { open: ['Açık', 'Open'], pending: ['Kapanış onayında', 'Closure in review'], closed: ['Onayla kapatıldı', 'Closed with approval'] } as const;
export const auditClosureActionLabels = { submit: ['Onaya gönderildi', 'Submitted for approval'], approve: ['Onaylandı ve kapatıldı', 'Approved and closed'], return: ['Düzeltme için iade edildi', 'Returned for changes'], withdraw: ['Onaydan geri çekildi', 'Withdrawn from review'], reopen: ['Gerekçeyle yeniden açıldı', 'Reopened with reason'] } as const;
export const auditClosureBlockerLabels: Record<string, [string, string]> = {
  plan: ['Planın amacı, kapsamı ve baş denetçisi kaydedilmeli.', 'Save the plan objective, scope and lead auditor.'],
  empty: ['En az bir denetim maddesi bulunmalı.', 'At least one audit requirement is required.'],
  requirements: ['Tüm denetim maddeleri sonuçlandırılmalı.', 'Complete every audit requirement.'],
  requests: ['Tüm talepler kabul veya iptal edilmeli ve talep planı kapatılmalı.', 'Accept or cancel every request and close the request work plan.'],
  findings: ['Açık bağlı bulguların sorumlu ve geçerli termin bilgisi olmalı.', 'Every open linked finding needs an owner and a valid due date.'],
};
export function auditClosureBlockers(source: AuditReportSource) {
  const n = auditReportSummary(source.items), blockers: string[] = [];
  if (!source.plan.revision || !['objective', 'scope', 'lead'].every(key => String(source.plan.plan[key as keyof typeof source.plan.plan] || '').trim())) blockers.push('plan');
  if (!n.requirements) blockers.push('empty');
  if (n.unfinishedRequirements) blockers.push('requirements');
  if (n.requests && (n.outstandingRequests || source.workflow.state !== 'closed')) blockers.push('requests');
  if (source.items.some(i => i.kind === 'finding' && i.record.data.status !== 'closed' && (
    !String(i.record.data.owner || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(i.record.data.dueDate)) ||
    !Number.isFinite(Date.parse(String(i.record.data.dueDate))) || new Date(String(i.record.data.dueDate)).toISOString().slice(0, 10) !== i.record.data.dueDate
  ))) blockers.push('findings');
  return blockers;
}
export const isAuditClosedError = (error: unknown) => String(error).includes('audit-closed');
export const auditClosedMessage = 'Denetim onayla kapatılmış. Değişiklik yapmak için Kapanış ve onay görünümünden gerekçeyle yeniden açın.';
