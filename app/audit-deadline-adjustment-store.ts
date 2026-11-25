import { AuditRequestError } from './audit-requests';
import { validateAuditReminderProfile } from './audit-reminder-profile';
import { planDeadlineAdjustment, sameDeadlineDates, validateDeadlineAdjustmentInput, type DeadlineDates, type DeadlineAdjustment } from './audit-deadline-adjustment';

/** Called after the parent schema and normal record permissions are checked. No new write path. */
export async function prepareDeadlineAdjustment(db: D1Database, auditId: string, action: string, value: unknown, fields: Partial<DeadlineDates>) {
  if (value === undefined) return null;
  if (action !== 'save') throw new AuditRequestError('deadline-adjustment');
  const input = validateDeadlineAdjustmentInput(value);
  const raw = await db.prepare('SELECT revision,data_json FROM audit_reminder_profiles WHERE audit_id=?').bind(auditId).first<{ revision: string; data_json: string }>();
  if (!raw || raw.revision !== input.profileRevision) throw new AuditRequestError('deadline-calendar-conflict', 409);
  const profile = validateAuditReminderProfile(JSON.parse(raw.data_json));
  const before = { dueDate: input.dueDate, reviewDueDate: input.reviewDueDate, timeZone: input.timeZone };
  const after = planDeadlineAdjustment({ revision: raw.revision, profile }, before);
  if (!sameDeadlineDates(after, fields) || sameDeadlineDates(before, after)) throw new AuditRequestError('deadline-adjustment');
  const snapshot: DeadlineAdjustment = { version: 1, rule: 'next-working-day', profileRevision: raw.revision, reason: input.reason, before, after,
    calendar: { weekdays: profile.weekdays, holidays: profile.holidays, ...(profile.calendarSource ? { calendarSource: profile.calendarSource } : {}) } };
  return { snapshot, revision: raw.revision, raw: raw.data_json };
}

// Exact profile contents and revision are checked inside the record/history transaction.
export const deadlineCalendarGuard = `AND (?=0 OR EXISTS(SELECT 1 FROM audit_reminder_profiles WHERE audit_id=? AND revision=? AND data_json=?))`;
