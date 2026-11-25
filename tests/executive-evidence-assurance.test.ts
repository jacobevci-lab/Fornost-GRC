import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureEvidenceAutomationSchema } from '../app/api/evidence-automation/core';
import { seedAssessmentReceipt } from './helpers/assessment-fixture';
import { loadEvidenceAssuranceSnapshot } from '../app/evidence/assurance-runtime';
import { applyEvidenceAssuranceSnapshot, parseEvidenceAssuranceSnapshot } from '../app/evidence/assurance-snapshot';
import { buildExecutiveAssurance, buildAssuranceReportHtml } from '../app/executive-assurance';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { scopedApiAllowed } from '../app/module-access';

const now = new Date('2026-10-15T12:34:56Z');
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  function prepare(sql: string, values: (string | number | null)[] = []) { return {
    bind(...args: (string | number | null)[]) { return prepare(sql, args); },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    exec() { const results = sqlite.prepare(sql).all(...values); return { results, meta: { changes: Number(sqlite.prepare('SELECT changes() n').get()!.n) } }; },
    async run() { return this.exec(); },
  }; }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec('BEGIN'); try { const result = statements.map(s => s.exec()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  await ensureEvidenceAutomationSchema(db);
  sqlite.exec(readFileSync('drizzle/0079_evidence_lineage_storage.sql', 'utf8'));
  const record = (id: string, data: Record<string, unknown>) => sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id, 'Kanıtlar', JSON.stringify(data), now.toISOString(), now.toISOString());
  const read = () => loadEvidenceAssuranceSnapshot(db, now);
  const manual = (patch: Record<string, unknown> = {}) => ({ status: 'Approved', controlRef: 'C1', expiresAt: '2026-10-15', ...patch });
  const automate = async (runId = 'R1', status = 'pass') => {
    sqlite.exec("INSERT OR IGNORE INTO evidence_automation_rules(id,name,source_id,control_refs,json_path,operator,expected,schedule,created_at,updated_at,updated_by) VALUES('RULE','Coverage','SRC','C1','value','gte','90','daily','now','now','qa')");
    return seedAssessmentReceipt(sqlite, 'RULE', now, runId, status);
  };
  return { sqlite, db, record, read, manual, automate };
}

test('executive eligibility uses approval, review, validation and exact expiry including whole date-only days', () => {
  const row = (data: Record<string, unknown>) => ({ id: 'E1', module: 'Kanıtlar', data: { status: 'Approved', ...data } });
  for (const data of [{ status: 'Draft' }, { status: 'In review' }, { reviewStatus: 'pending-review' }, { reviewStatus: 'Rejected' }, { validationStatus: 'error' }, { validationStatus: 'fail' }, { freshUntil: now.toISOString() }, { expiresAt: '2026-02-30' }, { expiresAt: 'bad' }, { evidenceIntegrity: 'unavailable' }]) {
    assert.equal(buildExecutiveAssurance([row(data)], now.toISOString()).currentEvidence, 0, JSON.stringify(data));
  }
  assert.equal(buildExecutiveAssurance([row({ expiresAt: '2026-10-15' })], now.toISOString()).currentEvidence, 1);
  assert.equal(buildExecutiveAssurance([row({ freshUntil: '2026-10-15T15:34:57+03:00' })], now.toISOString()).currentEvidence, 1);
  assert.equal(buildExecutiveAssurance([{ ...row({}), id: 'EVD-AUTO-RAW' }], now.toISOString()).currentEvidence, 0);
});

test('canonical snapshot invalidates changed settings, retains history and recovers after another receipt', async () => {
  const f = await fixture(); try {
    const first = await f.automate(); const initial = await f.read();
    assert.equal(initial.verified, true); assert.equal(buildExecutiveAssurance(initial.rows, initial.generatedAt).currentEvidence, 1);
    const before = f.sqlite.prepare('SELECT data_json FROM simple_grc_records WHERE id=?').get(first.id)!.data_json;
    f.sqlite.exec("UPDATE evidence_automation_rules SET expected='95' WHERE id='RULE'");
    const changed = await f.read(); assert.equal(changed.rows[0].data.automationAssessment, 'configuration-changed');
    assert.equal(buildExecutiveAssurance(changed.rows, changed.generatedAt).currentEvidence, 0);
    await f.automate('R2'); const recovered = await f.read();
    assert.equal(buildExecutiveAssurance(recovered.rows, recovered.generatedAt).currentEvidence, 1);
    assert.equal(recovered.rows.length, 2); assert.equal(f.sqlite.prepare('SELECT data_json FROM simple_grc_records WHERE id=?').get(first.id)!.data_json, before);
    assert.ok(!JSON.stringify(recovered).includes('secret_ciphertext'));
  } finally { f.sqlite.close(); }
});

