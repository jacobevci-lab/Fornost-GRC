import test from 'node:test';
import { defaultAuditReminderProfile } from '../app/audit-reminder-profile';
import { ensureAuditClosureSchema } from '../app/audit-closure-schema';
import { mutateWorkplan, readWorkplanClosure, readWorkplanHistory, readWorkplanPreview } from '../app/audit-workplan-store';
import { emptyAuditPlan, saveAuditPlan } from '../app/audit-plan';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { ensureAuditRequestSchema, mutateAuditRequest, readAuditRequestWorkflow, readAuditRequestWork, auditRequestActorActive } from '../app/audit-request-store';
import { ensureEvidenceHistorySchema } from '../app/evidence/versioning';
import { auditRequestNotification, auditRequestNotificationCurrent, syncAuditRequestNotifications } from '../app/audit-request-notifications';
import { syncAssuranceNotificationOutbox } from '../app/assurance-executive-operations';
import { requestDueAt, requestDraftPreview, validateAuditRequestFields, validateRequestTimeZone, type AuditRequestFields } from '../app/audit-requests';
import { projectEnterpriseWork } from '../app/enterprise-work';
import { scopedApiAllowed } from '../app/module-access';
import type { Actor } from '../app/api/auth/security';
import type { AssuranceDeliveryOutbox } from '../app/assurance-notification-delivery';

