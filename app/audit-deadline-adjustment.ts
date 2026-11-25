import { AuditRequestError, requestDate, validateRequestTimeZone } from './audit-requests';
import { reminderWorkingDay, validateAuditReminderProfile, type SavedAuditReminderProfile } from './audit-reminder-profile';

export type DeadlineDates = { dueDate: string; reviewDueDate: string; timeZone: string };
export type DeadlineAdjustmentInput = DeadlineDates & { profileRevision: string; reason: string };
export type DeadlineAdjustment = {
  version: 1; rule: 'next-working-day'; profileRevision: string; reason: string;
  before: DeadlineDates; after: DeadlineDates;
  calendar: Pick<SavedAuditReminderProfile['profile'], 'weekdays' | 'holidays' | 'calendarSource'>;
};

/** Date-only arithmetic. Each deadline moves forward independently; no elapsed-hour or gap assumption. */
export function planDeadlineAdjustment(saved: SavedAuditReminderProfile, dates: DeadlineDates) {
  const profile = validateAuditReminderProfile(saved.profile);
  if (profile.mode !== 'business') throw new AuditRequestError('deadline-calendar');
  if (!requestDate(dates.dueDate) || typeof dates.reviewDueDate !== 'string' ||
      (dates.reviewDueDate && (!requestDate(dates.reviewDueDate) || dates.reviewDueDate < dates.dueDate))) throw new AuditRequestError('dates');
  const timeZone = validateRequestTimeZone(dates.timeZone);
  const next = (initial: string) => {
    if (!initial) return '';
    let day = initial;
    // At most 366 holidays and at least one weekday: bounded even for one-day workweeks.
    for (let i = 0; i < 3000; i++) {
      if (reminderWorkingDay(day, profile)) return day;
      day = new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
      if (!requestDate(day)) throw new AuditRequestError('dates');
    }
    throw new AuditRequestError('deadline-calendar');
  };
  return { dueDate: next(dates.dueDate), reviewDueDate: next(dates.reviewDueDate), timeZone };
}

export function validateDeadlineAdjustmentInput(value: unknown): DeadlineAdjustmentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditRequestError('deadline-adjustment');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'dueDate,profileRevision,reason,reviewDueDate,timeZone' ||
      typeof v.profileRevision !== 'string' || !v.profileRevision || v.profileRevision.length > 100 ||
      typeof v.reason !== 'string' || v.reason.trim().length < 3 || v.reason.length > 1000 ||
      !requestDate(v.dueDate) || typeof v.reviewDueDate !== 'string' ||
      (v.reviewDueDate && (!requestDate(v.reviewDueDate) || v.reviewDueDate < String(v.dueDate)))) throw new AuditRequestError('deadline-adjustment');
  return { dueDate: String(v.dueDate), reviewDueDate: v.reviewDueDate, timeZone: validateRequestTimeZone(v.timeZone), profileRevision: v.profileRevision, reason: v.reason.trim() };
}

export function sameDeadlineDates(a: Partial<DeadlineDates>, b: Partial<DeadlineDates>) {
  return (a.dueDate || '') === (b.dueDate || '') && (a.reviewDueDate || '') === (b.reviewDueDate || '') && (a.timeZone || 'UTC') === (b.timeZone || 'UTC');
}
