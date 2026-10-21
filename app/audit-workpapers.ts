import { AuditRequestError, requestDate, requestDueAt, validateRequestTimeZone, type AuditRequestEvidence } from './audit-requests';
export const workpaperStatusLabels = { draft: ['Taslak', 'Draft'], submitted: ['İncelemede', 'In review'], approved: ['Onaylandı', 'Approved'], cancelled: ['İptal edildi', 'Cancelled'] } as const;
export type WorkpaperSample = { reference: string; result: 'pending' | 'pass' | 'exception'; note: string; versionId: string };
export type WorkpaperFields = { title: string; objective: string; procedure: string; population: string; populationCount: number; method: 'judgmental' | 'census'; rationale: string; conclusion: string; owner: string; reviewer: string; samples: WorkpaperSample[]; dueDate?: string; reviewDueDate?: string; timeZone?: string; remindersEnabled?: boolean };
export type AuditWorkpaper = WorkpaperFields & { id: string; auditId: string; revision: string; status: keyof typeof workpaperStatusLabels; evidence: AuditRequestEvidence[]; note: string; createdAt: string; updatedAt: string };
export const emptyWorkpaper: WorkpaperFields = { title: '', objective: '', procedure: '', population: '', populationCount: 1, method: 'judgmental', rationale: '', conclusion: '', owner: '', reviewer: '', samples: [], dueDate: '', reviewDueDate: '', timeZone: 'UTC', remindersEnabled: false };
export function validateWorkpaper(value: unknown): WorkpaperFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditRequestError('fields');
  const v = value as Record<string, unknown>;
  const str = (key: string, min: number, max: number) => { const s = v[key]; if (typeof s !== 'string' || s.trim().length < min || s.length > max) throw new AuditRequestError('fields'); return s.trim(); };
  const title = str('title', 3, 200), objective = str('objective', 3, 2000), procedure = str('procedure', 3, 4000), population = str('population', 3, 2000), rationale = str('rationale', 3, 2000), conclusion = str('conclusion', 0, 4000);
  const owner = str('owner', 3, 254).toLowerCase(), reviewer = str('reviewer', 3, 254).toLowerCase();
  if (owner === reviewer) throw new AuditRequestError('independent-review');
  if (!Number.isSafeInteger(v.populationCount) || Number(v.populationCount) < 1 || Number(v.populationCount) > 1_000_000_000 || !['judgmental', 'census'].includes(String(v.method))) throw new AuditRequestError('fields');
  if (!Array.isArray(v.samples) || v.samples.length > 100 || v.samples.length > Number(v.populationCount)) throw new AuditRequestError('samples');
  const seen = new Set<string>();
  const samples = v.samples.map(s => {
    if (!s || typeof s !== 'object' || typeof s.reference !== 'string' || !s.reference.trim() || s.reference.length > 200 || seen.has(s.reference.trim().toLowerCase()) || !['pending', 'pass', 'exception'].includes(s.result) || typeof s.note !== 'string' || s.note.length > 2000 || typeof s.versionId !== 'string' || (s.versionId && !/^[a-zA-Z0-9_-]{1,100}$/.test(s.versionId))) throw new AuditRequestError('samples');
    seen.add(s.reference.trim().toLowerCase()); return { reference: s.reference.trim(), result: s.result as WorkpaperSample['result'], note: s.note.trim(), versionId: s.versionId };
  });
  const schedule = validateWorkpaperSchedule(v);
  if (v.remindersEnabled !== undefined && typeof v.remindersEnabled !== 'boolean') throw new AuditRequestError('fields');
  if (v.remindersEnabled && !schedule.dueDate) throw new AuditRequestError('dates');
  return { ...schedule, remindersEnabled: v.remindersEnabled === true, title, objective, procedure, population, populationCount: Number(v.populationCount), method: v.method as WorkpaperFields['method'], rationale, conclusion, owner, reviewer, samples };
}
export function requireWorkpaperComplete(p: WorkpaperFields) {
  if (!p.samples.length || !p.conclusion.trim() || p.samples.some(s => s.result === 'pending' || !s.note || !s.versionId) || (p.method === 'census' && p.samples.length !== p.populationCount)) throw new AuditRequestError('incomplete');
}

/** Optional paired deadlines; omission keeps historical undated workpapers valid. */
export function validateWorkpaperSchedule(v: Record<string, unknown>) {
  const dueDate = v.dueDate === undefined ? '' : v.dueDate;
  const reviewDueDate = v.reviewDueDate === undefined ? '' : v.reviewDueDate;
  if (typeof dueDate !== 'string' || typeof reviewDueDate !== 'string' || Boolean(dueDate) !== Boolean(reviewDueDate) || (dueDate && (!requestDate(dueDate) || !requestDate(reviewDueDate) || reviewDueDate < dueDate))) throw new AuditRequestError('dates');
  const timeZone = validateRequestTimeZone(v.timeZone === undefined ? 'UTC' : v.timeZone);
  return { dueDate, reviewDueDate, timeZone };
}
export function workpaperDueAt(p: { status: string; dueDate?: string; reviewDueDate?: string; timeZone?: string }) {
  const schedule = validateWorkpaperSchedule(p);
  if (!schedule.dueDate || !['draft', 'submitted'].includes(p.status)) return '';
  return requestDueAt(p.status === 'submitted' ? schedule.reviewDueDate : schedule.dueDate, schedule.timeZone);
}
