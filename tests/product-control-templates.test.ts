import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { assessControl, controlTemplates, templatesForSource } from '../app/connectors/control-templates';
import { ensureEvidenceAutomationSchema, executeRule } from '../app/api/evidence-automation/core';
import { providerConfiguration } from '../app/connectors/collector';
import { newConnectorDraft } from '../app/connectors/catalog';
import { encryptSecret } from '../app/api/integrations/security';

const now = new Date('2026-10-01T18:00:00Z');
const intune = { providerId: 'intune', dataset: 'managed-devices' };
const device = (id: string, extra: Record<string, unknown> = {}) => ({ id, deviceName: `Device ${id}`, complianceState: 'compliant', isEncrypted: true, lastSyncDateTime: now.toISOString(), ...extra });
const payload = (rows: unknown[], config = intune) => ({ value: rows, fornostCollection: { ...config, complete: true, scope: 'credential-visible', recordCount: rows.length } });
const assess = (rows: unknown[], id = 'intune-compliance') => assessControl(id, 1, intune, payload(rows), now);

test('ready checks assess every record, never only the first device', () => {
  const result = assess([device('a'), device('b', { complianceState: 'inGracePeriod' }), device('c', { complianceState: 'noncompliant' }), device('d', { complianceState: 'configManager' })]);
  assert.equal(result.status, 'fail'); assert.equal(result.total, 4); assert.equal(result.passed, 1); assert.equal(result.failed, 2); assert.equal(result.unknown, 1); assert.equal(result.score, 25);
  assert.deepEqual(result.issues.map(x => x.id), ['b', 'c', 'd']);
});
test('empty, malformed and unknown device data cannot turn green', () => {
  for (const rows of [[], [null], [device('')], [device('a', { complianceState: 'error' })], [device('a', { complianceState: 'conflict' })], [device('a', { complianceState: 'new-provider-enum' })]]) assert.equal(assess(rows).status, 'error');
  assert.equal(assess([device('a'), device('a')]).unknown, 2);
  assert.equal(assess([device('a', { isEncrypted: 'true' })], 'intune-encryption').status, 'error');
  assert.equal(assess([device('a', { isEncrypted: false })], 'intune-encryption').status, 'fail');
  assert.equal(assess([device('a', { isEncrypted: true })], 'intune-encryption').status, 'pass');
});
test('stale or unverifiable source timestamps cannot produce fresh passing assurance', () => {
  assert.equal(assess([device('a', { lastSyncDateTime: '2026-09-01T00:00:00Z' })]).issues[0].reason, 'stale-device');
  for (const lastSyncDateTime of [undefined, null, '', 0, 'invalid', '2027-01-01T00:00:00Z']) assert.equal(assess([device('a', { lastSyncDateTime })]).status, 'error');
});
test('Defender health uses documented enums and lastSeen', () => {
  const config = { providerId: 'defender-endpoint', dataset: 'machines' };
  for (const healthStatus of ['Active', 'Inactive', 'NoSensorData', 'ImpairedCommunication', 'NoSensorDataImpairedCommunication', 'Unknown']) {
    const result = assessControl('mde-sensor-health', 1, config, payload([{ id: 'host', healthStatus, lastSeen: now.toISOString() }], config), now);
    assert.equal(result.status, healthStatus === 'Active' ? 'pass' : healthStatus === 'Unknown' ? 'error' : 'fail');
  }
});
test('SonarQube requires a computed, non-ignored passing quality gate', () => {
  const config = { providerId: 'sonarqube', dataset: 'quality-gate', projectKey: 'test' };
  for (const [status, expected] of [['OK', 'pass'], ['ERROR', 'fail'], ['WARN', 'fail'], ['NONE', 'error'], ['future', 'error']]) {
    const data = { projectStatus: { status }, fornostCollection: { ...config, complete: true, recordCount: 1, scope: 'credential-visible' } };
    assert.equal(assessControl('sonarqube-quality-gate', 1, config, data, now).status, expected);
    if (status === 'OK') { Object.assign(data.projectStatus, { ignoredConditions: true }); assert.equal(assessControl('sonarqube-quality-gate', 1, config, data, now).status, 'error'); }
  }
});
test('template identity, version and complete dataset are mandatory', () => {
  assert.throws(() => assessControl('intune-compliance', 2, intune, payload([]), now), /version/);
  assert.throws(() => assessControl('intune-compliance', 1, { ...intune, dataset: 'other' }, payload([]), now), /source/);
  for (const delta of [{ complete: false }, { recordCount: 2 }, { providerId: 'other' }, { scope: 'full-tenant' }]) {
    const data = payload([device('a')]); Object.assign(data.fornostCollection, delta);
    assert.throws(() => assessControl('intune-compliance', 1, intune, data, now));
  }
  assert.deepEqual(templatesForSource({ driver: 'rest-json', config: intune }), []);
  assert.equal(templatesForSource({ driver: 'provider-v1', config: intune }).length, 2);
});
test('diagnostics are bounded and do not copy unrelated provider data', () => {
  const result = assess(Array.from({ length: 150 }, (_, i) => device(String(i), { complianceState: 'noncompliant', secret: 'DO_NOT_RETAIN' })));
  assert.equal(result.total, 150); assert.equal(result.failed, 150); assert.equal(result.issues.length, 100); assert.equal(result.issuesTruncated, true);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_RETAIN'));
});

