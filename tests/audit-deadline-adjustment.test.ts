import test from 'node:test';
import assert from 'node:assert/strict';
import { planDeadlineAdjustment, validateDeadlineAdjustmentInput } from '../app/audit-deadline-adjustment';
import { defaultAuditReminderProfile } from '../app/audit-reminder-profile';
const saved = { revision: 'r1', profile: { ...defaultAuditReminderProfile, mode: 'business' as const, holidays: ['2026-10-26'] } };
const dates = { dueDate: '2026-10-24', reviewDueDate: '2026-10-25', timeZone: 'Europe/Istanbul' };
test('working-day dates move independently over weekends and holidays, with explicit convergence and unchanged working dates', () => {
  assert.deepEqual(planDeadlineAdjustment(saved, dates), { ...dates, dueDate: '2026-10-27', reviewDueDate: '2026-10-27' });
  assert.deepEqual(planDeadlineAdjustment(saved, { ...dates, dueDate: '2026-10-23', reviewDueDate: '' }), { ...dates, dueDate: '2026-10-23', reviewDueDate: '' });
  assert.deepEqual(saved.profile.holidays, ['2026-10-26']);
});
test('nonstandard weekends, leap days, year boundaries and DST remain date-only', () => {
  const sunday = { ...saved, profile: { ...saved.profile, weekdays: [0], holidays: [] } };
  assert.equal(planDeadlineAdjustment(sunday, { ...dates, dueDate: '2026-12-31', reviewDueDate: '', timeZone: 'America/New_York' }).dueDate, '2027-01-03');
  assert.equal(planDeadlineAdjustment(saved, { ...dates, dueDate: '2028-02-29', reviewDueDate: '' }).dueDate, '2028-02-29');
  assert.equal(planDeadlineAdjustment(saved, { ...dates, dueDate: '2026-11-01', reviewDueDate: '', timeZone: 'America/New_York' }).dueDate, '2026-11-02');
});
test('bounded one-day workweeks with 366 holidays terminate and date overflow fails closed', () => {
  const first = Date.parse('2026-10-25T12:00:00Z');
  const calendar = { ...saved, profile: { ...saved.profile, weekdays: [0], holidays: Array.from({ length: 366 }, (_, i) => new Date(first + i * 7 * 86400000).toISOString().slice(0, 10)) } };
  assert.equal(planDeadlineAdjustment(calendar, { ...dates, dueDate: '2026-10-25', reviewDueDate: '' }).dueDate, new Date(first + 366 * 7 * 86400000).toISOString().slice(0, 10));
  assert.throws(() => planDeadlineAdjustment({ ...saved, profile: { ...saved.profile, holidays: ['9999-12-31'] } }, { ...dates, dueDate: '9999-12-31', reviewDueDate: '' }), /dates/);
});
test('invalid calendars, dates, review order, zones and forged input metadata are rejected', () => {
  for (const patch of [{ dueDate: '2026-02-30' }, { reviewDueDate: '2026-10-23' }, { timeZone: 'Mars/Base' }]) assert.throws(() => planDeadlineAdjustment(saved, { ...dates, ...patch }));
  assert.throws(() => planDeadlineAdjustment({ ...saved, profile: defaultAuditReminderProfile }, dates), /deadline-calendar/);
  assert.throws(() => planDeadlineAdjustment({ ...saved, profile: { ...saved.profile, weekdays: [] } }, dates));
  const input = { ...dates, profileRevision: 'r1', reason: 'Use the approved working calendar' };
  assert.deepEqual(validateDeadlineAdjustmentInput(input), input);
  for (const patch of [{ reason: '' }, { profileRevision: '' }, { after: { dueDate: '2099-01-01' } }, { reviewDueDate: null }]) assert.throws(() => validateDeadlineAdjustmentInput({ ...input, ...patch }));
});
