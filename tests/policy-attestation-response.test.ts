import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/enterprise-route-fixture';
import { projectEnterpriseWork } from '../app/enterprise-work';

const actor = { id: 'subject', email: 'subject@example.com', name: 'Subject', role: 'Viewer' as const, source: 'local' as const };
const stamp = '2020-01-01T12:00:00.000Z', content = 'This issued policy governs individual access responsibilities, information protection and the preservation of accountable policy decisions.';
const digest = createHash('sha256').update(content).digest('hex');
async function setup() {
  const f = fixture('policy-lifecycle'); await f.post({});
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(actor.id, actor.name, actor.email, actor.role, 'Active');
  const policy = { id: 'POL-1', code: 'POL-001', title: 'Controlled subject policy', category: 'security', classification: 'internal', owner: 'owner@example.com', reviewer: 'reviewer@example.com', audience: 'All employees', review_frequency_days: 365, status: 'published', current_version_id: 'PV-1', next_review: '2020-01-01', created_by: 'creator@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  const version = { id: 'PV-1', policy_id: 'POL-1', version_number: 1, summary: 'Original issued policy content.', content, content_sha256: digest, control_refs_json: '["CTRL-1"]', regulation_refs_json: '[]', risk_refs_json: '[]', effective_date: '2019-01-01', status: 'published', created_by: 'writer@example.com', created_at: stamp, updated_by: 'owner@example.com', updated_at: stamp };
  const campaign = { id: 'PAC-1', policy_id: 'POL-1', version_id: 'PV-1', name: 'Original issued campaign', audience: 'Issued team', due_date: '2020-01-01', required_count: 1, status: 'open', created_by: 'owner@example.com', created_at: stamp };
  const attestation = { id: 'PAT-1', campaign_id: 'PAC-1', subject_email: actor.email, status: 'pending', updated_at: stamp };
  for (const [table, row] of [['policy_documents', policy], ['policy_versions', version], ['policy_attestation_campaigns', campaign], ['policy_attestations', attestation]] as const) f.sqlite.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  f.setActor(actor); await workspace(f); return f;
}
const workspace = async (f: ReturnType<typeof fixture>) => (await f.get('view=attestation&attestationId=PAT-1')).body;
const row = (f: ReturnType<typeof fixture>, table = 'policy_attestations') => f.sqlite.prepare(`SELECT * FROM ${table}`).get()!;
const count = (f: ReturnType<typeof fixture>, table = 'policy_attestation_receipts') => Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n);
const request = async (f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) => ({ action: 'attest', responseMode: 'reviewed', attestationId: 'PAT-1', requestId: 'PAR-00000000-0000-4000-8000-000000000001', expectedRevision: (await workspace(f)).revision, decision: 'attested', note: 'Read the exact issued policy and accept its responsibilities.', confirmation: 'OKUDUM VE KABUL EDİYORUM', ...patch });
function supersede(f: ReturnType<typeof fixture>) {
  f.sqlite.exec("UPDATE policy_versions SET status='superseded';UPDATE policy_documents SET current_version_id='PV-2';INSERT INTO policy_versions SELECT 'PV-2',policy_id,2,summary,content,content_sha256,control_refs_json,regulation_refs_json,risk_refs_json,effective_date,'published',evidence_reference,evidence_sha256,decision_note,decision_evidence_reference,decision_evidence_sha256,created_by,created_at,updated_by,updated_at,submitted_by,submitted_at,approved_by,approved_at,published_by,published_at FROM policy_versions WHERE id='PV-1'");
}