// Execute the real persistence/orchestration code against SQLite, with only vendor HTTP substituted.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, args: (string | number | null)[] = []) {
    return {
      bind(...values: (string | number | null)[]) { return prepare(sql, values); },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { sqlite, db };
}
test('fresh schema, old CCM migration and repeat startup keep ready-test columns compatible', async () => {
  for (const upgraded of [false, true]) {
    const { sqlite, db } = database();
    try {
      if (upgraded) for (const file of ['0029_evidence_automation.sql', '0067_continuous_control_monitoring.sql', '0080_product_control_templates.sql']) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
      await ensureEvidenceAutomationSchema(db); await ensureEvidenceAutomationSchema(db);
      assert.ok(sqlite.prepare('PRAGMA table_info(evidence_automation_rules)').all().some(row => row.name === 'template_version'));
      assert.ok(sqlite.prepare('PRAGMA table_info(evidence_automation_runs)').all().some(row => row.name === 'assessment_json'));
    } finally { sqlite.close(); }
  }
});
test('native fail -> repeat -> pass persists evidence, deduplicates findings and preserves independent closure', async () => {
  const { sqlite, db } = database();
  try {
    await ensureEvidenceAutomationSchema(db);
    const key = 'qa-only-encryption-key-32-characters-long', guid = '11111111-1111-4111-8111-111111111111';
    const cfg = providerConfiguration({ ...newConnectorDraft('intune'), providerConfig: { tenantId: guid, clientId: guid } }).config;
    const encrypted = await encryptSecret(JSON.stringify({ clientSecret: 'LOCAL_TEST_ONLY' }), key);
    sqlite.prepare("INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,secret_ciphertext,created_at,updated_at,updated_by) VALUES('source','Intune','Microsoft','Cloud','provider-v1',?,?,?,?,'qa')").run(JSON.stringify(cfg), encrypted, now.toISOString(), now.toISOString());
    sqlite.prepare("INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by,template_id,template_version,failure_threshold) VALUES('rule','Compliance','source','A.8.1','$','template','','daily',?,?,'qa','intune-compliance',1,1)").run(now.toISOString(), now.toISOString());
    const env = { DB: db, FORNOST_SETTINGS_ENCRYPTION_KEY: key };
    let devices = [device('bad', { complianceState: 'noncompliant' }), device('good')], upstreamStatus = 200;
    const fetcher = async (url: string) => new Response(JSON.stringify(url.includes('/token') ? { access_token: 'ephemeral' } : { value: devices }), { status: upstreamStatus, headers: { 'content-type': 'application/json' } });
    const first = await executeRule(env, 'rule', 'qa@fornost.test', 'manual', { fetcher, now }); assert.equal(first.status, 'fail'); assert.ok(first.evidenceId);
    const evidence = JSON.parse(String(sqlite.prepare("SELECT data_json FROM simple_grc_records WHERE id=?").get(first.evidenceId!)!.data_json));
    assert.equal(evidence.controlAssessment.failed, 1); assert.equal(evidence.controlAssessment.issues[0].id, 'bad'); assert.match(evidence.responseHash, /^[a-f0-9]{64}$/);
    await executeRule(env, 'rule', 'qa@fornost.test', 'scheduler', { fetcher, now });
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM evidence_automation_findings').get()!.n, 1);
    assert.equal(sqlite.prepare('SELECT occurrence_count n FROM evidence_automation_findings').get()!.n, 2);
    devices = [device('bad'), device('good')]; assert.equal((await executeRule(env, 'rule', 'qa@fornost.test', 'manual', { fetcher, now })).status, 'pass');
    assert.equal(sqlite.prepare('SELECT consecutive_failures n FROM evidence_automation_rules').get()!.n, 0);
    assert.equal(sqlite.prepare('SELECT status FROM evidence_automation_findings').get()!.status, 'open');
    devices = []; const empty = await executeRule(env, 'rule', 'qa@fornost.test', 'manual', { fetcher, now }); assert.equal(empty.status, 'error'); assert.equal(empty.evidenceId, null); assert.equal(empty.errorCode, 'ASSESSMENT_INCOMPLETE');
    upstreamStatus = 429; const rate = await executeRule(env, 'rule', 'qa@fornost.test', 'manual', { fetcher, now }); assert.equal(rate.errorCode, 'RATE_LIMITED');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM evidence_automation_runs').get()!.n, 5);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM simple_grc_records WHERE module='Kanıtlar'").get()!.n, 3);
    sqlite.prepare("UPDATE evidence_automation_sources SET config_json=?").run(JSON.stringify({ ...cfg, dataset: 'different' }));
    let called = false; const mismatch = await executeRule(env, 'rule', 'qa@fornost.test', 'manual', { fetcher: async () => { called = true; throw new Error('should not fetch'); }, now }); assert.equal(mismatch.status, 'error'); assert.equal(called, false);
  } finally { sqlite.close(); }
});
test('legacy custom rules retain scalar evaluation and evidence behaviour', async () => {
  const { sqlite, db } = database();
  try {
    await ensureEvidenceAutomationSchema(db);
    sqlite.exec(`INSERT INTO evidence_automation_sources(id,name,vendor,category,driver,config_json,created_at,updated_at,updated_by) VALUES('s','Custom','Custom','Custom','rest-json','{"baseUrl":"https://fixture.example/data"}','now','now','qa');
      INSERT INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('r','Custom','s','A.8.1','percent','gte','90','daily','now','now','qa');`);
    const result = await executeRule({ DB: db }, 'r', 'qa@fornost.test', 'manual', { fetcher: async () => new Response('{"percent":95}', { headers: { 'content-type': 'application/json' } }), now });
    assert.equal(result.status, 'pass'); assert.ok(result.evidenceId);
    assert.equal(sqlite.prepare('SELECT assessment_json FROM evidence_automation_runs').get()!.assessment_json, null);
  } finally { sqlite.close(); }
});
test('every shipped template resolves to its existing provider dataset', () => {
  for (const template of controlTemplates) {
    const draft = newConnectorDraft(template.providerId); assert.equal(draft.dataset, template.dataset);
  }
});
