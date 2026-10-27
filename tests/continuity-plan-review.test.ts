import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/enterprise-route-fixture';
import { projectEnterpriseWork } from '../app/enterprise-work';
import { minimumNextPlanReview, validPlanReviewDate } from '../app/continuity/plan';

const stamp = '2020-01-01T12:00:00.000Z';
const future = (days = 730) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const actor = { id: 'reviewer', email: 'reviewer@example.com', name: 'Reviewer', role: 'Admin' as const, source: 'local' as const };
const request = (patch: Record<string, unknown> = {}) => ({ action: 'review-plan', planId: 'BCP-1', requestId: 'BPR-00000000-0000-4000-8000-000000000001', expectedRevision: stamp, nextReviewDate: future(), note: 'Reviewed dependencies, recovery targets and the communication strategy.', confirmation: 'PLAN REVIEWED', ...patch });

async function setup() {
  const f = fixture('continuity'); await f.post({});
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(actor.id, actor.name, actor.email, actor.role, 'Active');
  const row = { id: 'BCP-1', code: 'BCP-001', name: 'Payment recovery plan', process: 'Payment processing', bia_ref: 'BIA-001', criticality: 'high', owner: 'owner@example.com', reviewer: actor.email, crisis_lead: 'lead@example.com', rto_hours: 4, rpo_hours: 1, mtpd_hours: 12, dependencies: 'Identity and database services', recovery_strategy: 'Restore services in a secondary region and verify data.', communication_plan: 'Notify the crisis team and affected service owners.', alternate_site: 'DR region', supplier_dependencies: 'Telecom and cloud', minimum_staff: 4, review_date: '2020-01-01', status: 'active', version: 1, created_by: 'creator@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  f.sqlite.prepare(`INSERT INTO enterprise_continuity_plans(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  f.setActor(actor);
  await f.get('view=review&planId=BCP-1');
  return f;
}
const current = (f: Awaited<ReturnType<typeof setup>>) => f.sqlite.prepare('SELECT * FROM enterprise_continuity_plans WHERE id=?').get('BCP-1')!;
const count = (f: Awaited<ReturnType<typeof setup>>, table = 'enterprise_continuity_plan_reviews') => Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);

test('recording a periodic review atomically advances the queue date and retains the exact source snapshot', async () => {
  const f = await setup();
  try {
    const before = current(f), result = await f.post(request()); assert.equal(result.status, 200); assert.equal(result.body.replay, false);
    const after = current(f); assert.equal(after.review_date, future()); assert.equal(after.status, 'active'); assert.equal(after.version, 1); assert.equal(after.updated_by, actor.email);
    for (const key of Object.keys(before).filter(key => !['review_date', 'updated_by', 'updated_at'].includes(key))) assert.equal(after[key], before[key], key);
    assert.ok(String(after.updated_at) > stamp); assert.equal(count(f), 1); assert.equal(count(f, 'enterprise_continuity_events'), 1);
    const workspace = (await f.get('view=review&planId=BCP-1')).body as {plan:{reviewDate:string};reviews:{snapshot:{reviewDate:string;recoveryStrategy:string;updatedAt:string};actor:string;note:string}[];canReview:boolean};
    assert.equal(workspace.canReview, true); assert.equal(workspace.plan.reviewDate, future());
    assert.equal(workspace.reviews[0].snapshot.reviewDate, '2020-01-01'); assert.equal(workspace.reviews[0].snapshot.updatedAt, stamp);
    assert.equal(workspace.reviews[0].snapshot.recoveryStrategy, before.recovery_strategy); assert.equal(workspace.reviews[0].actor, actor.email);
    const queue = projectEnterpriseWork('continuity', (await f.get('view=work')).body); assert.equal(queue.complete, true);
    assert.equal(queue.rows[0].data.reviewer, actor.email); assert.equal(queue.rows[0].data.dueDate, future()); assert.equal(queue.rows[0].data.workClosed, false);
  } finally { f.sqlite.close(); }
});

