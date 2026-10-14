import test from 'node:test';
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
  let beforeBatch: (() => void) | undefined;
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { const hook = beforeBatch; beforeBatch = undefined; hook?.(); sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  await ensureAuditRequestSchema(db); await ensureEvidenceHistorySchema(db);
  sqlite.prepare(`INSERT INTO evidence_versions(id,evidence_id,version_no,file_key,file_name,file_type,file_size,content_sha256,chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('EVV-one','EVD-a',1,'evidence/EVD-a/v1.pdf','v1.pdf','application/pdf',100,'a'.repeat(64),'b'.repeat(64),'Access review',owner.email,'Q3 2026','','CTRL-1','Initial',owner.email,now.toISOString());
  const create = (requestId = 'ARQ-a', patch = {}) => mutateAuditRequest(db, admin, { auditId: 'audit-a', requestId, expectedRevision: '', action: 'create', fields: { ...fields, ...patch } }, now);
  const state = () => readAuditRequestWorkflow(db, 'audit-a');
  const row = async () => (await state()).requests[0];
  const act = async (action: string, who = admin, extra = {}) => mutateAuditRequest(db, who, { auditId: 'audit-a', requestId: 'ARQ-a', expectedRevision: (await row()).revision, action, ...extra }, now);
  const start = async () => mutateAuditRequest(db, admin, { auditId: 'audit-a', action: 'start', expectedRevision: '', expectedPlanRevision: '', timeZone: 'Europe/Istanbul', expectedDrafts: requestDraftPreview((await state()).requests) }, now);
  const add = async (id = 'ARQ-extra') => mutateAuditRequest(db, admin, { auditId: 'audit-a', action: 'create', requestId: id, expectedRevision: '', expectedWorkflowRevision: (await state()).workflow.revision, fields }, now);
  const activation = async () => { const current = await state(); return { auditId: 'audit-a', action: 'activate', expectedRevision: current.workflow.revision, expectedPlanRevision: '', expectedDrafts: requestDraftPreview(current.requests), note: 'Additional review required for scope change' }; };
  return { db, sqlite, create, state, row, act, start, add, activation, race: (hook: () => void) => { beforeBatch = hook; } };
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