test('subject reads and accepts the exact campaign version; canonical response, receipt and My Work agree', async () => {
  const f = await setup(); try {
    const before = await workspace(f), result = await f.post(await request(f)); assert.equal(result.status, 200); assert.equal(result.body.replay, false);
    const after = await workspace(f), receipt = after.receipt as { snapshot: typeof before; contentSha256: string; actor: string };
    assert.equal(after.canRespond, false); assert.deepEqual(receipt.snapshot, JSON.parse(JSON.stringify({ attestation: before.attestation, campaign: before.campaign, policy: before.policy, version: before.version, revision: before.revision, contentVerified: true })));
    assert.equal(receipt.contentSha256, digest); assert.equal(receipt.actor, actor.email); assert.equal(row(f).content_sha256, digest); assert.equal(row(f).status, 'attested'); assert.equal(count(f), 1); assert.equal(count(f, 'policy_events'), 1);
    const work = projectEnterpriseWork('policy', (await f.get()).body); assert.equal(work.complete, true); assert.equal(work.rows.find(r => r.nativeRef === 'PAT-1')?.data.status, 'attested');
  } finally { f.sqlite.close(); }
});
test('superseded assigned version remains respondable and overdue open campaigns accept explicit refusal', async () => {
  const f = await setup(); try { supersede(f); const source = await workspace(f); assert.equal(source.previousVersion, true); assert.equal(source.canRespond, true); assert.equal((source.version as {id:string}).id, 'PV-1'); assert.equal((await f.post(await request(f, {decision:'declined',confirmation:'KABUL ETMİYORUM'}))).status,200); assert.equal(row(f).status,'declined'); assert.equal(row(f).content_sha256,digest); } finally { f.sqlite.close(); }
});
test('lost-response replay returns original outcome after closure/publication changes; altered reuse conflicts', async () => {
  const f = await setup(); try {
    const input = await request(f); assert.equal((await f.post(input)).status,200); const before=row(f); supersede(f); f.sqlite.exec("UPDATE policy_attestation_campaigns SET status='closed'");
    assert.equal((await f.post(input)).body.replay,true); assert.deepEqual(row(f),before); assert.equal(count(f),1); assert.equal(count(f,'policy_events'),1);
    for(const patch of [{note:'A different response'}, {decision:'declined',confirmation:'KABUL ETMİYORUM'}, {expectedRevision:'f'.repeat(64)}, {attestationId:'PAT-2'}]) assert.equal((await f.post({...input,...patch})).status,409);
    const receipt=(await workspace(f)).receipt as {snapshot:{version:{status:string};campaign:{status:string}}};assert.equal(receipt.snapshot.version.status,'published');assert.equal(receipt.snapshot.campaign.status,'open');
  } finally { f.sqlite.close(); }
});
test('another subject or Admin cannot read or respond on behalf of the assigned user', async () => {
  for(const role of ['Admin','Editor','Viewer'] as const){const f=await setup();try{const input=await request(f);f.sqlite.prepare('UPDATE local_users SET email=?,role=?').run('other@example.com',role);f.setActor({...actor,email:'other@example.com',role});assert.equal((await f.get('view=attestation&attestationId=PAT-1')).status,403);assert.equal((await f.get('view=attestation&attestationId=absent')).status,403);assert.equal((await f.post(input)).status,403);assert.equal(count(f),0);}finally{f.sqlite.close();}}
});
test('assigned full-access Viewer, Editor and Admin can respond; scope/account/identity failures deny reads and writes', async () => {
  for(const role of ['Admin','Editor','Viewer'] as const){const f=await setup();try{f.sqlite.prepare('UPDATE local_users SET role=?').run(role);f.setActor({...actor,role});assert.equal((await f.post(await request(f))).status,200);}finally{f.sqlite.close();}}
  for(const sql of ["UPDATE local_users SET status='Disabled'", "UPDATE local_users SET role='Editor'", "UPDATE local_users SET email='changed@example.com'", "INSERT INTO user_module_access VALUES('subject','{\"mode\":\"scoped\",\"modules\":{}}')", "INSERT INTO user_module_access VALUES('subject','broken')",'DELETE FROM local_users']){const f=await setup();try{const input=await request(f);f.sqlite.exec(sql);assert.equal((await f.get('view=attestation&attestationId=PAT-1')).status,403);assert.equal((await f.post(input)).status,403);assert.equal(count(f),0);}finally{f.sqlite.close();}}
});
test('input validation never downgrades a malformed reviewed request into legacy mode', async () => {
  const f=await setup();try{const input=await request(f);for(const patch of [{responseMode:'other'}, {responseMode:undefined}, {requestId:''}, {attestationId:'../bad'}, {expectedRevision:''}, {decision:'accepted'}, {note:'x'}, {note:'x'.repeat(1001)}, {note:'null\u0000 character'}, {confirmation:'yes'}])assert.equal((await f.post({...input,...patch})).status,400,JSON.stringify(patch));for(const q of ['view=attestation', 'view=attestation&attestationId=PAT-1&attestationId=PAT-2','view=attestation&attestationId=../bad'])assert.equal((await f.get(q)).status,400);assert.equal(count(f),0);}finally{f.sqlite.close();}
});
test('closed campaigns, completed responses, retired policies and invalid content fail closed', async () => {
  for(const sql of ["UPDATE policy_attestation_campaigns SET status='closed'", "UPDATE policy_attestations SET status='declined'", "UPDATE policy_documents SET status='retired'", "UPDATE policy_versions SET status='draft'", "UPDATE policy_versions SET content='Tampered policy content'", "UPDATE policy_versions SET content_sha256='bad'", "UPDATE policy_versions SET control_refs_json='{}'", "UPDATE policy_versions SET regulation_refs_json='[null]'", "UPDATE policy_versions SET effective_date='invalid'", "UPDATE policy_versions SET effective_date='2026-10-28junk'", "UPDATE policy_attestation_campaigns SET due_date='invalid'"]){const f=await setup();try{f.sqlite.exec(sql);assert.equal((await workspace(f)).canRespond,false);assert.equal((await f.post(await request(f))).status,409);assert.equal(count(f),0);}finally{f.sqlite.close();}}
});
test('complete displayed source changes reject stale previews and mid-transaction races without partial responses', async () => {
  const changes=["UPDATE policy_documents SET title='Changed title without timestamp'", "UPDATE policy_documents SET audience='Changed audience'", "UPDATE policy_versions SET summary='Changed policy summary'", "UPDATE policy_versions SET control_refs_json='[\"CTRL-2\"]'", "UPDATE policy_versions SET status='superseded'", "UPDATE policy_attestation_campaigns SET due_date='2030-01-01'", "UPDATE policy_attestation_campaigns SET audience='New team'", "UPDATE policy_attestation_campaigns SET status='closed'", "UPDATE policy_attestations SET note='Concurrent change'", "UPDATE policy_attestations SET subject_email='other@example.com'"];
  for(const sql of changes)for(const race of [false,true]){const f=await setup();try{const input=await request(f);if(race)f.before(()=>f.sqlite.exec(sql));else f.sqlite.exec(sql);assert.ok([403,409].includes((await f.post(input)).status),sql);assert.equal(row(f).status,'pending');assert.equal(count(f),0);assert.equal(count(f,'policy_events'),0);}finally{f.sqlite.close();}}
});
test('commit guards live account, role, identity and module policy mutations', async () => {
  for(const sql of ["UPDATE local_users SET status='Disabled'", "UPDATE local_users SET role='Editor'", "UPDATE local_users SET email='other@example.com'", "INSERT INTO user_module_access VALUES('subject','{\"mode\":\"scoped\",\"modules\":{}}')",'DELETE FROM local_users']){const f=await setup();try{const input=await request(f);f.before(()=>f.sqlite.exec(sql));assert.equal((await f.post(input)).status,409);assert.equal(row(f).status,'pending');assert.equal(count(f),0);}finally{f.sqlite.close();}}
});
test('dependent failures roll back response and evidence; migration is additive and receipts immutable', async () => {
  for(const table of ['policy_attestation_receipts','policy_events']){const f=await setup();try{const before=row(f);f.sqlite.exec(readFileSync('drizzle/0100_policy_attestation_receipts.sql','utf8'));assert.deepEqual(row(f),before);f.sqlite.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'forced-failure'); END`);assert.equal((await f.post(await request(f))).status,400);assert.deepEqual(row(f),before);assert.equal(count(f),0);assert.equal(count(f,'policy_events'),0);}finally{f.sqlite.close();}}
  const f=await setup();try{assert.equal((await f.post(await request(f))).status,200);assert.throws(()=>f.sqlite.exec("UPDATE policy_attestation_receipts SET note='changed'"),/immutable-attestation-receipt/);assert.throws(()=>f.sqlite.exec('DELETE FROM policy_attestation_receipts'),/immutable-attestation-receipt/);f.sqlite.exec("DROP TRIGGER policy_attestation_receipt_no_update;UPDATE policy_attestation_receipts SET snapshot_json='{}'");assert.equal(((await workspace(f)).receipt as {snapshot:unknown}).snapshot,null);}finally{f.sqlite.close();}
});
test('legacy responses retain their contract and are never represented as reviewed snapshots', async () => {
  const f=await setup();try{const legacy:Record<string,unknown>={...await request(f)};delete legacy.responseMode;delete legacy.requestId;delete legacy.expectedRevision;assert.equal((await f.post(legacy)).status,200);assert.equal((await workspace(f)).receipt,null);assert.equal(count(f),0);assert.equal((await f.post(legacy)).status,409);}finally{f.sqlite.close();}
});
test('competing decisions record one canonical answer and one receipt', async () => {
  const f=await setup();try{const input=await request(f);const results=await Promise.all([f.post(input),f.post({...input,requestId:'PAR-00000000-0000-4000-8000-000000000002',decision:'declined',confirmation:'KABUL ETMİYORUM'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(count(f),1);assert.equal(count(f,'policy_events'),1);}finally{f.sqlite.close();}
});