const owner: Actor = { id: 'o', email: 'owner@example.com', name: 'Owner', role: 'Editor', source: 'local' };
const reviewer: Actor = { ...owner, id: 'r', email: 'reviewer@example.com', name: 'Reviewer' };
const admin: Actor = { ...owner, id: 'a', email: 'admin@example.com', role: 'Admin' };
const fields: AuditRequestFields = { title: 'Quarterly access review', instructions: 'All privileged accounts and review sign-off.', owner: owner.email, reviewer: reviewer.email, dueDate: '2026-10-21', reviewDueDate: '2026-10-24', periodStart: '2026-07-01', periodEnd: '2026-09-30' };
const now = new Date('2026-10-14T12:00:00Z');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE simple_audits(id TEXT PRIMARY KEY); INSERT INTO simple_audits VALUES('audit-a'),('audit-b'); CREATE TABLE simple_grc_metadata(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT); CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);
    INSERT INTO local_users VALUES('o','Owner','owner@example.com','Editor','Active'),('r','Reviewer','reviewer@example.com','Editor','Active'),('a','Admin','admin@example.com','Admin','Active');
    CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT); INSERT INTO simple_grc_records VALUES('EVD-a','Kanıtlar','{}','','');`);
  function prepare(sql: string, args: SQLInputValue[] = []) {
    return { bind(...values: SQLInputValue[]) { return prepare(sql, values); },
      execute() { const results = sqlite.prepare(sql).all(...args); return { results, success: true, meta: { changes: Number((sqlite.prepare('SELECT changes() n').get() as { n: number }).n) } }; },
      async all() { return this.execute(); }, async run() { return this.execute(); }, async first() { return sqlite.prepare(sql).get(...args) || null; } };
  }
  let beforeBatch: (() => void) | undefined, beforeBatchDelay = 0;
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { const hook = beforeBatchDelay > 0 ? undefined : beforeBatch; if (beforeBatchDelay > 0) beforeBatchDelay--; else beforeBatch = undefined; hook?.(); sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  await ensureAuditRequestSchema(db); await ensureEvidenceHistorySchema(db);
  sqlite.prepare(`INSERT INTO evidence_versions(id,evidence_id,version_no,file_key,file_name,file_type,file_size,content_sha256,chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('EVV-one','EVD-a',1,'evidence/EVD-a/v1.pdf','v1.pdf','application/pdf',100,'a'.repeat(64),'b'.repeat(64),'Access review',owner.email,'Q3 2026','','CTRL-1','Initial',owner.email,now.toISOString());
  const create = (requestId = 'ARQ-a', patch = {}) => mutateAuditRequest(db, admin, { auditId: 'audit-a', requestId, expectedRevision: '', action: 'create', fields: { ...fields, ...patch } }, now);
  const state = () => readAuditRequestWorkflow(db, 'audit-a');
  const row = async () => (await state()).requests[0];
  const act = async (action: string, who = admin, extra = {}) => mutateAuditRequest(db, who, { auditId: 'audit-a', requestId: 'ARQ-a', expectedRevision: (await row()).revision, action, ...extra }, now);
  const start = async () => mutateAuditRequest(db, admin, { auditId: 'audit-a', action: 'start', expectedRevision: '', expectedPlanRevision: '', timeZone: 'Europe/Istanbul', expectedDrafts: requestDraftPreview((await state()).requests) }, now);
  const add = async (id = 'ARQ-extra') => mutateAuditRequest(db, admin, { auditId: 'audit-a', action: 'create', requestId: id, expectedRevision: '', expectedWorkflowRevision: (await state()).workflow.revision, fields }, now);
  const activation = async () => { const current = await state(); return { auditId: 'audit-a', action: 'activate', expectedRevision: current.workflow.revision, expectedPlanRevision: '', expectedDrafts: requestDraftPreview(current.requests), note: 'Additional review required for scope change' }; };
  return { db, sqlite, create, state, row, act, start, add, activation, race: (hook: () => void, afterBatches = 0) => { beforeBatch = hook; beforeBatchDelay = afterBatches; } };
}
test('fields reject impossible dates, wrong periods, same reviewer and invalid timezone', () => {
  for (const patch of [{ title: '' }, { instructions: '' }, { reviewer: owner.email }, { dueDate: '2026-02-30' }, { reviewDueDate: '2026-10-01' }, { periodEnd: '' }, { periodStart: '2027-01-01' }]) assert.throws(() => validateAuditRequestFields({ ...fields, ...patch }));
  assert.equal(validateAuditRequestFields({ ...fields, owner: ' OWNER@EXAMPLE.COM ' }).owner, owner.email);
  assert.equal(validateRequestTimeZone('Europe/Istanbul'), 'Europe/Istanbul'); assert.throws(() => validateRequestTimeZone('Mars/City'));
});
test('drafts are silent; start creates work once; plan drift and unversioned post-start additions fail', async () => {
  const f = await fixture(); try {
    await assert.rejects(f.start(), /empty/); await f.create();
    await syncAuditRequestNotifications(f.db, now); assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM continuous_assurance_notification_outbox').get()?.n, 0);
    assert.equal((await readAuditRequestWork(f.db)).requests.length, 0);
    f.sqlite.prepare('INSERT INTO simple_grc_metadata VALUES(?,?,?)').run('audit_plan_audit-a', JSON.stringify({ revision: 'new-plan', plan: {} }), '');
    await assert.rejects(f.start(), /plan-changed/); f.sqlite.exec('DELETE FROM simple_grc_metadata');
    await f.start(); assert.equal((await f.row()).status, 'assigned'); await assert.rejects(f.start(), /conflict/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_request_events WHERE action='start'").get()?.n, 1);
    await assert.rejects(f.create('ARQ-second'), /conflict/);
    const work = await readAuditRequestWork(f.db); assert.equal(work.requests.length, 1); assert.equal(projectEnterpriseWork('audit', work).rows.length, 1);
  } finally { f.sqlite.close(); }
});
test('ownership, independent review, pinned evidence, return/resubmit and terminal states', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start();
    await assert.rejects(f.act('submit', admin, { versionIds: ['EVV-one'] }), /forbidden/);
    await assert.rejects(f.act('submit', owner, { versionIds: ['missing'] }), /evidence/);
    await f.act('submit', owner, { versionIds: ['EVV-one'] }); assert.equal((await f.row()).status, 'submitted');
    await assert.rejects(f.act('accept', owner, { note: 'Looks correct' }), /forbidden/);
    await assert.rejects(f.act('accept', admin, { note: 'Looks correct' }), /forbidden/);
    await assert.rejects(f.act('return', reviewer, { note: '' }), /note/);
    await f.act('return', reviewer, { note: 'Missing approval context', fields: { dueDate: '2026-10-25', reviewDueDate: '2026-10-28' } });
    const returned = await f.row(); assert.equal(returned.status, 'changes_requested'); assert.equal(returned.dueDate, '2026-10-25');
    await f.act('submit', owner, { versionIds: ['EVV-one'] });
    f.sqlite.prepare(`INSERT INTO evidence_versions SELECT 'EVV-two',evidence_id,2,'evidence/EVD-a/v2.pdf','v2.pdf',file_type,file_size,content_sha256,chain_sha256,id,chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at FROM evidence_versions WHERE id='EVV-one'`).run();
    await f.act('accept', reviewer, { note: 'Reviewed against Q3 acceptance criteria' });
    assert.equal((await f.row()).evidence[0].id, 'EVV-one'); assert.equal((await f.row()).status, 'accepted');
    await assert.rejects(f.act('cancel', admin, { note: 'Cancel anyway' }), /transition/);
    const events = f.sqlite.prepare('SELECT action FROM audit_request_events ORDER BY rowid').all().map(r => r.action);
    assert.deepEqual(events, ['create', 'start', 'submit', 'return', 'submit', 'accept']);
    const projection = projectEnterpriseWork('audit', await readAuditRequestWork(f.db)); assert.equal(projection.complete, true); assert.equal(projection.rows[0].data.workClosed, true);
  } finally { f.sqlite.close(); }
});
test('stale revisions, cross-parent writes and removed parents cannot modify the record or ledger', async () => {
  const f = await fixture(); try {
    await f.create(); const first = await f.row(); await f.act('edit', admin, { fields: { ...fields, title: 'Changed title' } });
    const eventCount = f.sqlite.prepare('SELECT COUNT(*) n FROM audit_request_events').get()?.n;
    await assert.rejects(mutateAuditRequest(f.db, admin, { auditId: 'audit-a', requestId: first.id, expectedRevision: first.revision, action: 'edit', fields }), /conflict/);
    await assert.rejects(mutateAuditRequest(f.db, admin, { auditId: 'audit-b', requestId: first.id, expectedRevision: (await f.row()).revision, action: 'cancel', note: 'Cancel this' }), /conflict/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_request_events').get()?.n, eventCount);
    f.sqlite.exec("DELETE FROM simple_audits WHERE id='audit-a'");
    await assert.rejects(f.state(), /audit-missing/); assert.equal((await readAuditRequestWork(f.db)).requests.length, 0);
  } finally { f.sqlite.close(); }
});
test('notification deduplication, independent publishers, reassignment and current-recipient guards', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await syncAuditRequestNotifications(f.db, now); await syncAuditRequestNotifications(f.db, now);
    let queued = f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").all() as AssuranceDeliveryOutbox[];
    assert.equal(queued.length, 1); assert.equal(queued[0].recipient, owner.email); assert.equal(await auditRequestNotificationCurrent(f.db, queued[0], now), true);
    await syncAssuranceNotificationOutbox(f.db, [], true, now);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 1);
    const old = queued[0]; await f.act('edit', admin, { fields: { ...fields, owner: admin.email } });
    assert.equal(await auditRequestNotificationCurrent(f.db, old, now), false);
    await syncAuditRequestNotifications(f.db, now); queued = f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").all() as AssuranceDeliveryOutbox[];
    assert.equal(queued.length, 1); assert.equal(queued[0].recipient, admin.email);
    await f.act('submit', admin, { versionIds: ['EVV-one'] }); await syncAuditRequestNotifications(f.db, now);
    queued = f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").all() as AssuranceDeliveryOutbox[]; assert.equal(queued[0].recipient, reviewer.email);
    f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='r'");
    assert.equal(await auditRequestNotificationCurrent(f.db, queued[0], now), false); await syncAuditRequestNotifications(f.db, now);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 0);
    f.sqlite.exec("UPDATE local_users SET status='Active' WHERE id='r'"); await syncAuditRequestNotifications(f.db, now);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 1, 'restored recipient can receive the still-current task');
  } finally { f.sqlite.close(); }
});
test('accept/cancel and deletion suppress reminders; due milestones follow the configured timezone', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); let row = await f.row();
    assert.equal(auditRequestNotification(row, 'Europe/Istanbul', new Date('2026-10-19T21:30:00Z'))?.milestone, 'due-soon');
    assert.equal(auditRequestNotification(row, 'UTC', new Date('2026-10-19T21:30:00Z'))?.milestone, 'assignment');
    await syncAuditRequestNotifications(f.db, new Date('2026-10-26T12:00:00Z'));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 1);
    await f.act('submit', owner, { versionIds: ['EVV-one'] }); await f.act('accept', reviewer, { note: 'Meets acceptance criteria' }); await syncAuditRequestNotifications(f.db, now);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 0);
    row = await f.row(); assert.equal(auditRequestNotification(row, 'UTC', now), null);
  } finally { f.sqlite.close(); }
});
test('scoped audit permissions do not grant evidence visibility or reviewer authority', async () => {
  const f = await fixture(); try {
    const readOnly = { ...owner, moduleAccess: { mode: 'scoped', modules: { 'Denetim Yönetimi': 'read' } } } as Actor;
    assert.equal(scopedApiAllowed(readOnly, '/api/audits/requests', 'GET'), true); assert.equal(scopedApiAllowed(readOnly, '/api/audits/requests', 'POST'), false);
    await assert.rejects(mutateAuditRequest(f.db, readOnly, { action: 'create', auditId: 'audit-a', requestId: 'ARQ-x', expectedRevision: '', fields }), /forbidden/);
    f.sqlite.prepare('INSERT INTO user_module_access VALUES(?,?)').run('r', JSON.stringify({ mode: 'scoped', modules: { 'Denetim Yönetimi': 'write' } }));
    assert.equal(await auditRequestActorActive(f.db, reviewer.email), false); await assert.rejects(f.create(), /assignee/);
  } finally { f.sqlite.close(); }
});

test('work deadlines use the same local day across Istanbul and DST transitions', () => {
  assert.equal(requestDueAt('2026-10-14', 'Europe/Istanbul'), '2026-10-14T20:59:59.999Z');
  assert.equal(requestDueAt('2026-03-08', 'America/New_York'), '2026-03-09T03:59:59.999Z');
  assert.equal(requestDueAt('2026-11-01', 'America/New_York'), '2026-11-02T04:59:59.999Z');
});

