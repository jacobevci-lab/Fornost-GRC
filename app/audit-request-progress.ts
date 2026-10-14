import { requestDate, requestNextActor, requestNextDue, type AuditRequest, type AuditRequestWorkflow } from './audit-requests';

/** Request progress only: it is neither an audit opinion nor a closure decision. */
export function auditRequestProgress(requests: AuditRequest[], workflow: AuditRequestWorkflow, complete: boolean, now = new Date()) {
  const counts = { draft: 0, assigned: 0, submitted: 0, changes_requested: 0, accepted: 0, cancelled: 0 };
  const pendingIds: string[] = [], overdueIds: string[] = [];
  let clockComplete = true, today = '', unknown = 0;
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: workflow.timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (name: string) => parts.find(p => p.type === name)!.value;
    today = `${part('year')}-${part('month')}-${part('day')}`;
  } catch { clockComplete = false; }
  for (const row of requests) {
    if (Object.hasOwn(counts, row.status)) counts[row.status]++; else unknown++;
    if (row.status !== 'accepted' && row.status !== 'cancelled') pendingIds.push(row.id);
    if (workflow.state === 'active' && requestNextActor(row)) {
      const due = requestNextDue(row);
      if (!requestDate(due)) clockComplete = false;
      else if (today && due < today) overdueIds.push(row.id);
    }
  }
  const state = !complete || unknown ? 'incomplete' : !requests.length ? 'empty' : workflow.state === 'draft' ? 'draft' : pendingIds.length ? 'pending' : 'resolved';
  return { counts, pendingIds, overdueIds, clockComplete, state };
}