test('current snapshot replaces stale evidence metadata without widening loaded scope', async () => {
  const f = await fixture(); try {
    f.record('E1', f.manual({ reviewStatus: 'pending-review' })); f.record('E2', f.manual());
    const raw = [{ id: 'E1', module: 'Kanıtlar', data: f.manual() }, { id: 'C1', module: 'Kontroller', data: { controlRef: 'C1' } }];
    const snapshot = await f.read(), applied = applyEvidenceAssuranceSnapshot(raw, snapshot);
    assert.equal(applied.ready, true); assert.equal(applied.rows.length, 2); assert.equal(applied.rows[1], raw[1]);
    assert.equal(buildExecutiveAssurance(applied.rows, snapshot.generatedAt).currentEvidence, 0);
    assert.equal((raw[0].data as Record<string, unknown>).reviewStatus, undefined);
    const missing = applyEvidenceAssuranceSnapshot([...raw, { id: 'DELETED', module: 'Kanıtlar', data: f.manual() }], snapshot);
    assert.equal(missing.ready, false); assert.equal(buildExecutiveAssurance(missing.rows, snapshot.generatedAt).currentEvidence, 0);
    assert.equal(applyEvidenceAssuranceSnapshot(raw, null).ready, false);
  } finally { f.sqlite.close(); }
});

test('valid manual version chain is verified and tampering cannot receive evidence confidence', async () => {
  const f = await fixture(); try {
    const hash = await sha256HexBytes(new TextEncoder().encode('proof'));
    const version = await appendEvidenceVersion(f.db, { evidenceId: 'E1', fileKey: 'evidence/E1/file', fileName: 'proof.txt', fileType: 'text/plain', fileSize: 5,
      contentSha256: hash, evidenceTitle: 'Proof', owner: 'QA', period: '2026', frameworks: '', controlRefs: 'C1', changeNote: 'initial', createdBy: 'qa', createdAt: now.toISOString() });
    f.record('E1', f.manual({ versionNo: 1, versionChainSha256: version.chainSha256 }));
    let snapshot = await f.read(); assert.equal(snapshot.rows[0].data.evidenceIntegrity, 'verified');
    f.sqlite.exec("UPDATE evidence_versions SET content_sha256='tampered' WHERE evidence_id='E1'");
    snapshot = await f.read(); assert.equal(snapshot.verified, true); assert.equal(snapshot.rows[0].data.evidenceIntegrity, 'broken');
    assert.equal(buildExecutiveAssurance(snapshot.rows, snapshot.generatedAt).currentEvidence, 0);
  } finally { f.sqlite.close(); }
});

test('missing anchored history is broken and a missing data source never certifies an empty portfolio', async () => {
  const f = await fixture(); try {
    f.record('E1', f.manual({ versionNo: 2, versionChainSha256: 'a'.repeat(64), evidenceIntegrity: 'verified', automationAssessment: 'current' }));
    let snapshot = await f.read(); assert.equal(snapshot.rows[0].data.evidenceIntegrity, 'broken');
    assert.notEqual(snapshot.rows[0].data.automationAssessment, 'current');
    f.sqlite.exec('DROP TABLE evidence_versions'); snapshot = await f.read(); assert.equal(snapshot.verified, false); assert.deepEqual(snapshot.issues, ['evidence-unavailable']);
  } finally { f.sqlite.close(); }
});