test('editing a submitted request restarts submission and cancellation stops all work', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await f.act('submit', owner, { versionIds: ['EVV-one'] });
    const submittedRevision = (await f.row()).revision;
    await f.act('edit', admin, { fields: { ...fields, reviewer: admin.email } });
    assert.equal((await f.row()).status, 'assigned'); assert.equal((await f.row()).submittedBy, '');
    await assert.rejects(mutateAuditRequest(f.db, reviewer, { auditId: 'audit-a', requestId: 'ARQ-a', expectedRevision: submittedRevision, action: 'accept', note: 'Stale review must fail' }), /conflict/);
    await syncAuditRequestNotifications(f.db, now); await f.act('cancel', admin, { note: 'No longer in scope' });
    await syncAuditRequestNotifications(f.db, now);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 0);
    assert.equal(projectEnterpriseWork('audit', await readAuditRequestWork(f.db)).rows[0].data.workClosed, true);
  } finally { f.sqlite.close(); }
});

test('event-write failure rolls back the request mutation and reminder cancellation', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await syncAuditRequestNotifications(f.db, now); const before = await f.row();
    f.sqlite.exec("CREATE TRIGGER prevent_test_event BEFORE INSERT ON audit_request_events BEGIN SELECT RAISE(ABORT,'event failure'); END");
    await assert.rejects(f.act('cancel', admin, { note: 'Rollback required' }), /event failure/);
    assert.deepEqual(await f.row(), before);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 1);
  } finally { f.sqlite.close(); }
});

test('active audit additions stay silent until reasoned activation and preserve accepted work', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await f.act('submit', owner, { versionIds: ['EVV-one'] });
    await f.act('accept', reviewer, { note: 'Meets the acceptance criteria' });
    const accepted = await f.row(), before = (await f.state()).workflow;
    await f.add(); await syncAuditRequestNotifications(f.db, now);
    assert.equal((await readAuditRequestWork(f.db)).requests.length, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 0);
    const activation = await f.activation();
    await assert.rejects(mutateAuditRequest(f.db, admin, { ...activation, note: ' ' }, now), /note/);
    await mutateAuditRequest(f.db, admin, activation, now);
    await assert.rejects(mutateAuditRequest(f.db, admin, activation, now), /conflict/);
    const state = await f.state();
    assert.deepEqual(state.requests.find(row => row.id === accepted.id), accepted);
    assert.equal(state.requests.find(row => row.id === 'ARQ-extra')?.status, 'assigned');
    assert.notEqual(state.workflow.revision, before.revision); assert.equal(state.workflow.timeZone, before.timeZone);
    await syncAuditRequestNotifications(f.db, now); await syncAuditRequestNotifications(f.db, now);
    const queued = f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").all();
    assert.equal(queued.length, 1); assert.equal(queued[0].escalation_id, 'ARQ-extra'); assert.equal(queued[0].recipient, owner.email);
    const event = f.sqlite.prepare("SELECT snapshot_json FROM audit_request_events WHERE request_id='ARQ-extra' AND action='activate'").get();
    assert.equal(JSON.parse(String(event?.snapshot_json)).activationReason, activation.note);
    assert.equal((await readAuditRequestWork(f.db)).requests.length, 2);
  } finally { f.sqlite.close(); }
});

test('activation rejects changed previews, foreign drafts, duplicate identities and plan drift', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await f.add(); const preview = await f.activation();
    for (const expectedDrafts of [[], [preview.expectedDrafts[0], preview.expectedDrafts[0]], [{ ...preview.expectedDrafts[0], id: 'foreign' }]]) {
      await assert.rejects(mutateAuditRequest(f.db, admin, { ...preview, expectedDrafts }, now), /preview-changed/);
    }
    await f.add('ARQ-third');
    await assert.rejects(mutateAuditRequest(f.db, admin, preview, now), /preview-changed/);
    const latest = await f.activation();
    f.sqlite.prepare('INSERT INTO simple_grc_metadata VALUES(?,?,?)').run('audit_plan_audit-a', JSON.stringify({ revision: 'scope-v2', plan: {} }), '');
    await assert.rejects(mutateAuditRequest(f.db, admin, latest, now), /plan-changed/);
    await mutateAuditRequest(f.db, admin, { ...latest, expectedPlanRevision: 'scope-v2' }, now);
    assert.equal((await f.state()).workflow.planRevision, 'scope-v2');
    const events = f.sqlite.prepare("SELECT snapshot_json FROM audit_request_events WHERE action='activate'").all();
    assert.equal(events.length, 2); assert.ok(events.every(e => JSON.parse(String(e.snapshot_json)).planRevision === 'scope-v2'));
  } finally { f.sqlite.close(); }
});

test('transaction guards reject draft, plan and account changes after activation validation', async () => {
  for (const change of [
    "UPDATE audit_requests SET revision='changed-after-preview' WHERE id='ARQ-extra'",
    "INSERT INTO audit_requests SELECT 'ARQ-unseen',audit_id,data_json,'new-draft',created_at,updated_at FROM audit_requests WHERE id='ARQ-extra'",
    "DELETE FROM audit_requests WHERE id='ARQ-extra'",
    "INSERT INTO simple_grc_metadata VALUES('audit_plan_audit-a','{\"revision\":\"scope-race\"}','')",
    "UPDATE local_users SET status='Disabled' WHERE id='r'",
    "INSERT INTO user_module_access VALUES('o','{\"mode\":\"scoped\",\"modules\":{\"Denetim Yönetimi\":\"read\"}}')",
  ]) {
    const f = await fixture(); try {
      await f.create(); await f.start(); await f.add(); const preview = await f.activation(), before = (await f.state()).workflow;
      f.race(() => f.sqlite.exec(change));
      await assert.rejects(mutateAuditRequest(f.db, admin, preview, now), /conflict/);
      assert.deepEqual((await f.state()).workflow, before);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_request_events WHERE action='activate'").get()?.n, 0);
      assert.ok((await f.state()).requests.filter(r => r.id !== 'ARQ-a').every(r => r.status === 'draft'));
    } finally { f.sqlite.close(); }
  }
});

test('initial launch also binds the exact preview and rolls back on event failure', async () => {
  const f = await fixture(); try {
    await f.create();
    f.race(() => f.sqlite.exec("UPDATE audit_requests SET revision='new-revision' WHERE id='ARQ-a'"));
    await assert.rejects(f.start(), /conflict/); assert.equal((await f.state()).workflow.state, 'draft');
    f.sqlite.exec("CREATE TRIGGER fail_start BEFORE INSERT ON audit_request_events WHEN NEW.action='start' BEGIN SELECT RAISE(ABORT,'event failure'); END");
    await assert.rejects(f.start(), /event failure/); assert.equal((await f.state()).workflow.state, 'draft'); assert.equal((await f.row()).status, 'draft');
  } finally { f.sqlite.close(); }
});

