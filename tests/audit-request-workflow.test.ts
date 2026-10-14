import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { ensureAuditRequestSchema, mutateAuditRequest, readAuditRequestWorkflow, readAuditRequestWork, auditRequestActorActive } from '../app/audit-request-store';
import { ensureEvidenceHistorySchema } from '../app/evidence/versioning';
import { auditRequestNotification, auditRequestNotificationCurrent, syncAuditRequestNotifications } from '../app/audit-request-notifications';
import { syncAssuranceNotificationOutbox } from '../app/assurance-executive-operations';
import { requestDueAt, validateAuditRequestFields, validateRequestTimeZone, type AuditRequestFields } from '../app/audit-requests';
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
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  await ensureAuditRequestSchema(db); await ensureEvidenceHistorySchema(db);
  sqlite.prepare(`INSERT INTO evidence_versions(id,evidence_id,version_no,file_key,file_name,file_type,file_size,content_sha256,chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('EVV-one','EVD-a',1,'evidence/EVD-a/v1.pdf','v1.pdf','application/pdf',100,'a'.repeat(64),'b'.repeat(64),'Access review',owner.email,'Q3 2026','','CTRL-1','Initial',owner.email,now.toISOString());
  const create = (requestId = 'ARQ-a', patch = {}) => mutateAuditRequest(db, admin, { auditId: 'audit-a', requestId, expectedRevision: '', action: 'create', fields: { ...fields, ...patch } }, now);
  const state = () => readAuditRequestWorkflow(db, 'audit-a');
  const row = async () => (await state()).requests[0];
  const act = async (action: string, who = admin, extra = {}) => mutateAuditRequest(db, who, { auditId: 'audit-a', requestId: 'ARQ-a', expectedRevision: (await row()).revision, action, ...extra }, now);
  const start = () => mutateAuditRequest(db, admin, { auditId: 'audit-a', action: 'start', expectedRevision: '', expectedPlanRevision: '', timeZone: 'Europe/Istanbul' }, now);
  return { db, sqlite, create, state, row, act, start };
}
test('fields reject impossible dates, wrong periods, same reviewer and invalid timezone', () => {
  for (const patch of [{ title: '' }, { instructions: '' }, { reviewer: owner.email }, { dueDate: '2026-02-30' }, { reviewDueDate: '2026-10-01' }, { periodEnd: '' }, { periodStart: '2027-01-01' }]) assert.throws(() => validateAuditRequestFields({ ...fields, ...patch }));
  assert.equal(validateAuditRequestFields({ ...fields, owner: ' OWNER@EXAMPLE.COM ' }).owner, owner.email);
  assert.equal(validateRequestTimeZone('Europe/Istanbul'), 'Europe/Istanbul'); assert.throws(() => validateRequestTimeZone('Mars/City'));
});
test('drafts are silent; start creates work once; plan drift and post-start additions fail', async () => {
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
