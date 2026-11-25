import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/enterprise-route-fixture';
import { projectEnterpriseWork } from '../app/enterprise-work';
import type { CampaignWorkspace } from '../app/policy-lifecycle/campaigns';

const stamp = '2026-01-01T12:00:00.000Z';
const actor = { id: 'reviewer', email: 'reviewer@example.com', name: 'Reviewer', role: 'Admin' as const, source: 'local' as const };
async function setup() {
  const f = fixture('policy-lifecycle'); await f.post({});
  f.sqlite.exec('CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);');
  f.sqlite.prepare('INSERT INTO local_users VALUES(?,?,?,?,?)').run(actor.id, actor.name, actor.email, actor.role, 'Active');
  const insert = (table: string, values: Record<string, string | number | null>) => {
    const row: Record<string, string | number | null> = {};
    for (const c of f.sqlite.prepare(`PRAGMA table_info(${table})`).all()) if (c.notnull && !c.dflt_value) row[String(c.name)] = c.type === 'INTEGER' ? 1 : 'fixture';
    Object.assign(row, values); f.sqlite.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  };
  insert('policy_documents', { id: 'POL-1', code: 'POL-1', title: 'Security policy', current_version_id: 'PV-1', status: 'published', owner: 'owner@example.com', reviewer: actor.email, updated_at: stamp });
  insert('policy_versions', { id: 'PV-1', policy_id: 'POL-1', status: 'published', version_number: 1, content: 'The exact content issued to this campaign.', content_sha256: 'a'.repeat(64), updated_at: stamp });
  insert('policy_attestation_campaigns', { id: 'PAC-1', policy_id: 'POL-1', version_id: 'PV-1', name: 'Annual policy acknowledgement', audience: 'Security team', due_date: '2030-01-01', required_count: 3, status: 'open', created_by: actor.email, created_at: stamp });
  for (const [i, status] of ['attested', 'declined', 'pending'].entries()) insert('policy_attestations', { id: `PAT-${i}`, campaign_id: 'PAC-1', subject_email: `subject${i}@example.com`, status, note: `${status} original note`, content_sha256: status === 'pending' ? null : 'a'.repeat(64), attested_at: status === 'pending' ? null : stamp, updated_at: stamp });
  return { ...f, insert };
}
const read = async (f: Awaited<ReturnType<typeof setup>>) => {
  const response = await f.get('view=campaign&campaignId=PAC-1'); assert.equal(response.status, 200); return response.body as unknown as CampaignWorkspace;
};
const request = (revision: string, patch: Record<string, unknown> = {}) => ({ action: 'close-campaign', campaignId: 'PAC-1', requestId: 'PCC-00000000-0000-4000-8000-000000000001', expectedRevision: revision, note: 'Collection finished; unanswered and declined cases have separate follow-up.', acknowledgeOutstanding: true, confirmation: 'CLOSE CAMPAIGN', ...patch });
const events = (f: Awaited<ReturnType<typeof setup>>) => Number(f.sqlite.prepare("SELECT COUNT(*) n FROM policy_events WHERE action='campaign-close'").get()!.n);

test('closure preserves all responses, retains exact outcome, removes active work and releases the campaign retirement blocker', async () => {
  const f = await setup(); try {
    const before = f.sqlite.prepare('SELECT * FROM policy_attestations ORDER BY id').all(), source = await read(f);
    assert.equal(source.complete, true); assert.equal(source.campaign.pendingCount, 1); assert.equal(source.version.id, 'PV-1');
    const retirement = { action: 'retire-policy', policyId: 'POL-1', note: 'Retiring the original policy after campaign collection.', evidenceReference: 'EVD-1', evidenceSha256: 'a'.repeat(64), confirmation: 'POLİTİKAYI YÜRÜRLÜKTEN KALDIR' };
    assert.equal((await f.post(retirement)).status, 409);
    assert.equal((await f.post(request(source.revision))).status, 200);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM policy_attestations ORDER BY id').all(), before);
    const after = await read(f); assert.equal(after.campaign.status, 'closed'); assert.equal(after.campaign.closedBy, actor.email); assert.deepEqual(after.closure?.counts, { attested: 1, declined: 1, pending: 1, total: 3 }); assert.equal(after.closure?.sourceRevision, source.revision);
    const payload = (await f.get()).body; assert.equal((payload.summary as { pendingAttestations: number }).pendingAttestations, 0);
    assert.ok(!(projectEnterpriseWork('policy', payload).rows).some(r => r.workKind === 'policy-attestation'));
    assert.equal((await f.post(retirement)).status, 200); assert.equal(events(f), 1);
    assert.equal((await read(f)).closure?.counts.pending, 1);
  } finally { f.sqlite.close(); }
});

test('identical retries return the existing closure; changed requests and later response attempts do not change history', async () => {
  const f = await setup(); try {
    const input = request((await read(f)).revision); assert.equal((await f.post(input)).status, 200); assert.equal((await f.post(input)).body.replay, true);
    assert.equal((await f.post({ ...input, note: 'A different rationale must not overwrite the closure.' })).status, 409);
    assert.equal((await f.post({ ...input, acknowledgeOutstanding: false })).status, 409);
    f.setActor({ ...actor, email: 'subject2@example.com' });
    assert.equal((await f.post({ action: 'attest', attestationId: 'PAT-2', decision: 'attested', note: 'Late response after close.', confirmation: 'OKUDUM VE KABUL EDİYORUM' })).status, 409);
    assert.equal(events(f), 1); assert.equal(f.sqlite.prepare("SELECT status FROM policy_attestations WHERE id='PAT-2'").get()!.status, 'pending');
  } finally { f.sqlite.close(); }
});

