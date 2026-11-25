import { AuditRequestError } from './audit-requests';
import { planDeadlineAdjustment, validateDeadlineAdjustmentInput } from './audit-deadline-adjustment';
import type { SavedAuditReminderProfile } from './audit-reminder-profile';

export type BatchDeadlineDate = { id: string; dueDate: string };
export type BatchDeadlineAdjustmentInput = { profileRevision: string; reason: string; timeZone: string; dates: BatchDeadlineDate[] };

export function validateBatchDeadlineAdjustment(value: unknown): BatchDeadlineAdjustmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditRequestError('deadline-adjustment');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'dates,profileRevision,reason,timeZone' || !Array.isArray(v.dates) || !v.dates.length || v.dates.length > 12) throw new AuditRequestError('deadline-adjustment');
  const ids = new Set<string>();
  const dates = v.dates.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'dueDate,id' || typeof row.id !== 'string' || !/^AMT-[a-f0-9-]{36}$/.test(row.id) || ids.has(row.id)) throw new AuditRequestError('deadline-adjustment');
    ids.add(row.id);
    const input = validateDeadlineAdjustmentInput({ dueDate: row.dueDate, reviewDueDate: '', timeZone: v.timeZone, profileRevision: v.profileRevision, reason: v.reason });
    return { id: row.id, dueDate: input.dueDate };
  });
  const input = validateDeadlineAdjustmentInput({ dueDate: dates[0].dueDate, reviewDueDate: '', timeZone: v.timeZone, profileRevision: v.profileRevision, reason: v.reason });
  return { dates, profileRevision: input.profileRevision, reason: input.reason, timeZone: input.timeZone };
}

/** Preserve task identity and order. No dependency-duration or spacing inference. */
export function planBatchDeadlineDates(saved: SavedAuditReminderProfile, dates: BatchDeadlineDate[], timeZone: string): BatchDeadlineDate[] {
  const input = validateBatchDeadlineAdjustment({ dates, timeZone, profileRevision: saved.revision, reason: 'Preview working-day dates' });
  return input.dates.map(row => ({ id: row.id, dueDate: planDeadlineAdjustment(saved, { dueDate: row.dueDate, reviewDueDate: '', timeZone }).dueDate }));
}
