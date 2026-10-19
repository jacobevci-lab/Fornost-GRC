import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAuditReminderProfile as defaults, reminderMilestones, reminderLocalDate, validateAuditReminderProfile } from '../app/audit-reminder-profile';
import { auditRequestNotifications } from '../app/audit-request-notifications';
import type { AuditRequest } from '../app/audit-requests';
const business = { ...defaults, mode: 'business' as const, holidays: ['2026-10-29'], escalationDays: 5, escalationRecipient: 'manager@example.com' };
const row = { id: 'ARQ-1', revision: 'r1', status: 'assigned', owner: 'owner@example.com', reviewer: 'reviewer@example.com', dueDate: '2026-10-30', reviewDueDate: '2026-11-02' } as AuditRequest;
test('calendar compatibility, holiday skipping, weekend anchor and custom weekends', () => {
  assert.deepEqual(reminderMilestones('2026-10-30', defaults), { before: '2026-10-29', due: '2026-10-30', overdue: '2026-11-02', escalation: '' });
  assert.deepEqual(reminderMilestones('2026-10-30', business), { before: '2026-10-28', due: '2026-10-30', overdue: '2026-11-04', escalation: '2026-11-06' });
  assert.equal(reminderMilestones('2026-10-31', business).due, '2026-11-02');
  assert.equal(reminderMilestones('2026-10-30', { ...business, weekdays: [0,1,2,3,4] }).due, '2026-11-01');
});
test('invalid profiles fail closed, including duplicates, impossible dates and unordered escalation', () => {
  for (const patch of [{weekdays:[]},{weekdays:[1,1]},{holidays:['2026-02-30']},{holidays:['2026-01-01','2026-01-01']},{beforeDays:NaN},{beforeDays:91},{overdueDays:0},{escalationDays:2},{escalationRecipient:'bad'},{mode:'other'}]) assert.throws(() => validateAuditReminderProfile({...business,...patch}));
  assert.equal(validateAuditReminderProfile({...business,escalationRecipient:' MANAGER@EXAMPLE.COM '}).escalationRecipient,'manager@example.com');
});
test('non-working days pause all notifications; downtime queues latest milestone and distinct escalation only', () => {
  const saved = {revision:'p1',profile:business};
  assert.equal(auditRequestNotifications(row,'Europe/Istanbul',new Date('2026-10-29T12:00Z'),saved).length,0);
  assert.equal(auditRequestNotifications(row,'Europe/Istanbul',new Date('2026-10-31T12:00Z'),saved).length,0);
  const notices = auditRequestNotifications(row,'Europe/Istanbul',new Date('2026-11-09T12:00Z'),saved);
  assert.deepEqual(notices.map(n=>[n.recipient,n.milestone]),[['owner@example.com','overdue'],['manager@example.com','escalation']]);
  assert.equal(auditRequestNotifications(row,'UTC',new Date('2026-11-09T12:00Z'),{...saved,profile:{...business,escalationRecipient:row.owner}}).length,1);
  assert.equal(auditRequestNotifications({...row,status:'accepted'},'UTC',new Date(),saved).length,0);
  assert.notEqual(notices[0].id,auditRequestNotifications(row,'Europe/Istanbul',new Date('2026-11-09T12:00Z'),{...saved,revision:'p2'})[0].id);
});
test('local dates and reviewer deadlines remain correct around DST and midnight', () => {
  assert.equal(reminderLocalDate(new Date('2026-11-01T03:30Z'),'America/New_York'),'2026-10-31');
  assert.equal(reminderLocalDate(new Date('2026-11-01T06:30Z'),'America/New_York'),'2026-11-01');
  const notices=auditRequestNotifications({...row,status:'submitted'},'Europe/Istanbul',new Date('2026-11-01T22:00Z'),{revision:'p',profile:business});
  assert.equal(notices[0].recipient,row.reviewer);assert.equal(notices[0].milestone,'due');assert.equal(notices[0].due,row.reviewDueDate);
});