test('Editor and Viewer cannot read campaign outcomes or close; inactive or changed Admin identity cannot close', async () => {
  const f = await setup(); try {
    const input = request((await read(f)).revision);
    for (const role of ['Editor', 'Viewer'] as const) { f.setActor({ ...actor, role }); assert.equal((await f.get('view=campaign&campaignId=PAC-1')).status, 403); assert.equal((await f.post(input)).status, 403); }
    f.setActor(actor); f.sqlite.exec("UPDATE local_users SET status='Disabled'"); assert.equal((await f.post(input)).status, 403);
    f.sqlite.exec("UPDATE local_users SET status='Active',email='changed@example.com'"); assert.equal((await f.post(input)).status, 403); assert.equal(events(f), 0);
  } finally { f.sqlite.close(); }
});

test('validation and outstanding acknowledgement reject invalid decisions before mutation', async () => {
  const f = await setup(); try {
    const input = request((await read(f)).revision);
    for (const patch of [{ note: 'short' }, { note: 'x'.repeat(1001) }, { confirmation: 'yes' }, { requestId: '../bad' }, { expectedRevision: '' }, { campaignId: '../PAC-1' }, { acknowledgeOutstanding: false }, { acknowledgeOutstanding: 'true' }]) assert.equal((await f.post({ ...input, ...patch })).status, 400, JSON.stringify(patch));
    assert.equal(events(f), 0);
  } finally { f.sqlite.close(); }
});

test('changed outcomes and interleaved response/campaign/version/account writes reject stale closure atomically', async () => {
  for (const sql of [
    "UPDATE policy_attestations SET status='attested',updated_at='2026-02-01T12:00:00.000Z' WHERE id='PAT-2'",
    "UPDATE policy_attestations SET note='A concurrent response correction' WHERE id='PAT-0'",
    "UPDATE policy_attestation_campaigns SET due_date='2031-01-01'",
    "UPDATE policy_versions SET content='Concurrent content change'",
    "UPDATE local_users SET status='Disabled'",
    "INSERT INTO user_module_access VALUES('reviewer','{\"mode\":\"scoped\"}')",
  ]) {
    const f = await setup(); try {
      const input = request((await read(f)).revision); f.before(() => f.sqlite.exec(sql)); assert.equal((await f.post(input)).status, 409, sql); assert.equal(events(f), 0); assert.equal(f.sqlite.prepare('SELECT status FROM policy_attestation_campaigns').get()!.status, 'open');
    } finally { f.sqlite.close(); }
  }
  const f = await setup(); try { const input = request((await read(f)).revision); f.sqlite.exec("UPDATE policy_attestations SET status='attested' WHERE id='PAT-2'"); assert.equal((await f.post(input)).status, 409); } finally { f.sqlite.close(); }
});

test('event failure rolls back closure and no decision count or timestamps are invented', async () => {
  const f = await setup(); try {
    const before = (await read(f)).campaign; f.sqlite.exec("CREATE TRIGGER fail_campaign_event BEFORE INSERT ON policy_events BEGIN SELECT RAISE(ABORT,'event failed'); END");
    assert.equal((await f.post(request((await read(f)).revision))).status, 400); assert.deepEqual((await read(f)).campaign, before); assert.equal(events(f), 0);
  } finally { f.sqlite.close(); }
});

test('incomplete, malformed or over-limit recipients remain explicit and cannot close', async () => {
  for (const mode of ['missing', 'malformed', 'duplicate-email', 'limit']) {
    const f = await setup(); try {
      if (mode === 'missing') f.sqlite.exec("DELETE FROM policy_attestations WHERE id='PAT-2'");
      if (mode === 'malformed') f.sqlite.exec("UPDATE policy_attestations SET status='unknown' WHERE id='PAT-2'");
      if (mode === 'duplicate-email') f.sqlite.exec("UPDATE policy_attestations SET subject_email='SUBJECT0@example.com' WHERE id='PAT-2'");
      if (mode === 'limit') { for (let i = 3; i < 501; i++) f.insert('policy_attestations', { id: `PAT-${i}`, campaign_id: 'PAC-1', subject_email: `subject${i}@example.com`, status: 'pending', updated_at: stamp }); f.sqlite.exec('UPDATE policy_attestation_campaigns SET required_count=501'); }
      const source = await read(f); assert.equal(source.complete, false); assert.ok(source.recipients.length <= 500); assert.equal((await f.post(request(source.revision))).status, 409); assert.equal(events(f), 0);
    } finally { f.sqlite.close(); }
  }
});

test('a fully accepted campaign closes without an outstanding acknowledgement and reports three accepted responses', async () => {
  const f = await setup(); try {
    f.sqlite.exec("UPDATE policy_attestations SET status='attested',content_sha256='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',attested_at='2026-01-01T12:00:00.000Z'"); assert.equal((await f.post(request((await read(f)).revision, { acknowledgeOutstanding: false }))).status, 200); assert.deepEqual((await read(f)).closure?.counts, { attested: 3, declined: 0, pending: 0, total: 3 });
  } finally { f.sqlite.close(); }
});