test('activation failures leave every draft and workflow revision unchanged', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await f.add(); await f.add('ARQ-third');
    const before = await f.state(), preview = await f.activation();
    f.sqlite.exec("CREATE TRIGGER fail_activation BEFORE INSERT ON audit_request_events WHEN NEW.action='activate' BEGIN SELECT RAISE(ABORT,'activation failure'); END");
    await assert.rejects(mutateAuditRequest(f.db, admin, preview, now), /activation failure/);
    assert.deepEqual(await f.state(), before);
    const readOnly = { ...owner, moduleAccess: { mode: 'scoped', modules: { 'Denetim Yönetimi': 'read' } } } as Actor;
    await assert.rejects(mutateAuditRequest(f.db, readOnly, preview, now), /forbidden/);
  } finally { f.sqlite.close(); }
});

test('cancelled unpublished additions never appear as completed work', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await f.add();
    const addition = (await f.state()).requests.find(r => r.id === 'ARQ-extra')!;
    await mutateAuditRequest(f.db, admin, { auditId: 'audit-a', action: 'cancel', requestId: addition.id, expectedRevision: addition.revision, note: 'Draft no longer needed' }, now);
    assert.deepEqual((await readAuditRequestWork(f.db)).requests.map(r => r.id), ['ARQ-a']);
  } finally { f.sqlite.close(); }
});


async function closureInput(f: Awaited<ReturnType<typeof fixture>>) {
  const state = await readWorkplanPreview(f.db, 'audit-a');
  return { auditId: 'audit-a', action: 'close', expectedRevision: state.workflow.revision, expectedPlanRevision: state.plan.revision, expectedRequests: state.requests.map(({ id, revision }) => ({ id, revision })), note: 'All requested work has been reviewed and resolved.' };
}
async function acceptFixture(f: Awaited<ReturnType<typeof fixture>>) {
  await f.create(); await f.start(); await f.act('submit', owner, { versionIds: ['EVV-one'] }); await f.act('accept', reviewer, { note: 'Evidence accepted by the assigned reviewer.' });
}
test('closure freezes the saved plan, decisions and pinned versions; reopen preserves history and accepted work', async () => {
  const f = await fixture(); try {
    await acceptFixture(f);
    await saveAuditPlan(f.db, 'audit-a', '', { ...emptyAuditPlan, scope: 'Q3 access review scope' }, admin.email);
    const accepted = await f.row(), input = await closureInput(f);
    const { revision: closureId } = await mutateWorkplan(f.db, admin, input, now);
    assert.equal((await f.state()).workflow.state, 'closed');
    await syncAuditRequestNotifications(f.db, now); assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n, 0);
    const closed = await readWorkplanClosure(f.db, 'audit-a', closureId, true);
    assert.equal(closed.integrity, 'verified'); assert.equal(closed.snapshot.requests[0].evidence[0].id, 'EVV-one');
    assert.equal(closed.snapshot.plan.plan.scope, 'Q3 access review scope'); assert.equal(closed.snapshot.requests[0].reviewer, reviewer.email);
    assert.deepEqual((await readAuditRequestWork(f.db)).requests.map(row => row.id), ['ARQ-a']);
    await assert.rejects(f.add(), /workplan-closed/); await assert.rejects(f.act('edit', admin, { fields }), /workplan-closed/);
    await assert.rejects(mutateWorkplan(f.db, admin, input, now), /conflict/);
    await saveAuditPlan(f.db, 'audit-a', input.expectedPlanRevision, { ...emptyAuditPlan, scope: 'Q4 changed scope' }, admin.email);
    f.sqlite.exec("UPDATE simple_grc_records SET data_json='{\"versionNo\":\"2\"}' WHERE id='EVD-a'");
    const reopen = { auditId: 'audit-a', action: 'reopen', expectedRevision: closureId, note: 'Additional service accounts require review.' };
    await assert.rejects(mutateWorkplan(f.db, admin, { ...reopen, note: '' }, now), /note/);
    await mutateWorkplan(f.db, admin, reopen, now); await assert.rejects(mutateWorkplan(f.db, admin, reopen, now), /conflict/);
    assert.deepEqual(await f.row(), accepted);
    await f.add(); const extra = (await f.state()).requests.find(r => r.id === 'ARQ-extra')!;
    await mutateAuditRequest(f.db, admin, { auditId: 'audit-a', requestId: extra.id, action: 'cancel', expectedRevision: extra.revision, note: 'Scope addition is no longer needed.' }, now);
    const second = await mutateWorkplan(f.db, admin, await closureInput(f), now);
    assert.notEqual(second.revision, closureId); assert.deepEqual(await readWorkplanClosure(f.db, 'audit-a', closureId, true), closed);
    assert.equal((await readWorkplanClosure(f.db, 'audit-a', second.revision, true)).snapshot.plan.plan.scope, 'Q4 changed scope');
    assert.deepEqual((await readWorkplanHistory(f.db, 'audit-a')).events.map(e => e.action), ['close', 'reopen', 'close']);
    assert.deepEqual((await readAuditRequestWork(f.db)).requests.map(row => row.id), ['ARQ-a']);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_request_events WHERE action='accept'").get()?.n, 1);
  } finally { f.sqlite.close(); }
});

test('closure blocks pending work and stale previews, including additions, plan drift and duplicate IDs', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start();
    await assert.rejects(mutateWorkplan(f.db, admin, await closureInput(f), now), /outstanding/);
    await f.act('submit', owner, { versionIds: ['EVV-one'] });
    await assert.rejects(mutateWorkplan(f.db, admin, await closureInput(f), now), /outstanding/);
    await f.act('accept', reviewer, { note: 'All requested evidence reviewed.' });
    const preview = await closureInput(f);
    await assert.rejects(mutateWorkplan(f.db, admin, { ...preview, expectedRequests: [...preview.expectedRequests, ...preview.expectedRequests] }, now), /preview-changed/);
    await saveAuditPlan(f.db, 'audit-a', '', emptyAuditPlan, admin.email);
    await assert.rejects(mutateWorkplan(f.db, admin, preview, now), /plan-changed/);
    const current = await closureInput(f); await f.add();
    await assert.rejects(mutateWorkplan(f.db, admin, current, now), /outstanding/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_workplan_closures').get()?.n, 0);
  } finally { f.sqlite.close(); }
});

test('closure claims exact request and plan revisions inside the transaction', async () => {
  for (const change of [
    "UPDATE audit_requests SET revision='changed' WHERE id='ARQ-a'",
    "INSERT INTO audit_requests SELECT 'ARQ-race',audit_id,data_json,'new-revision',created_at,updated_at FROM audit_requests LIMIT 1",
    "INSERT INTO simple_grc_metadata VALUES('audit_plan_audit-a','{\"revision\":\"changed\",\"plan\":{}}','')",
    "DELETE FROM simple_audits WHERE id='audit-a'",
  ]) {
    const f = await fixture(); try {
      await acceptFixture(f); const preview = await closureInput(f);
      f.race(() => f.sqlite.exec(change), 1); // after snapshot read, before the write batch
      await assert.rejects(mutateWorkplan(f.db, admin, preview, now), /conflict/);
      assert.equal(f.sqlite.prepare('SELECT state FROM audit_request_workflows').get()?.state, 'active');
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_workplan_closures').get()?.n, 0);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_workplan_closure_items').get()?.n, 0);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_workplan_events').get()?.n, 0);
    } finally { f.sqlite.close(); }
  }
});

