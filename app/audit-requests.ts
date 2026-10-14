export const auditRequestStatuses = ['draft', 'assigned', 'submitted', 'changes_requested', 'accepted', 'cancelled'] as const;
export type AuditRequestStatus = typeof auditRequestStatuses[number];
export type AuditRequestFields = {
  title: string; instructions: string; owner: string; reviewer: string;
  dueDate: string; reviewDueDate: string; periodStart: string; periodEnd: string;
};
export type AuditRequestEvidence = {
  id: string; evidenceId: string; versionNo: number; title: string; fileName: string;
  fileKey: string; contentSha256: string; period: string;
};
export type AuditRequest = AuditRequestFields & {
  id: string; auditId: string; status: AuditRequestStatus; revision: string;
  evidence: AuditRequestEvidence[]; submittedBy: string; note: string;
  createdAt: string; updatedAt: string;
};
export type AuditRequestWorkflow = { auditId: string; state: 'draft' | 'active'; revision: string; timeZone: string; planRevision: string };
export type AuditRequestPreview = { id: string; revision: string };
export function requestDraftPreview(requests: AuditRequest[]): AuditRequestPreview[] {
  return requests.filter(row => row.status === 'draft').map(({ id, revision }) => ({ id, revision }));
}
export function validateRequestPreview(value: unknown): AuditRequestPreview[] {
  if (!Array.isArray(value) || !value.length || value.length > 500) throw new AuditRequestError('preview-changed', 409);
  const ids = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || typeof row.revision !== 'string' || !row.revision || row.revision.length > 100 || ids.has(row.id)) throw new AuditRequestError('preview-changed', 409);
    ids.add(row.id);
  }
  return value.map(({ id, revision }) => ({ id, revision }));
}
export const emptyAuditRequest: AuditRequestFields = { title: '', instructions: '', owner: '', reviewer: '', dueDate: '', reviewDueDate: '', periodStart: '', periodEnd: '' };
export class AuditRequestError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const requestIdentity = (value: string) => value.trim().toLowerCase();
export function requestDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateAuditRequestFields(value: unknown): AuditRequestFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditRequestError('fields');
  const input = value as Record<string, unknown>, fields = { ...emptyAuditRequest };
  for (const key of Object.keys(fields) as (keyof AuditRequestFields)[]) {
    const raw = input[key], limit = key === 'instructions' ? 4000 : key === 'title' ? 180 : 320;
    if (typeof raw !== 'string' || raw.length > limit) throw new AuditRequestError('fields');
    fields[key] = raw.trim();
  }
  fields.owner = requestIdentity(fields.owner); fields.reviewer = requestIdentity(fields.reviewer);
  if (!fields.title || !fields.instructions || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.owner) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.reviewer)) throw new AuditRequestError('fields');
  if (fields.owner === fields.reviewer) throw new AuditRequestError('independent-reviewer');
  if (!requestDate(fields.dueDate) || !requestDate(fields.reviewDueDate) || fields.reviewDueDate < fields.dueDate) throw new AuditRequestError('dates');
  if (Boolean(fields.periodStart) !== Boolean(fields.periodEnd) || (fields.periodStart && (!requestDate(fields.periodStart) || !requestDate(fields.periodEnd) || fields.periodStart > fields.periodEnd))) throw new AuditRequestError('dates');
  return fields;
}
export function validateRequestTimeZone(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 80) throw new AuditRequestError('timezone');
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { throw new AuditRequestError('timezone'); }
  return value;
}
export function requestNextActor(row: AuditRequest) {
  return row.status === 'submitted' ? row.reviewer : ['assigned', 'changes_requested'].includes(row.status) ? row.owner : '';
}
export function requestNextDue(row: AuditRequest) { return row.status === 'submitted' ? row.reviewDueDate : row.dueDate; }
/** End of the chosen local calendar day, including DST transitions. */
export function requestDueAt(date: string, timeZone: string) {
  if (!requestDate(date)) throw new AuditRequestError('dates');
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDate = (time: number) => {
    const parts = format.formatToParts(new Date(time)), part = (name: string) => parts.find(p => p.type === name)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const day = Date.parse(`${date}T00:00:00Z`);
  let left = day - 86400000, right = day + 3 * 86400000;
  while (right - left > 1) { const middle = Math.floor((left + right) / 2); if (localDate(middle) <= date) left = middle; else right = middle; }
  return new Date(left).toISOString();
}
export const requestStatusLabels: Record<AuditRequestStatus, [string, string]> = {
  draft: ['Taslak', 'Draft'], assigned: ['Teslim bekliyor', 'Awaiting submission'], submitted: ['İnceleme bekliyor', 'Awaiting review'],
  changes_requested: ['Düzeltme istendi', 'Changes requested'], accepted: ['Kabul edildi', 'Accepted'], cancelled: ['İptal edildi', 'Cancelled'],
};
