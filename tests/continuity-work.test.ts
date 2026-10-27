import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { projectEnterpriseWork } from '../app/enterprise-work';
import { matchesWorkIdentity, workCompletionDate } from '../app/work-queue';
import { fixture } from './helpers/enterprise-route-fixture';
import { scopedApiAllowed } from '../app/module-access';

const plan = { id: 'BCP-1', code: 'BCP-001', name: 'Payment recovery', status: 'active', owner: 'owner@example.com', reviewer: 'reviewer@example.com', crisisLead: 'crisis@example.com', reviewDate: '2026-12-01', updatedAt: '2026-10-27T12:00:00Z' };
const exercise = { id: 'BCE-1', code: 'BCE-001', planId: plan.id, type: 'technical', status: 'completed', facilitator: 'facilitator@example.com', scheduledDate: '2026-10-25', createdAt: '2026-10-01T10:00:00Z', completedAt: '2026-10-25T12:00:00Z' };
const gap = { id: 'BCG-1', planId: plan.id, exerciseId: exercise.id, title: 'Improve recovery', status: 'open', owner: plan.owner, reviewer: plan.reviewer, dueDate: '2026-11-01', severity: 'high' };
const payload = () => ({ plans: [{ ...plan }], exercises: [{ ...exercise }], gaps: [{ ...gap }], complete: true });
const project = (value: unknown) => projectEnterpriseWork('continuity', value);

test('continuity assignments follow canonical lifecycle without invented approval deadlines', () => {
  for (const status of ['draft', 'approved', 'active', 'retired']) {
    const result = project({ ...payload(), plans: [{ ...plan, status, completedAt: status === 'retired' ? '2026-10-27T12:00:00Z' : null }] });
    assert.equal(result.complete, true);
    const row = result.rows.find(row => row.workKind === 'continuity-plan')!;
    assert.equal(row.nativeRef, plan.id); assert.equal(row.module, 'İş Sürekliliği');
    assert.equal(row.data.owner, plan.owner); assert.equal(row.data.actionOwner, plan.crisisLead);
    assert.equal(row.data.reviewer, ['draft', 'active'].includes(status) ? plan.reviewer : '');
    assert.equal(row.data.workWaitingForReview, status === 'draft');
    assert.equal(row.data.dueDate, status === 'active' ? plan.reviewDate : '');
    assert.equal(row.data.workClosed, status === 'retired');
  }
  for (const status of ['planned', 'completed', 'cancelled']) {
    const result = project({ ...payload(), exercises: [{ ...exercise, status }], gaps: [] });
    const row = result.rows.find(row => row.workKind === 'continuity-exercise')!;
    assert.equal(result.complete, true); assert.equal(row.data.owner, exercise.facilitator);
    assert.equal(row.data.reviewer, undefined); assert.equal(row.data.dueDate, exercise.scheduledDate);
    assert.equal(row.data.workClosed, status !== 'planned');
    assert.equal(matchesWorkIdentity([String(row.data.owner)], { email: exercise.facilitator + '.other' }), false);
  }
  for (const status of ['open', 'closed']) {
    const row = project({ ...payload(), gaps: [{ ...gap, status }] }).rows.find(row => row.workKind === 'continuity-gap')!;
    assert.equal(row.data.reviewer, gap.reviewer); assert.equal(row.data.owner, gap.owner);
    assert.equal(row.data.dueDate, gap.dueDate); assert.equal(row.data.workClosed, status === 'closed');
    assert.equal(row.data.workWaitingForReview, undefined, 'No gap submission/review stage is inferred');
  }
});

test('completion uses the terminal decision timestamp, never recent creation or later edits', () => {
  const result = project({ ...payload(), plans: [{ ...plan, status: 'retired', completedAt: '2020-01-01T00:00:00Z' }], exercises: [{ ...exercise, status: 'cancelled', completedAt: null }], gaps: [] });
  assert.equal(workCompletionDate(result.rows[0]), '2020-01-01T00:00:00Z');
  assert.equal(workCompletionDate(result.rows[1]), '');
  assert.equal(workCompletionDate(project(payload()).rows.find(row => row.workKind === 'continuity-exercise')!), exercise.completedAt);
  assert.equal(workCompletionDate({ updatedAt: 'existing-source' }), 'existing-source');
});

