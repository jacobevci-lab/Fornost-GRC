import { AuditRequestError, requestDate, requestIdentity } from './audit-requests';

export type AuditReminderProfile = { mode: 'calendar' | 'business'; weekdays: number[]; holidays: string[]; beforeDays: number; overdueDays: number; escalationDays: number; escalationRecipient: string };
export type SavedAuditReminderProfile = { revision: string; profile: AuditReminderProfile };
export const defaultAuditReminderProfile: AuditReminderProfile = { mode: 'calendar', weekdays: [1, 2, 3, 4, 5], holidays: [], beforeDays: 1, overdueDays: 3, escalationDays: 0, escalationRecipient: '' };
export function validateAuditReminderProfile(value: unknown): AuditReminderProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuditRequestError('reminder-profile');
  const p = value as AuditReminderProfile;
  if (!['calendar', 'business'].includes(p.mode) || !Array.isArray(p.weekdays) || !p.weekdays.length || p.weekdays.length > 7 || p.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6) || new Set(p.weekdays).size !== p.weekdays.length) throw new AuditRequestError('reminder-profile');
  if (!Array.isArray(p.holidays) || p.holidays.length > 366 || p.holidays.some(d => !requestDate(d)) || new Set(p.holidays).size !== p.holidays.length) throw new AuditRequestError('reminder-profile');
  for (const n of [p.beforeDays, p.overdueDays, p.escalationDays]) if (!Number.isInteger(n) || n < 0 || n > 90) throw new AuditRequestError('reminder-profile');
  if (p.overdueDays < 1 || (p.escalationDays && p.escalationDays < p.overdueDays) || typeof p.escalationRecipient !== 'string' || p.escalationRecipient.length > 320) throw new AuditRequestError('reminder-profile');
  const recipient = requestIdentity(p.escalationRecipient);
  if (p.escalationDays && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new AuditRequestError('reminder-profile');
  return { mode: p.mode, weekdays: [...p.weekdays].sort(), holidays: [...p.holidays].sort(), beforeDays: p.beforeDays, overdueDays: p.overdueDays, escalationDays: p.escalationDays, escalationRecipient: p.escalationDays ? recipient : '' };
}
export function reminderLocalDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const shift = (day: string, amount: number) => new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
export function reminderWorkingDay(day: string, p: AuditReminderProfile) {
  return p.mode === 'calendar' || (p.weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) && !p.holidays.includes(day));
}
/** Calendar dates, never elapsed 24-hour periods: stable across DST and time zones. */
export function reminderMilestones(due: string, p: AuditReminderProfile) {
  if (!requestDate(due)) throw new AuditRequestError('dates');
  let anchor = due;
  for (let i = 0; !reminderWorkingDay(anchor, p); i++) { if (i > 3000) throw new AuditRequestError('reminder-profile'); anchor = shift(anchor, 1); }
  const move = (amount: number) => {
    let day = anchor, remaining = Math.abs(amount);
    for (let i = 0; remaining; i++) { if (i > 5000) throw new AuditRequestError('reminder-profile'); day = shift(day, amount < 0 ? -1 : 1); if (reminderWorkingDay(day, p)) remaining--; }
    return day;
  };
  return { before: move(-p.beforeDays), due: anchor, overdue: move(p.overdueDays), escalation: p.escalationDays ? move(p.escalationDays) : '' };
}
