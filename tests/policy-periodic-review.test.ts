import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/enterprise-route-fixture';
import { projectEnterpriseWork } from '../app/enterprise-work';
import { validPolicyReviewDate } from '../app/policy-lifecycle/periodic-review';

const stamp = '2020-01-01T12:00:00.000Z', actor = { id: 'reviewer', email: 'reviewer@example.com', name: 'Reviewer', role: 'Admin' as const, source: 'local' as const };
const future = (days = 30) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const content = 'This controlled security policy describes access responsibilities, annual suitability review and retained independent decisions.';
const digest = createHash('sha256').update(content).digest('hex');
async function setup() {
  const f = fixture('policy-lifecycle'); await f.post({});
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(actor.id, actor.name, actor.email, actor.role, 'Active');
  const policy = { id: 'POL-1', code: 'POL-001', title: 'Controlled security policy', category: 'security', classification: 'internal', owner: 'owner@example.com', reviewer: actor.email, audience: 'All employees', review_frequency_days: 365, status: 'published', current_version_id: 'PV-1', next_review: '2020-01-01', created_by: 'creator@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  const version = { id: 'PV-1', policy_id: 'POL-1', version_number: 1, summary: 'Initial controlled policy content.', content, content_sha256: digest, control_refs_json: '["CTRL-1"]', regulation_refs_json: '[]', risk_refs_json: '[]', effective_date: '2019-01-01', status: 'published', created_by: 'writer@example.com', submitted_by: 'submitter@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  for (const [table, row] of [['policy_documents', policy], ['policy_versions', version]] as const) f.sqlite.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  f.setActor(actor); await workspace(f); return f;
}
const workspace = async (f: ReturnType<typeof fixture>) => (await f.get('view=review&policyId=POL-1')).body;
const row = (f: ReturnType<typeof fixture>, table = 'policy_documents') => f.sqlite.prepare(`SELECT * FROM ${table}`).get()!;
const count = (f: ReturnType<typeof fixture>, table = 'policy_periodic_reviews') => Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
const request = async (f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) => ({ action: 'review-policy', policyId: 'POL-1', requestId: 'PPR-00000000-0000-4000-8000-000000000001', expectedRevision: (await workspace(f)).revision, nextReviewDate: future(), note: 'Reviewed scope, mappings and published content; this policy remains suitable.', confirmation: 'POLICY REVIEWED', ...patch });
function pending(f: ReturnType<typeof fixture>, status = 'draft') {
  f.sqlite.prepare("INSERT INTO policy_versions SELECT 'PV-2',policy_id,2,summary,content,content_sha256,control_refs_json,regulation_refs_json,risk_refs_json,effective_date,?,evidence_reference,evidence_sha256,decision_note,decision_evidence_reference,decision_evidence_sha256,created_by,created_at,updated_by,updated_at,submitted_by,submitted_at,approved_by,approved_at,published_by,published_at FROM policy_versions WHERE id='PV-1'").run(status);
}

test('periodic review advances only schedule metadata, snapshots exact content and updates My Work', async () => {
  const f = await setup(); try {
    const before = row(f), version = row(f, 'policy_versions'), result = await f.post(await request(f)); assert.equal(result.status, 200); assert.equal(result.body.replay, false);
    const after = row(f); for (const key of Object.keys(before).filter(key => !['next_review', 'updated_at', 'updated_by'].includes(key))) assert.equal(after[key], before[key], key);
    assert.equal(after.next_review, future()); assert.equal(after.updated_by, actor.email); assert.deepEqual(row(f, 'policy_versions'), version); assert.equal(count(f), 1); assert.equal(count(f, 'policy_events'), 1);
    const current = await workspace(f), review = (current.reviews as { snapshot: { policy: typeof before; version: typeof version }; actor: string }[])[0];
    assert.equal(current.historyVerified, true); assert.deepEqual(review.snapshot.policy, { ...before }); assert.deepEqual(review.snapshot.version, { ...version }); assert.equal(review.actor, actor.email);
    const projected = projectEnterpriseWork('policy', (await f.get()).body); assert.equal(projected.complete, true); assert.equal(projected.rows.find(r => r.id.includes('POL-1'))?.data.dueDate, future());
  } finally { f.sqlite.close(); }
});

test('identical lost-response retries return the original record even after later source changes', async () => {
  const f = await setup(); try {
    const input = await request(f); assert.equal((await f.post(input)).status, 200); const after = row(f);
    assert.equal((await f.post(input)).body.replay, true); assert.deepEqual(row(f), after);
    for (const patch of [{ note: 'A different justification cannot reuse this request.' }, { nextReviewDate: future(31) }, { expectedRevision: (await workspace(f)).revision }]) assert.equal((await f.post({ ...input, ...patch })).status, 409);
    f.sqlite.exec("UPDATE policy_documents SET status='retired',reviewer='new@example.com'"); assert.equal((await f.post(input)).body.replay, true); assert.equal(count(f), 1); assert.equal(count(f, 'policy_events'), 1);
  } finally { f.sqlite.close(); }
});

test('only the assigned independent Admin can review policy and version makers cannot self-review', async () => {
  for (const [table, field, value] of [['policy_documents','owner',actor.email], ['policy_documents','created_by',actor.email.toUpperCase()], ['policy_documents','reviewer','other@example.com'], ['policy_versions','created_by',actor.email], ['policy_versions','submitted_by',actor.email]]) {
    const f = await setup(); try { f.sqlite.prepare(`UPDATE ${table} SET ${field}=?`).run(value); assert.equal((await workspace(f)).canReview, false); assert.equal((await f.post(await request(f))).status, 403); assert.equal(count(f), 0); } finally { f.sqlite.close(); }
  }
  for (const role of ['Editor', 'Viewer'] as const) { const f = await setup(); try { f.setActor({ ...actor, role }); assert.equal((await workspace(f)).canReview, false); assert.equal((await f.post(await request(f))).status, 403); } finally { f.sqlite.close(); } }
});

test('an ongoing new version blocks review and concurrent creation is guarded at commit', async () => {
  for (const status of ['draft', 'review', 'approved']) {
    const f = await setup(); try { pending(f, status); assert.equal((await workspace(f)).pendingRevision, true); assert.equal((await workspace(f)).canReview, false); assert.equal((await f.post(await request(f))).status, 409); assert.equal(count(f), 0); } finally { f.sqlite.close(); }
    const raced = await setup(); try { const input = await request(raced); raced.before(() => pending(raced, status)); assert.equal((await raced.post(input)).status, 409); assert.equal(row(raced).next_review, '2020-01-01'); assert.equal(count(raced), 0); assert.equal(count(raced, 'policy_events'), 0); } finally { raced.sqlite.close(); }
  }
  const f = await setup(); try { pending(f, 'rejected'); assert.equal((await workspace(f)).canReview, true); assert.equal((await f.post(await request(f))).status, 200); } finally { f.sqlite.close(); }
});

test('input and frequency limits reject invalid, past, unchanged and excessive dates', async () => {
  const f = await setup(); try {
    const input = await request(f), before = row(f);
    for (const patch of [{nextReviewDate:'2026-02-31'}, {nextReviewDate:future(0)}, {nextReviewDate:'2020-01-01'}, {nextReviewDate:future(366)}, {nextReviewDate:'2030-01-01junk'}, {note:'Short'}, {note:'x'.repeat(2001)}, {note:'Reason with a forbidden\u0000 null character'}, {confirmation:'yes'}, {requestId:'../bad'}, {expectedRevision:''}, {policyId:'../POL-1'}]) assert.equal((await f.post({...input,...patch})).status, 400, JSON.stringify(patch));
    assert.deepEqual(row(f), before); assert.equal(count(f), 0);
    f.sqlite.prepare('UPDATE policy_documents SET next_review=?').run(future(60)); assert.equal((await f.post(await request(f, { nextReviewDate: future(60) }))).status, 400);
    assert.equal((await f.post(await request(f, { nextReviewDate: future(365) }))).status, 200);
    assert.equal(validPolicyReviewDate('2028-02-29'), true); assert.equal(validPolicyReviewDate('2027-02-29'), false);
    for (const query of ['view=review', 'view=review&policyId=POL-1&policyId=POL-2', 'view=review&policyId=../bad']) assert.equal((await f.get(query)).status, 400);
    assert.equal((await f.get('view=review&policyId=absent')).status, 404);
  } finally { f.sqlite.close(); }
});

test('non-published or corrupt content cannot be reviewed as current', async () => {
  for (const sql of ["UPDATE policy_documents SET status='retired'", "UPDATE policy_versions SET status='superseded'", "UPDATE policy_versions SET content='Altered content without its original digest'", "UPDATE policy_versions SET content_sha256='bad'", "UPDATE policy_versions SET control_refs_json='bad'", "UPDATE policy_documents SET review_frequency_days=5000", "UPDATE policy_documents SET next_review='invalid'"]) {
    const f = await setup(); try { f.sqlite.exec(sql); assert.equal((await workspace(f)).canReview, false); assert.equal((await f.post(await request(f))).status, 409); assert.equal(count(f), 0); } finally { f.sqlite.close(); }
  }
});

test('complete source changes reject stale decisions and SQL races without partial writes', async () => {
  for (const sql of ["UPDATE policy_documents SET title='Changed title without revision stamp'", "UPDATE policy_documents SET reviewer='other@example.com'", "UPDATE policy_documents SET status='retired'", "UPDATE policy_versions SET summary='A changed summary without revision stamp'", "UPDATE policy_versions SET content='Changed published content'", "UPDATE policy_versions SET control_refs_json='[\"CTRL-OTHER\"]'", "UPDATE policy_versions SET status='superseded'"]) {
    for (const race of [false, true]) { const f = await setup(); try { const input = await request(f); if(race) f.before(() => f.sqlite.exec(sql)); else f.sqlite.exec(sql); assert.ok([403,409].includes((await f.post(input)).status), sql); assert.equal(row(f).next_review, '2020-01-01'); assert.equal(count(f), 0); assert.equal(count(f, 'policy_events'), 0); } finally { f.sqlite.close(); } }
  }
});

test('live identity, role, account status and module access policy are bound at commit', async () => {
  for (const sql of ["UPDATE local_users SET role='Viewer'", "UPDATE local_users SET status='Disabled'", "UPDATE local_users SET email='changed@example.com'", "INSERT INTO user_module_access VALUES('reviewer','{\"mode\":\"scoped\",\"modules\":{}}')", 'DELETE FROM local_users']) {
    const f = await setup(); try { const input = await request(f); f.before(() => f.sqlite.exec(sql)); assert.equal((await f.post(input)).status, 409); assert.equal(count(f), 0); assert.equal(row(f).next_review, '2020-01-01'); } finally { f.sqlite.close(); }
  }
  const f = await setup(); try { f.sqlite.exec("UPDATE local_users SET status='Disabled'"); assert.equal((await f.post(await request(f))).status, 403); } finally { f.sqlite.close(); }
});

test('dependent write failures roll back schedule changes and history; migration preserves existing rows', async () => {
  for (const table of ['policy_periodic_reviews','policy_events']) { const f = await setup(); try { const before = row(f); f.sqlite.exec(readFileSync('drizzle/0099_policy_periodic_reviews.sql','utf8')); assert.deepEqual(row(f),before); f.sqlite.exec(`CREATE TRIGGER fail_review BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced-failure'); END`); assert.equal((await f.post(await request(f))).status,400); assert.deepEqual(row(f),before); assert.equal(count(f),0); assert.equal(count(f,'policy_events'),0); } finally { f.sqlite.close(); } }
});

test('immutable bounded history retains original snapshots and labels damaged snapshots', async () => {
  const f = await setup(); try {
    for(let i=1;i<=21;i++) assert.equal((await f.post(await request(f,{requestId:`PPR-00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,nextReviewDate:future(i)}))).status,200);
    let data=await workspace(f); assert.equal((data.reviews as unknown[]).length,20); assert.equal(data.hasMore,true); assert.equal(data.historyVerified,true);
    assert.throws(()=>f.sqlite.exec("UPDATE policy_periodic_reviews SET note='changed'"),/immutable-policy-review/); assert.throws(()=>f.sqlite.exec('DELETE FROM policy_periodic_reviews'),/immutable-policy-review/);
    f.sqlite.exec("DROP TRIGGER policy_periodic_review_no_update; UPDATE policy_periodic_reviews SET snapshot_json='{}'"); data=await workspace(f); assert.equal(data.historyVerified,false); assert.equal((data.reviews as {snapshot:unknown}[])[0].snapshot,null);
  } finally { f.sqlite.close(); }
});
