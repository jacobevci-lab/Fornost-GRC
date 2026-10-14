import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRequestProgress } from '../app/audit-request-progress';
import { emptyAuditRequest, type AuditRequest, type AuditRequestWorkflow } from '../app/audit-requests';
const workflow: AuditRequestWorkflow = { auditId: 'AUD-a', state: 'active', revision: 'r1', timeZone: 'Europe/Istanbul', planRevision: '' };
const row = (id: string, status: AuditRequest['status'], dueDate = '2026-10-14', reviewDueDate = '2026-10-16'): AuditRequest => ({ ...emptyAuditRequest, id, status, dueDate, reviewDueDate, owner: 'owner@example.com', reviewer: 'reviewer@example.com', auditId: 'AUD-a', revision: 'r1', evidence: [], submittedBy: '', note: '', createdAt: '', updatedAt: '' });

test('outstanding includes unpublished drafts and returned work; cancellation is separate from acceptance', () => {
  const rows = [row('d', 'draft'), row('a', 'assigned'), row('s', 'submitted'), row('r', 'changes_requested'), row('ok', 'accepted'), row('x', 'cancelled')];
  const result = auditRequestProgress(rows, workflow, true, new Date('2026-10-14T20:59:59Z'));
  assert.deepEqual(result.pendingIds, ['d', 'a', 's', 'r']); assert.equal(result.state, 'pending');
  assert.equal(result.counts.accepted, 1); assert.equal(result.counts.cancelled, 1); assert.deepEqual(result.overdueIds, []);
  assert.equal(auditRequestProgress([rows[4], rows[5]], workflow, true).state, 'resolved');
  const cancelled = auditRequestProgress([rows[5]], workflow, true); assert.equal(cancelled.state, 'resolved'); assert.equal(cancelled.counts.accepted, 0);
});

test('overdue uses workflow local calendar and switches to the review deadline after submission', () => {
  const rows = [row('a', 'assigned'), row('s', 'submitted'), row('r', 'changes_requested'), row('d', 'draft'), row('ok', 'accepted')];
  assert.deepEqual(auditRequestProgress(rows, workflow, true, new Date('2026-10-14T20:59:59Z')).overdueIds, []);
  assert.deepEqual(auditRequestProgress(rows, workflow, true, new Date('2026-10-14T21:00:00Z')).overdueIds, ['a', 'r']);
  assert.deepEqual(auditRequestProgress(rows, workflow, true, new Date('2026-10-16T21:00:00Z')).overdueIds, ['a', 's', 'r']);
});

test('DST calendar boundary is respected', () => {
  const rows = [row('a', 'assigned', '2026-11-01')], zone = { ...workflow, timeZone: 'America/New_York' };
  assert.deepEqual(auditRequestProgress(rows, zone, true, new Date('2026-11-02T04:59:59Z')).overdueIds, []);
  assert.deepEqual(auditRequestProgress(rows, zone, true, new Date('2026-11-02T05:00:00Z')).overdueIds, ['a']);
});

test('empty, unstarted, incomplete and unknown states never claim resolved work', () => {
  assert.equal(auditRequestProgress([], workflow, true).state, 'empty');
  assert.equal(auditRequestProgress([row('a', 'accepted')], { ...workflow, state: 'draft' }, true).state, 'draft');
  assert.equal(auditRequestProgress([row('a', 'accepted')], workflow, false).state, 'incomplete');
  assert.equal(auditRequestProgress([row('a', 'unknown' as AuditRequest['status'])], workflow, true).state, 'incomplete');
});

test('invalid clocks and dates disclose unavailable overdue counts', () => {
  assert.equal(auditRequestProgress([row('a', 'assigned')], { ...workflow, timeZone: 'Mars/City' }, true).clockComplete, false);
  assert.equal(auditRequestProgress([row('a', 'assigned', '2026-02-30')], workflow, true).clockComplete, false);
  assert.deepEqual(auditRequestProgress([row('a', 'draft')], { ...workflow, state: 'draft' }, true).overdueIds, []);
});
