import { AuditRequestError } from './audit-requests';
import { validateAuditReminderProfile } from './audit-reminder-profile';
import { planBatchDeadlineDates, validateBatchDeadlineAdjustment } from './audit-milestone-batch-deadlines';
import type { MilestoneBatchItem } from './audit-milestone-batch';
import type { DeadlineAdjustment } from './audit-deadline-adjustment';

export async function prepareBatchDeadlineAdjustment(db: D1Database, auditId: string, value: unknown, items: MilestoneBatchItem[]) {
  if (value === undefined) return null;
  const input = validateBatchDeadlineAdjustment(value);
  // Every selected task is bound by identity, including dates that stay unchanged.
  if (input.dates.length !== items.length || items.some(item => !input.dates.some(row => row.id === item.id) || item.fields.timeZone !== input.timeZone)) throw new AuditRequestError('deadline-adjustment');
  const raw = await db.prepare('SELECT revision,data_json FROM audit_reminder_profiles WHERE audit_id=?').bind(auditId).first<{ revision: string; data_json: string }>();
  if (!raw || raw.revision !== input.profileRevision) throw new AuditRequestError('deadline-calendar-conflict', 409);
  const profile = validateAuditReminderProfile(JSON.parse(raw.data_json));
  const after = planBatchDeadlineDates({ revision: raw.revision, profile }, input.dates, input.timeZone);
  if (items.some(item => after.find(row => row.id === item.id)?.dueDate !== item.fields.dueDate) || after.every((row, i) => row.dueDate === input.dates[i].dueDate)) throw new AuditRequestError('deadline-adjustment');
  const snapshots = new Map<string, DeadlineAdjustment>();
  for (const before of input.dates) snapshots.set(before.id, {
    version: 1, rule: 'next-working-day', profileRevision: raw.revision, reason: input.reason,
    before: { dueDate: before.dueDate, reviewDueDate: '', timeZone: input.timeZone },
    after: { dueDate: after.find(row => row.id === before.id)!.dueDate, reviewDueDate: '', timeZone: input.timeZone },
    calendar: { weekdays: profile.weekdays, holidays: profile.holidays, ...(profile.calendarSource ? { calendarSource: profile.calendarSource } : {}) },
  });
  return { snapshots, revision: raw.revision, raw: raw.data_json };
}