test('corrupt, duplicate, orphaned, mismatched and incomplete continuity sources stay explicitly incomplete', () => {
  for (const change of [
    { complete: false }, { plans: null }, { plans: [plan, plan] },
    { plans: [{ ...plan, status: 'unknown' }] }, { plans: [{ ...plan, reviewer: plan.owner }] },
    { plans: [{ ...plan, reviewDate: '2026-02-31' }] },
    { exercises: [{ ...exercise, facilitator: 'owner@example.com;intruder@example.com' }] },
    { exercises: [{ ...exercise, completedAt: 'not-a-date' }] },
    { exercises: [{ ...exercise, planId: 'absent' }] },
    { gaps: [{ ...gap, exerciseId: 'absent' }] },
    { gaps: [{ ...gap, owner: gap.reviewer }] },
  ]) assert.equal(project({ ...payload(), ...change }).complete, false, JSON.stringify(change));
  const mismatch = project({ ...payload(), plans: [plan, { ...plan, id: 'BCP-2' }], gaps: [{ ...gap, planId: 'BCP-2' }] });
  assert.equal(mismatch.complete, false); assert.ok(!mismatch.rows.some(row => row.workKind === 'continuity-gap'));
  assert.equal(project({ plans: [], exercises: [], gaps: [], complete: true }).complete, true);
});

function seed(db: DatabaseSync, table: string, values: Record<string, string | number>) {
  const row: Record<string, string | number> = {};
  for (const column of db.prepare(`PRAGMA table_info(${table})`).all()) if (column.notnull && !column.dflt_value) row[String(column.name)] = ['INTEGER', 'REAL'].includes(String(column.type)) ? 1 : 'fixture';
  Object.assign(row, values);
  db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
}

test('actual queue GET reads minimal metadata and cancellation event time without mutation', async () => {
  const f = fixture('continuity');
  try {
    await f.get('view=work');
    seed(f.sqlite, 'enterprise_continuity_plans', { id: plan.id, code: plan.code, name: plan.name, status: 'active', owner: plan.owner, reviewer: plan.reviewer, crisis_lead: plan.crisisLead, review_date: plan.reviewDate, recovery_strategy: 'private narrative', communication_plan: 'private narrative' });
    seed(f.sqlite, 'enterprise_continuity_exercises', { id: 'cancelled', code: 'cancelled', plan_id: plan.id, type: 'technical', status: 'cancelled', facilitator: exercise.facilitator, scheduled_date: exercise.scheduledDate, scenario: 'private narrative' });
    for (const [id, entityType, action, time] of [['cancel', 'exercise', 'cancel', '2026-10-21T10:00:00Z'], ['later', 'exercise', 'reschedule', '2026-10-22T10:00:00Z'], ['wrong', 'gap', 'cancel', '2026-10-23T10:00:00Z']]) seed(f.sqlite, 'enterprise_continuity_events', { id, entity_type: entityType, entity_id: 'cancelled', action, created_at: time });
    const before = f.sqlite.prepare('SELECT total_changes() n').get()!.n;
    const result = await f.get('view=work');
    assert.equal(result.status, 200); assert.equal(result.body.complete, true);
    assert.equal((result.body.exercises as {completedAt: string}[])[0].completedAt, '2026-10-21T10:00:00Z');
    assert.doesNotMatch(JSON.stringify(result.body), /private narrative|scenario|recoveryStrategy|evidence|events|detail|sha256/i);
    assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()!.n, before);
    assert.equal(project(result.body).complete, true);
    for (const role of ['Viewer', 'Editor']) {
      assert.equal(scopedApiAllowed({ role, moduleAccess: { mode: 'full' } }, '/api/continuity', 'GET'), true);
      assert.equal(scopedApiAllowed({ role, moduleAccess: { mode: 'scoped', modules: { BIA: 'read' } } }, '/api/continuity', 'GET'), false);
    }
  } finally { f.sqlite.close(); }
});

test('the source distinguishes exactly 2000 records from overflow and prioritizes active work', async () => {
  const f = fixture('continuity');
  try {
    await f.get('view=work');
    for (let i = 0; i < 2000; i++) seed(f.sqlite, 'enterprise_continuity_plans', { id: 'BCP-' + i, code: 'BCP-' + i, name: 'Retired plan', status: 'retired', owner: plan.owner, reviewer: plan.reviewer, crisis_lead: plan.crisisLead, review_date: plan.reviewDate });
    let result = await f.get('view=work'); assert.equal(result.body.complete, true); assert.equal(project(result.body).complete, true);
    seed(f.sqlite, 'enterprise_continuity_plans', { id: 'BCP-active', code: 'BCP-active', name: plan.name, status: 'active', owner: plan.owner, reviewer: plan.reviewer, crisis_lead: plan.crisisLead, review_date: '2099-01-01' });
    result = await f.get('view=work'); assert.equal(result.body.complete, false);
    assert.equal((result.body.plans as {id:string}[]).length, 2000); assert.equal((result.body.plans as {id:string}[])[0].id, 'BCP-active');
    assert.equal(project(result.body).complete, false);
  } finally { f.sqlite.close(); }
});
