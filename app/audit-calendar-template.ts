import { defaultAuditReminderProfile, validateAuditReminderProfile, type AuditReminderProfile } from './audit-reminder-profile';
export type AuditCalendar = Pick<AuditReminderProfile, 'mode' | 'weekdays' | 'holidays'>;
export const CALENDAR_TEMPLATE_BYTES = 16_384;
const format = 'fornost-audit-calendar';
export function validateAuditCalendar(value: unknown): AuditCalendar {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('calendar');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'holidays,mode,weekdays') throw Error('calendar');
  const profile = validateAuditReminderProfile({ ...defaultAuditReminderProfile, ...v });
  return { mode: profile.mode, weekdays: profile.weekdays, holidays: profile.holidays };
}
export function exportAuditCalendar(calendar: AuditCalendar) {
  return JSON.stringify({ format, version: 1, calendar: validateAuditCalendar(calendar) }, null, 2) + '\n';
}
export function importAuditCalendar(text: string): AuditCalendar {
  if (new TextEncoder().encode(text).length > CALENDAR_TEMPLATE_BYTES) throw Error('size');
  const v = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'calendar,format,version' || v.format !== format || v.version !== 1) throw Error('calendar');
  return validateAuditCalendar(v.calendar);
}