test('lost-response retries return the recorded outcome, while altered retries cannot overwrite it', async () => {
  const f = await setup();
  try {
    assert.equal((await f.post(request())).status, 200); const after = current(f);
    assert.equal((await f.post(request())).body.replay, true); assert.deepEqual(current(f), after); assert.equal(count(f), 1);
    for (const patch of [{ note: 'A different justification for the same identity.' }, { nextReviewDate: future(731) }, { expectedRevision: String(after.updated_at) }]) assert.equal((await f.post(request(patch))).status, 409);
    f.sqlite.exec("UPDATE enterprise_continuity_plans SET status='retired' WHERE id='BCP-1'");
    assert.equal((await f.post(request())).body.replay, true, 'A retry reports the original result even after retirement');
    assert.equal((await f.post(request({ requestId: 'BPR-00000000-0000-4000-8000-000000000002', expectedRevision: after.updated_at }))).status, 409);
    assert.equal(count(f), 1); assert.equal(count(f, 'enterprise_continuity_events'), 1);
  } finally { f.sqlite.close(); }
});

test('only the assigned independent Admin may review; full readers see history without write authority', async () => {
  for (const [field, email] of [['owner', actor.email], ['crisis_lead', actor.email], ['created_by', actor.email], ['reviewer', 'someone@example.com']]) {
    const f = await setup(); try { f.sqlite.prepare(`UPDATE enterprise_continuity_plans SET ${field}=?`).run(email); assert.equal((await f.post(request())).status, 403); assert.equal((await f.get('view=review&planId=BCP-1')).body.canReview, false); assert.equal(count(f), 0); } finally { f.sqlite.close(); }
  }
  for (const role of ['Editor', 'Viewer'] as const) {
    const f = await setup(); try { f.setActor({ ...actor, role }); assert.equal((await f.post(request())).status, 403); assert.equal((await f.get('view=review&planId=BCP-1')).body.canReview, false); assert.equal(count(f), 0); } finally { f.sqlite.close(); }
  }
});

test('invalid dates, rationale, confirmation and request identities cannot advance a plan', async () => {
  const f = await setup();
  try {
    const before = current(f);
    for (const patch of [
      { nextReviewDate: '2026-02-31' }, { nextReviewDate: new Date().toISOString().slice(0, 10) }, { nextReviewDate: '2019-01-01' },
      { nextReviewDate: '2030-01-01junk' }, { note: 'Short' }, { note: 'x'.repeat(2001) }, { note: 'A sufficiently long\u0000 invalid reason' },
      { requestId: '../bad' }, { expectedRevision: '' }, { confirmation: 'yes' }, { planId: '../BCP-1' },
    ]) assert.equal((await f.post(request(patch))).status, 400, JSON.stringify(patch));
    assert.deepEqual(current(f), before); assert.equal(count(f), 0);
    f.sqlite.exec("UPDATE enterprise_continuity_plans SET review_date='9999-12-31'");
    assert.equal((await f.post(request())).status, 400, 'Maximum year cannot wrap the date comparison');
    for (const query of ['view=review', 'view=review&planId=BCP-1&planId=BCP-2', 'view=review&planId=../bad']) assert.equal((await f.get(query)).status, 400);
    assert.equal((await f.get('view=review&planId=absent')).status, 404);
    assert.equal(validPlanReviewDate('2028-02-29'), true); assert.equal(validPlanReviewDate('2027-02-29'), false);
    assert.equal(minimumNextPlanReview('2027-12-31', '2026-01-01'), '2028-01-01');
  } finally { f.sqlite.close(); }
});

test('stale sources, inactive plans and source races leave no partial review or event', async () => {
  for (const action of ['stale', 'retired', 'race-status', 'race-strategy', 'race-reviewer']) {
    const f = await setup();
    try {
      if (action === 'retired') f.sqlite.exec("UPDATE enterprise_continuity_plans SET status='retired'");
      if (action === 'race-status') f.before(() => { f.sqlite.exec("UPDATE enterprise_continuity_plans SET status='retired'"); });
      if (action === 'race-strategy') f.before(() => { f.sqlite.exec("UPDATE enterprise_continuity_plans SET recovery_strategy='Concurrent strategy change without a revision bump'"); });
      if (action === 'race-reviewer') f.before(() => { f.sqlite.exec("UPDATE enterprise_continuity_plans SET reviewer='other@example.com'"); });
      const result = await f.post(request(action === 'stale' ? { expectedRevision: '2020-01-02T12:00:00.000Z' } : {}));
      assert.equal(result.status, 409, action); assert.equal(current(f).review_date, '2020-01-01'); assert.equal(count(f), 0); assert.equal(count(f, 'enterprise_continuity_events'), 0);
    } finally { f.sqlite.close(); }
  }
});