test('closure and reopening roll back completely on snapshot or event failure', async () => {
  for (const target of ['audit_workplan_closure_items', 'audit_workplan_events']) {
    const f = await fixture(); try {
      await acceptFixture(f); const before = await f.state();
      f.sqlite.exec(`CREATE TRIGGER fail_closure BEFORE INSERT ON ${target} BEGIN SELECT RAISE(ABORT,'snapshot failure'); END`);
      await assert.rejects(mutateWorkplan(f.db, admin, await closureInput(f), now), /snapshot failure/);
      assert.deepEqual(await f.state(), before); assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_workplan_closures').get()?.n, 0);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_workplan_closure_items').get()?.n, 0);
      f.sqlite.exec('DROP TRIGGER fail_closure');
      const closed = await mutateWorkplan(f.db, admin, await closureInput(f), now);
      f.sqlite.exec("CREATE TRIGGER fail_reopen BEFORE INSERT ON audit_workplan_events WHEN NEW.action='reopen' BEGIN SELECT RAISE(ABORT,'reopen failure'); END");
      await assert.rejects(mutateWorkplan(f.db, admin, { auditId: 'audit-a', action: 'reopen', expectedRevision: closed.revision, note: 'Additional scope requested.' }, now), /reopen failure/);
      assert.equal((await f.state()).workflow.state, 'closed');
    } finally { f.sqlite.close(); }
  }
});

test('concurrent close prevents a stale draft creation and scoped actors cannot close blind', async () => {
  const f = await fixture(); try {
    await acceptFixture(f); const preview = await closureInput(f);
    const auditOnly = { ...owner, moduleAccess: { mode: 'scoped', modules: { 'Denetim Yönetimi': 'write' } } } as Actor;
    await assert.rejects(mutateWorkplan(f.db, auditOnly, preview, now), /forbidden/);
    await assert.rejects(mutateWorkplan(f.db, { ...owner, role: 'Viewer' }, preview, now), /forbidden/);
    assert.equal(scopedApiAllowed(auditOnly, '/api/audits/requests/closure', 'GET'), true);
    const noAudit = { ...owner, moduleAccess: { mode: 'scoped', modules: { 'Kanıtlar': 'read' } } } as Actor;
    assert.equal(scopedApiAllowed(noAudit, '/api/audits/requests/closure', 'GET'), false);
    f.race(() => f.sqlite.exec("UPDATE audit_request_workflows SET state='closed'"));
    await assert.rejects(f.add(), /conflict/);
    assert.equal((await f.state()).requests.length, 1);
  } finally { f.sqlite.close(); }
});

test('historical reads enforce parent identity, redact evidence and detect tampered/incomplete snapshots', async () => {
  const f = await fixture(); try {
    await acceptFixture(f); const { revision } = await mutateWorkplan(f.db, admin, await closureInput(f), now);
    await assert.rejects(readWorkplanClosure(f.db, 'audit-b', revision, true), /closure-missing/);
    const redacted = await readWorkplanClosure(f.db, 'audit-a', revision, false);
    assert.equal(redacted.integrity, 'verified'); assert.deepEqual(redacted.snapshot.requests[0].evidence, []);
    f.sqlite.prepare("UPDATE audit_workplan_closure_items SET data_json=json_set(data_json,'$.note','tampered') WHERE closure_id=?").run(revision);
    assert.equal((await readWorkplanClosure(f.db, 'audit-a', revision, true)).integrity, 'broken');
    f.sqlite.prepare('DELETE FROM audit_workplan_closure_items WHERE closure_id=?').run(revision);
    assert.equal((await readWorkplanClosure(f.db, 'audit-a', revision, true)).integrity, 'unavailable');
    f.sqlite.exec("DELETE FROM simple_audits WHERE id='audit-a'");
    await assert.rejects(readWorkplanClosure(f.db, 'audit-a', revision, true), /audit-missing/);
  } finally { f.sqlite.close(); }
});