test('malformed records and bounded record truncation are explicit unavailable assessments', async () => {
  const f = await fixture(); try {
    f.record('E1', f.manual()); f.sqlite.exec("UPDATE simple_grc_records SET data_json='[]' WHERE id='E1'");
    assert.deepEqual((await f.read()).issues, ['records-invalid']);
    f.sqlite.exec('BEGIN'); for (let i = 0; i < 10000; i++) f.record(`E-${i}`, f.manual()); f.sqlite.exec('COMMIT');
    const snapshot = await f.read(); assert.equal(snapshot.verified, false); assert.ok(snapshot.issues.includes('records-incomplete')); assert.ok(snapshot.rows.length <= 10000);
  } finally { f.sqlite.close(); }
});

test('missing automation sources fail closed', async () => {
  const f = await fixture(); try {
    const auto = await f.automate(); f.sqlite.exec('DROP TABLE evidence_automation_runs');
    const snapshot = await f.read(); assert.equal(snapshot.verified, false); assert.equal(snapshot.rows.find(row => row.id === auto.id)!.data.automationAssessment, 'assessment-unavailable');
  } finally { f.sqlite.close(); }
});

test('bounded history scans report incomplete rather than corrupt or current evidence', async () => {
  const f = await fixture(); try {
    f.record('E1', f.manual({ versionNo: 5001, versionChainSha256: 'a'.repeat(64) }));
    f.sqlite.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<5001)
      INSERT INTO evidence_versions(id,evidence_id,version_no,file_key,file_name,file_type,file_size,content_sha256,chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at)
      SELECT 'V'||i,'E1',i,'key','proof.txt','text/plain',1,'hash','hash','Proof','QA','2026','','C1','fixture','qa','2026-10-15T12:00:00Z' FROM n`);
    const snapshot = await f.read(); assert.equal(snapshot.verified, false); assert.deepEqual(snapshot.issues, ['integrity-incomplete']);
    assert.equal(snapshot.rows[0].data.evidenceIntegrity, 'unavailable');
    assert.equal(buildExecutiveAssurance(snapshot.rows, snapshot.generatedAt).currentEvidence, 0);
  } finally { f.sqlite.close(); }
});

test('snapshot parser rejects malformed, duplicate and inconsistent successful payloads', async () => {
  const f = await fixture(); try {
    f.record('E1', f.manual()); const snapshot = await f.read(); assert.ok(parseEvidenceAssuranceSnapshot(snapshot));
    for (const bad of [null, {}, { ...snapshot, generatedAt: 'bad' }, { ...snapshot, rows: [...snapshot.rows, ...snapshot.rows] }, { ...snapshot, issues: ['unavailable'] }, { ...snapshot, rows: [{ ...snapshot.rows[0], module: 'Risk Assessment' }] }, { ...snapshot, rows: [{ ...snapshot.rows[0], data: { evidenceIntegrity: 'unavailable' } }] }]) assert.equal(parseEvidenceAssuranceSnapshot(bad), null);
  } finally { f.sqlite.close(); }
});

test('HTML pack uses the same evaluation timestamp, bilingual reasons and immutable downloaded values', async () => {
  const f = await fixture(); try {
    await f.automate(); f.sqlite.exec("UPDATE evidence_automation_rules SET expected='95' WHERE id='RULE'");
    const snapshot = await f.read(), en = buildAssuranceReportHtml(snapshot.rows, false, snapshot.generatedAt), tr = buildAssuranceReportHtml(snapshot.rows, true, snapshot.generatedAt);
    assert.match(en, /Source or control settings changed/); assert.match(tr, /Kaynak veya kontrol ayarı değişti/);
    assert.ok(en.includes(snapshot.generatedAt)); assert.match(en, /0\/1 current/);
    await f.automate('R2'); assert.equal(buildAssuranceReportHtml(snapshot.rows, false, snapshot.generatedAt), en);
  } finally { f.sqlite.close(); }
});

test('shared executive evidence projection follows the existing scoped API deny rule', () => {
  assert.equal(scopedApiAllowed({ role: 'Viewer', moduleAccess: { mode: 'scoped', modules: { Kanıtlar: 'read' } } }, '/api/evidence/assurance', 'GET'), false);
  assert.equal(scopedApiAllowed({ role: 'Viewer' }, '/api/evidence/assurance', 'GET'), true);
});