test('live account and policy races are bound at the committing SQL statement', async () => {
  for (const sql of ["UPDATE local_users SET role='Viewer'", "UPDATE local_users SET status='Disabled'", "UPDATE local_users SET email='changed@example.com'", "INSERT INTO user_module_access VALUES('reviewer','{\"mode\":\"scoped\",\"modules\":{}}')", 'DELETE FROM local_users']) {
    const f = await setup();
    try { f.before(() => { f.sqlite.exec(sql); }); assert.equal((await f.post(request())).status, 409, sql); assert.equal(current(f).review_date, '2020-01-01'); assert.equal(count(f), 0); assert.equal(count(f, 'enterprise_continuity_events'), 0); }
    finally { f.sqlite.close(); }
  }
  const f = await setup(); try { f.sqlite.exec("UPDATE local_users SET status='Disabled'"); assert.equal((await f.post(request())).status, 403); assert.equal(count(f), 0); } finally { f.sqlite.close(); }
});

test('a competing decision cannot be overwritten by a stale review', async () => {
  const f = await setup();
  try {
    f.before(() => { f.sqlite.prepare('UPDATE enterprise_continuity_plans SET review_date=?,updated_at=?').run(future(731), '2026-01-01T10:00:00.000Z'); });
    assert.equal((await f.post(request())).status, 409); assert.equal(current(f).review_date, future(731)); assert.equal(count(f), 0);
  } finally { f.sqlite.close(); }
});

test('history/event insert failures roll back the plan date and every dependent write', async () => {
  for (const table of ['enterprise_continuity_plan_reviews', 'enterprise_continuity_events']) {
    const f = await setup();
    try {
      const before = current(f); f.sqlite.exec(`CREATE TRIGGER fail_review BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced-history-failure'); END`);
      assert.equal((await f.post(request())).status, 400); assert.deepEqual(current(f), before); assert.equal(count(f), 0); assert.equal(count(f, 'enterprise_continuity_events'), 0);
    } finally { f.sqlite.close(); }
  }
});

test('migration is additive and retained review decisions reject update and deletion', async () => {
  const f = await setup();
  try {
    const before = current(f); f.sqlite.exec(readFileSync('drizzle/0098_continuity_plan_reviews.sql', 'utf8')); assert.deepEqual(current(f), before);
    await f.post(request());
    assert.throws(() => f.sqlite.exec("UPDATE enterprise_continuity_plan_reviews SET note='changed'"), /immutable-plan-review/);
    assert.throws(() => f.sqlite.exec('DELETE FROM enterprise_continuity_plan_reviews'), /immutable-plan-review/);
  } finally { f.sqlite.close(); }
});

test('history exposes the latest 20 with explicit bounds and unreadable snapshots are not trusted', async () => {
  const f = await setup();
  try {
    for (let i = 1; i <= 21; i++) {
      const result = await f.post(request({ requestId: `BPR-00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, expectedRevision: current(f).updated_at, nextReviewDate: future(730 + i) })); assert.equal(result.status, 200);
    }
    let result = (await f.get('view=review&planId=BCP-1')).body;
    assert.equal(result.hasMore, true); assert.equal((result.reviews as unknown[]).length, 20); assert.equal(count(f), 21); assert.equal(result.historyVerified, true);
    f.sqlite.exec("DROP TRIGGER continuity_plan_review_no_update;UPDATE enterprise_continuity_plan_reviews SET snapshot_json='{}'");
    result = (await f.get('view=review&planId=BCP-1')).body; assert.equal(result.historyVerified, false); assert.ok((result.reviews as {snapshot:unknown}[]).every(row => row.snapshot === null));
  } finally { f.sqlite.close(); }
});