test('500-request closure is complete without one SQL binding per request; incomplete reads cannot close', async () => {
  const f = await fixture(); try {
    await acceptFixture(f);
    f.sqlite.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<499) INSERT INTO audit_requests SELECT 'ARQ-extra-'||x,audit_id,data_json,revision,created_at,updated_at FROM audit_requests,n WHERE id='ARQ-a'`);
    const input = await closureInput(f), closed = await mutateWorkplan(f.db, admin, input, now);
    const detail = await readWorkplanClosure(f.db, 'audit-a', closed.revision, true);
    assert.equal(detail.integrity, 'verified'); assert.equal(detail.snapshot.requests.length, 500);
    await mutateWorkplan(f.db, admin, { auditId: 'audit-a', action: 'reopen', expectedRevision: closed.revision, note: 'Additional scope requested.' }, now);
    f.sqlite.exec("INSERT INTO audit_requests SELECT 'ARQ-over-limit',audit_id,data_json,revision,created_at,updated_at FROM audit_requests WHERE id='ARQ-a'");
    await assert.rejects(mutateWorkplan(f.db, admin, await closureInput(f), now), /limit/);
  } finally { f.sqlite.close(); }
});


test('a withdrawn work plan can close with cancellations while an empty plan cannot close', async () => {
  const f = await fixture(); try {
    await f.create(); await f.start(); await f.act('cancel', admin, { note: 'The audit owner withdrew the request.' });
    const { revision } = await mutateWorkplan(f.db, admin, await closureInput(f), now);
    const closed = await readWorkplanClosure(f.db, 'audit-a', revision, true);
    assert.equal(closed.integrity, 'verified'); assert.ok(closed.snapshot.requests.every(row => row.status === 'cancelled'));
    await mutateWorkplan(f.db, admin, { auditId: 'audit-a', action: 'reopen', expectedRevision: revision, note: 'Prepare replacement scope.' }, now);
    f.sqlite.exec('DELETE FROM audit_requests');
    await assert.rejects(mutateWorkplan(f.db, admin, await closureInput(f), now), /outstanding/);
  } finally { f.sqlite.close(); }
});

test('reminder profiles reconcile queues, preserve deadlines and reject stale saves, inactive escalations and closed audits', async () => {
  const { readAuditReminderProfile, saveAuditReminderProfile } = await import('../app/audit-reminder-store');
  const { defaultAuditReminderProfile } = await import('../app/audit-reminder-profile');
  const f = await fixture(); try {
    await f.create(); await f.start(); await syncAuditRequestNotifications(f.db, now);
    const old = f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").get() as AssuranceDeliveryOutbox;
    const input = { auditId:'audit-a', expectedRevision:'', expectedWorkflowRevision:(await f.state()).workflow.revision, profile:{...defaultAuditReminderProfile,mode:'business',holidays:['2026-10-14'],escalationDays:5,escalationRecipient:admin.email} };
    await saveAuditReminderProfile(f.db,admin,input,now);
    assert.equal(await auditRequestNotificationCurrent(f.db,old,now),false);
    await syncAuditRequestNotifications(f.db,now);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n,0);
    assert.equal((await f.row()).dueDate,fields.dueDate);
    await assert.rejects(saveAuditReminderProfile(f.db,admin,input,now),/conflict/);
    const saved=await readAuditReminderProfile(f.db,'audit-a');
    const later=new Date('2026-11-02T12:00Z');await syncAuditRequestNotifications(f.db,later);await syncAuditRequestNotifications(f.db,later);
    const notices=f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").all() as AssuranceDeliveryOutbox[];assert.equal(notices.length,2);
    const escalation=notices.find(n=>n.recipient===admin.email)!;assert.equal(await auditRequestNotificationCurrent(f.db,escalation,later),true);
    f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='a'");assert.equal(await auditRequestNotificationCurrent(f.db,escalation,later),false);
    await assert.rejects(saveAuditReminderProfile(f.db,reviewer,{...input,expectedRevision:saved.revision},now),/assignee/);
    f.sqlite.exec("UPDATE local_users SET status='Active' WHERE id='a'; INSERT INTO audit_closure_state VALUES('audit-a','closed','c','','')");
    await assert.rejects(saveAuditReminderProfile(f.db,admin,{...input,expectedRevision:saved.revision},now),/audit-closed/);
    assert.equal((await readAuditReminderProfile(f.db,'audit-a')).revision,saved.revision);
  } finally { f.sqlite.close(); }
});

test('profile writes bind actor/recipient/workflow at commit and event failure rolls back configuration and queue', async () => {
  const { readAuditReminderProfile, saveAuditReminderProfile } = await import('../app/audit-reminder-store');
  const { defaultAuditReminderProfile } = await import('../app/audit-reminder-profile');
  for (const change of ["UPDATE local_users SET status='Disabled' WHERE id='a'", "UPDATE local_users SET status='Disabled' WHERE id='r'", "UPDATE audit_request_workflows SET revision='changed'", "DELETE FROM simple_audits WHERE id='audit-a'"]) {
    const f=await fixture();try{
      await f.create();await f.start();
      // Warm lazy closure initialization before injecting a commit-time race.
      const {ensureAuditClosureSchema}=await import('../app/audit-closure-schema');await ensureAuditClosureSchema(f.db);
      const input={auditId:'audit-a',expectedRevision:'',expectedWorkflowRevision:(await f.state()).workflow.revision,profile:{...defaultAuditReminderProfile,escalationDays:5,escalationRecipient:reviewer.email}};
      f.race(()=>f.sqlite.exec(change));await assert.rejects(saveAuditReminderProfile(f.db,admin,input,now),/conflict/);
      assert.equal(f.sqlite.prepare('SELECT count(*) n FROM audit_reminder_profiles').get()?.n,0);
    }finally{f.sqlite.close();}
  }
  const f=await fixture();try{
    await f.create();await f.start();await syncAuditRequestNotifications(f.db,now);
    f.sqlite.exec("CREATE TRIGGER reject_profile_event BEFORE INSERT ON audit_request_events WHEN NEW.action='reminder-profile' BEGIN SELECT RAISE(ABORT,'event-failure'); END");
    await assert.rejects(saveAuditReminderProfile(f.db,admin,{auditId:'audit-a',expectedRevision:'',expectedWorkflowRevision:(await f.state()).workflow.revision,profile:defaultAuditReminderProfile},now),/event-failure/);
    assert.equal((await readAuditReminderProfile(f.db,'audit-a')).revision,'');assert.equal(f.sqlite.prepare("SELECT count(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n,1);
  }finally{f.sqlite.close();}
});

const sharedCalendarId='AST-00000000-0000-0000-0000-000000000001';
const sharedCalendar={version:1 as const,kind:'calendar' as const,name:'Organization calendar',calendar:{mode:'business' as const,weekdays:[1,2,3,4,5],holidays:['2026-10-29']}};
async function calendarFixture(){
 const f=await fixture();await f.create();await f.start();
 const {ensureAuditClosureSchema}=await import('../app/audit-closure-schema');await ensureAuditClosureSchema(f.db);
 const {mutateSharedTemplate}=await import('../app/audit-shared-template-store');
 const {readAuditReminderProfile,saveAuditReminderProfile}=await import('../app/audit-reminder-store');
 const {defaultAuditReminderProfile}=await import('../app/audit-reminder-profile');
 const first=await mutateSharedTemplate(f.db,admin,{id:sharedCalendarId,action:'save',expectedRevision:'',template:sharedCalendar,note:'Approved organization calendar'},now);
 const source={id:sharedCalendarId,revision:first.revision,name:sharedCalendar.name,version:first.version};
 const profile={...defaultAuditReminderProfile,...sharedCalendar.calendar,beforeDays:2,escalationDays:5,escalationRecipient:reviewer.email,calendarSource:source};
 const input={auditId:'audit-a',expectedRevision:'',expectedWorkflowRevision:(await f.state()).workflow.revision,profile};
 return {...f,input,source,first,read:()=>readAuditReminderProfile(f.db,'audit-a'),save:(patch={},actor=admin)=>saveAuditReminderProfile(f.db,actor,{...input,...patch},now),publish:(expectedRevision:string,patch={})=>mutateSharedTemplate(f.db,admin,{id:sharedCalendarId,action:'save',expectedRevision,template:sharedCalendar,note:'Update approved organization calendar',...patch},now)};
}
test('calendar adoption pins the source, preserves deadlines and recipient thresholds, and withdraws queued notices atomically',async()=>{const f=await calendarFixture();try{
 await syncAuditRequestNotifications(f.db,now);const old=f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").get() as AssuranceDeliveryOutbox;
 await f.save({profile:{...f.input.profile,calendarSource:{...f.source,name:'Forged name',version:99}}},owner);
 const saved=await f.read();assert.deepEqual(saved.profile.calendarSource,f.source);assert.equal(saved.profile.beforeDays,2);assert.equal(saved.profile.escalationRecipient,reviewer.email);assert.equal((await f.row()).dueDate,fields.dueDate);assert.equal((await f.row()).reviewDueDate,fields.reviewDueDate);
 assert.equal(await auditRequestNotificationCurrent(f.db,old,now),false);
 assert.equal(f.sqlite.prepare("SELECT status FROM continuous_assurance_notification_outbox WHERE id=?").get(old.id)?.status,'cancelled');
 const event=f.sqlite.prepare("SELECT snapshot_json FROM audit_request_events WHERE action='reminder-profile'").get()!;assert.deepEqual(JSON.parse(String(event.snapshot_json)).profile.calendarSource,f.source);
 await f.save({auditId:'audit-b',expectedWorkflowRevision:''});
 await f.publish(f.first.revision,{template:{...sharedCalendar,calendar:{...sharedCalendar.calendar,holidays:['2026-12-31']}}});
 assert.deepEqual((await f.read()).profile.calendarSource,f.source);assert.deepEqual((await f.read()).profile.holidays,['2026-10-29']);
 const {readAuditReminderProfile}=await import('../app/audit-reminder-store');assert.deepEqual((await readAuditReminderProfile(f.db,'audit-b')).profile.calendarSource,f.source);
}finally{f.sqlite.close();}});
test('new calendar adoption rejects stale, archived, mismatched and non-calendar definitions while existing pins remain usable',async()=>{const f=await calendarFixture();try{
 await assert.rejects(f.save({profile:{...f.input.profile,holidays:[]}}),/calendar-source/);
 await f.save();let saved=await f.read();const next=await f.publish(f.first.revision,{action:'archive'});
 await f.save({expectedRevision:saved.revision,profile:{...saved.profile,beforeDays:4}});saved=await f.read();assert.equal(saved.profile.beforeDays,4);assert.deepEqual(saved.profile.calendarSource,f.source);
 await assert.rejects(f.save({auditId:'audit-b',expectedWorkflowRevision:''}),/calendar-changed/);
 const {calendarSource:ignored,...legacy}=saved.profile;void ignored;
 await f.save({expectedRevision:saved.revision,profile:{...legacy,beforeDays:3}});saved=await f.read();assert.deepEqual(saved.profile.calendarSource,f.source);
 await f.save({expectedRevision:saved.revision,profile:{...legacy,holidays:[]}});saved=await f.read();assert.equal(saved.profile.calendarSource,undefined);
 const restored=await f.publish(next.revision,{action:'restore'});await assert.rejects(f.save({expectedRevision:saved.revision}),/calendar-changed/);
 await f.save({expectedRevision:saved.revision,profile:{...f.input.profile,calendarSource:{...f.source,revision:restored.revision,version:restored.version}}});saved=await f.read();
 await f.save({expectedRevision:saved.revision,profile:{...saved.profile,calendarSource:null}});assert.equal((await f.read()).profile.calendarSource,null);
 const {mutateSharedTemplate}=await import('../app/audit-shared-template-store');const nonId='AST-00000000-0000-0000-0000-000000000002';const non=await mutateSharedTemplate(f.db,admin,{id:nonId,action:'save',expectedRevision:'',template:{version:1,kind:'milestone',name:'Not calendar',fields:{title:'Review evidence'}},note:'Task definition'},now);
 await assert.rejects(f.save({expectedRevision:(await f.read()).revision,profile:{...f.input.profile,calendarSource:{...f.source,id:nonId,revision:non.revision}}}),/calendar-source/);
}finally{f.sqlite.close();}});
test('source revision and archival races cannot partially adopt a calendar or cancel valid queued reminders',async()=>{
 for(const sql of ["UPDATE audit_shared_templates SET revision='concurrent'","UPDATE audit_shared_templates SET archived=1"]){const f=await calendarFixture();try{
  await syncAuditRequestNotifications(f.db,now);f.race(()=>f.sqlite.exec(sql));await assert.rejects(f.save(),/conflict/);
  assert.equal((await f.read()).revision,'');assert.equal(f.sqlite.prepare("SELECT count(*) n FROM audit_request_events WHERE action='reminder-profile'").get()?.n,0);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n,1);
 }finally{f.sqlite.close();}}
});
test('calendar adoption enforces current audit grants, active actor and closed audit protections',async()=>{
 const f=await calendarFixture();try{
  await assert.rejects(f.save({}, {...owner,role:'Viewer'}),/forbidden/);
  await assert.rejects(f.save({}, {...owner,moduleAccess:{mode:'scoped',modules:{}}}),/forbidden/);
  f.race(()=>f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='o'"));await assert.rejects(f.save({},owner),/conflict/);assert.equal((await f.read()).revision,'');
  f.sqlite.exec("INSERT INTO audit_closure_state VALUES('audit-a','closed','closed','','')");await assert.rejects(f.save(),/audit-closed/);assert.equal((await f.read()).revision,'');
 }finally{f.sqlite.close();}
});
test('calendar adoption event failure rolls back provenance, calendar fields and queue withdrawal',async()=>{const f=await calendarFixture();try{
 await syncAuditRequestNotifications(f.db,now);f.sqlite.exec("CREATE TRIGGER reject_calendar_event BEFORE INSERT ON audit_request_events WHEN NEW.action='reminder-profile' BEGIN SELECT RAISE(ABORT,'calendar-event-failure');END");
 await assert.rejects(f.save(),/calendar-event-failure/);assert.equal((await f.read()).revision,'');assert.equal(f.sqlite.prepare("SELECT count(*) n FROM continuous_assurance_notification_outbox WHERE status='queued'").get()?.n,1);
}finally{f.sqlite.close();}});

const requestAdjustment = {dueDate:'2026-10-24',reviewDueDate:'2026-10-25',timeZone:'Europe/Istanbul',profileRevision:'calendar-v1',reason:'Move delivery and review past the approved holiday.'};
const requestAdjustedFields = {...fields,dueDate:'2026-10-27',reviewDueDate:'2026-10-27'};
async function requestCalendarFixture(active=true) {
  const f=await fixture();await ensureAuditClosureSchema(f.db);
  f.sqlite.prepare('INSERT INTO audit_reminder_profiles VALUES(?,?,?,?,?)').run('audit-a','calendar-v1',JSON.stringify({...defaultAuditReminderProfile,mode:'business',holidays:['2026-10-26']}),admin.email,'');
  if(active){await f.create();await f.start();}
  const payload=async()=>({fields:requestAdjustedFields,deadlineAdjustment:{...requestAdjustment,timeZone:active?'Europe/Istanbul':'UTC'},expectedWorkflowRevision:(await f.state()).workflow.revision});
  const events=()=>f.sqlite.prepare('SELECT snapshot_json FROM audit_request_events ORDER BY rowid DESC').all().map(e=>JSON.parse(String(e.snapshot_json)));
  return {...f,payload,events};
}
test('request date planning creates silent drafts with event-only proof, preserves periods and uses the launch time zone',async()=>{const f=await requestCalendarFixture(false);try{
  await mutateAuditRequest(f.db,admin,{auditId:'audit-a',requestId:'ARQ-a',expectedRevision:'',action:'create',...await f.payload()},now);
  const row=await f.row();assert.equal(row.status,'draft');assert.equal(row.periodStart,fields.periodStart);assert.equal(row.periodEnd,fields.periodEnd);assert.equal(row.dueDate,'2026-10-27');assert.equal('deadlineAdjustment' in row,false);
  const proof=f.events()[0].deadlineAdjustment;assert.equal(proof.before.timeZone,'UTC');assert.equal(proof.reason,requestAdjustment.reason);assert.deepEqual(proof.calendar.holidays,['2026-10-26']);
  await syncAuditRequestNotifications(f.db,now);assert.equal((await readAuditRequestWork(f.db)).requests.length,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM continuous_assurance_notification_outbox').get()?.n,0);
  await f.start();assert.equal(f.events()[0].deadlineAdjustment,undefined);assert.equal((await readAuditRequestWork(f.db)).requests[0].dueAt,'2026-10-27T20:59:59.999Z');
}finally{f.sqlite.close();}});
test('request date edits withdraw stale reminders, retain history and reset submitted review through the normal lifecycle',async()=>{const f=await requestCalendarFixture();try{
  await syncAuditRequestNotifications(f.db,now);const old=f.sqlite.prepare("SELECT * FROM continuous_assurance_notification_outbox WHERE status='queued'").get() as AssuranceDeliveryOutbox;
  await f.act('edit',owner,await f.payload());assert.equal((await f.row()).dueDate,'2026-10-27');assert.equal(await auditRequestNotificationCurrent(f.db,old,now),false);assert.equal(f.sqlite.prepare('SELECT status FROM continuous_assurance_notification_outbox WHERE id=?').get(old.id)?.status,'cancelled');
  assert.equal(f.events()[0].deadlineAdjustment.after.timeZone,'Europe/Istanbul');assert.equal(f.events()[0].deadlineAdjustment.before.dueDate,'2026-10-24');
  await f.act('submit',owner,{versionIds:['EVV-one']});await f.act('edit',admin,await f.payload());assert.equal((await f.row()).status,'assigned');assert.equal((await f.row()).submittedBy,'');
  await assert.rejects(f.act('accept',reviewer,{note:'Stale review cannot approve'}),/transition/);
  await f.act('edit',admin,{fields:{...requestAdjustedFields,title:'Manually edited title'}});assert.equal(f.events()[0].deadlineAdjustment,undefined);assert.equal(f.events().filter(e=>e.deadlineAdjustment).length,2);
}finally{f.sqlite.close();}});
test('only the assigned independent reviewer may return with planned dates; resubmission and approval keep the proof in its own event',async()=>{const f=await requestCalendarFixture();try{
  await f.act('submit',owner,{versionIds:['EVV-one']});const extra={...await f.payload(),note:'Missing independent approval for sample.'};
  for(const actor of [owner,admin])await assert.rejects(f.act('return',actor,extra),/forbidden/);
  await f.act('return',reviewer,extra);assert.equal((await f.row()).status,'changes_requested');assert.equal((await f.row()).reviewDueDate,'2026-10-27');assert.equal(f.events()[0].deadlineAdjustment.reason,requestAdjustment.reason);
  assert.equal((await readAuditRequestWork(f.db)).requests[0].dueAt,'2026-10-27T20:59:59.999Z');
  await f.act('submit',owner,{versionIds:['EVV-one']});await f.act('accept',reviewer,{note:'Meets acceptance criteria'});assert.equal(f.events()[0].deadlineAdjustment,undefined);
  await assert.rejects(f.act('edit',admin,await f.payload()),/transition/);
}finally{f.sqlite.close();}});
test('request planning rejects tampered dates, timezone, reason, stale calendar/workflow and receipts on unrelated actions',async()=>{const f=await requestCalendarFixture();try{
  const before=await f.row(),input=await f.payload();
  for(const patch of [{fields:{...requestAdjustedFields,dueDate:'2026-10-28',reviewDueDate:'2026-10-28'}},{deadlineAdjustment:{...requestAdjustment,timeZone:'UTC'}},{deadlineAdjustment:{...requestAdjustment,reason:' '}},{deadlineAdjustment:{...requestAdjustment,profileRevision:'stale'}},{deadlineAdjustment:{...requestAdjustment,extra:true}},{expectedWorkflowRevision:'stale'},{deadlineAdjustment:{...requestAdjustment,dueDate:'2026-10-27',reviewDueDate:'2026-10-27'}}])await assert.rejects(f.act('edit',admin,{...input,...patch}),/deadline-adjustment|deadline-calendar-conflict|conflict/);
  for(const action of ['start','activate','submit','accept','cancel'])await assert.rejects(f.act(action,admin,input),/deadline-adjustment/);
  await assert.rejects(f.act('edit',{...admin,role:'Viewer'},input),/forbidden/);assert.deepEqual(await f.row(),before);
  f.sqlite.exec("UPDATE local_users SET status='Disabled' WHERE id='a'");await assert.rejects(f.act('edit',admin,input),/forbidden/);
}finally{f.sqlite.close();}});
test('request calendar revision, contents and deletion races leave dates, history, queue and report revision unchanged',async()=>{
  for(const mode of ['revision','contents','delete','event']){const f=await requestCalendarFixture();try{
    await syncAuditRequestNotifications(f.db,now);const before=await f.row(),count=f.events().length,source=f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision;
    const queue=f.sqlite.prepare('SELECT * FROM continuous_assurance_notification_outbox').all();
    if(mode==='event')f.sqlite.exec("CREATE TRIGGER fail_adjustment_event BEFORE INSERT ON audit_request_events BEGIN SELECT RAISE(ABORT,'event-failure');END");
    else f.race(()=>{if(mode==='revision')f.sqlite.exec("UPDATE audit_reminder_profiles SET revision='calendar-v2'");if(mode==='contents')f.sqlite.exec("UPDATE audit_reminder_profiles SET data_json=json_set(data_json,'$.holidays',json('[]'))");if(mode==='delete')f.sqlite.exec('DELETE FROM audit_reminder_profiles');});
    await assert.rejects(f.act('edit',admin,await f.payload()),/deadline-calendar-conflict|event-failure/);assert.deepEqual(await f.row(),before);assert.equal(f.events().length,count);assert.deepEqual(f.sqlite.prepare('SELECT * FROM continuous_assurance_notification_outbox').all(),queue);assert.equal(f.sqlite.prepare('SELECT revision FROM audit_report_source_revision').get()?.revision,source);
  }finally{f.sqlite.close();}}
});
test('request adjustment binds actor status, role, policy, work plan state/revision/zone and closed-audit locks at commit',async()=>{
  for(const change of ["UPDATE local_users SET status='Disabled' WHERE id='a'","UPDATE local_users SET role='Viewer' WHERE id='a'","INSERT INTO user_module_access VALUES('a','{\"mode\":\"scoped\",\"modules\":{}}')","UPDATE audit_request_workflows SET revision='changed'","UPDATE audit_request_workflows SET time_zone='UTC'","UPDATE audit_request_workflows SET state='closed'","INSERT INTO audit_closure_state VALUES('audit-a','closed','c','','')"]){const f=await requestCalendarFixture();try{
    const before=await f.row(),count=f.events().length;f.race(()=>f.sqlite.exec(change));await assert.rejects(f.act('edit',admin,await f.payload()),/conflict|audit-closed/);assert.deepEqual(await f.row(),before);assert.equal(f.events().length,count);
  }finally{f.sqlite.close();}}
});
test('request creation cannot cross a concurrent work plan launch or leave a partial draft after an event failure',async()=>{
  for(const mode of ['launch','event']){const f=await requestCalendarFixture(false);try{
    if(mode==='event')f.sqlite.exec("CREATE TRIGGER fail_new_adjustment BEFORE INSERT ON audit_request_events BEGIN SELECT RAISE(ABORT,'event-failure');END");else f.race(()=>f.sqlite.exec("INSERT INTO audit_request_workflows VALUES('audit-a','active','concurrent','Europe/Istanbul','')"));
    await assert.rejects(mutateAuditRequest(f.db,admin,{auditId:'audit-a',requestId:'ARQ-a',expectedRevision:'',action:'create',...await f.payload()},now),/conflict|event-failure/);assert.equal((await f.state()).requests.length,0);assert.equal(f.events().length,0);
  }finally{f.sqlite.close();}}
});
