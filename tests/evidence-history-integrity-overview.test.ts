import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { ensureEvidenceHistorySchema, appendEvidenceVersion, type EvidenceVersionRow } from '../app/evidence/versioning';
import { historyIntegrity, readEvidenceControlTimeline, readEvidenceHistoryOverview } from '../app/evidence/history-overview';

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,created_at TEXT,updated_at TEXT)');
  function prepare(sql: string, args: SQLInputValue[] = []) {
    return { bind(...values: SQLInputValue[]) { return prepare(sql, values); },
      execute() { return { results: sqlite.prepare(sql).all(...args), success: true, meta: { changes: Number((sqlite.prepare('SELECT changes() n').get() as { n: number }).n) } }; },
      async all() { return this.execute(); }, async run() { return this.execute(); }, async first() { return sqlite.prepare(sql).get(...args) || null; } };
  }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as unknown as D1Database;
  await ensureEvidenceHistorySchema(db);
  const record = (id: string, data = {}, updated = '2026-10-14') => sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run(id, 'Kanıtlar', JSON.stringify(data), updated, updated);
  const version = async (id: string, control = 'CTRL-A') => {
    const commit = await appendEvidenceVersion(db, { evidenceId: id, fileKey: `evidence/${id}/${crypto.randomUUID()}.txt`, fileName: 'review.txt', fileType: 'text/plain', fileSize: 5, contentSha256: 'a'.repeat(64), evidenceTitle: id, owner: 'owner@example.com', period: 'Q4', frameworks: '', controlRefs: control, changeNote: 'Reviewed file', createdBy: 'owner@example.com', createdAt: '2026-10-14T12:00:00Z' });
    sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify({ versionNo: String(commit.versionNo), versionChainSha256: commit.chainSha256 }), id);
  };
  return { sqlite, db, record, version };
}

test('active metrics exclude retained histories without losing retained versions or links', async () => {
  const f = await fixture(); try {
    f.record('EVD-a'); f.record('EVD-b'); f.record('EVD-legacy'); f.record('EVD-removed');
    await f.version('EVD-a'); await f.version('EVD-a'); await f.version('EVD-b'); await f.version('EVD-removed', 'REMOVED-ONLY'); await f.version('EVD-removed', 'REMOVED-ONLY');
    f.sqlite.exec("DELETE FROM simple_grc_records WHERE id='EVD-removed'");
    const result = await readEvidenceHistoryOverview(f.db);
    assert.deepEqual(result.summary, { evidenceRecords: 3, trackedEvidence: 2, legacyEvidence: 1, totalVersions: 3, linkedControls: 1, verifiedChains: 2, brokenChains: 0, uncheckedChains: 0, integrityScanComplete: true, retainedEvidence: 1, retainedVersions: 2 });
    assert.equal(result.evidenceItemsComplete, true);
    assert.equal(result.evidenceItems.some(v => v.id === 'EVD-removed'), false);
    assert.equal(result.recentVersions.filter(v => !v.recordAvailable).length, 2);
    const timeline = await readEvidenceControlTimeline(f.db, 'removed-only');
    assert.equal(timeline.count, 2); assert.ok(timeline.timeline.every(v => !v.recordAvailable && v.fileKey));
    assert.ok(result.evidenceItems.every(v => !('headHash' in v)));
    // A different module cannot revive an evidence record with the same ID.
    f.sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?,?)').run('EVD-removed', 'Riskler', '{}', '', '');
    assert.equal((await readEvidenceHistoryOverview(f.db)).summary.retainedVersions, 2);
  } finally { f.sqlite.close(); }
});

test('missing, forged and removed anchors cannot be reported as legacy or verified', async () => {
  const f = await fixture(); try {
    f.record('EVD-forged'); await f.version('EVD-forged');
    f.record('EVD-unanchored'); await f.version('EVD-unanchored');
    f.record('EVD-missing', { versionNo: '3', versionChainSha256: 'b'.repeat(64) });
    f.record('EVD-malformed', { versionNo: 'not-a-version' });
    f.record('EVD-head-only', { versionChainSha256: 'b'.repeat(64) });
    f.sqlite.exec("UPDATE simple_grc_records SET data_json='{}' WHERE id='EVD-unanchored'");
    f.sqlite.prepare('UPDATE simple_grc_records SET data_json=? WHERE id=?').run(JSON.stringify({ versionNo: '1', versionChainSha256: 'c'.repeat(64) }), 'EVD-forged');
    const { summary, evidenceItems } = await readEvidenceHistoryOverview(f.db);
    assert.equal(summary.trackedEvidence, 5); assert.equal(summary.legacyEvidence, 0); assert.equal(summary.brokenChains, 5);
    assert.ok(evidenceItems.every(v => v.integrity === 'broken'));
    assert.equal(summary.integrityScanComplete, true);
  } finally { f.sqlite.close(); }
});

test('global counters include records beyond the selector and disclose unchecked chains', async () => {
  const f = await fixture(); try {
    f.record('EVD-old', {}, '2025-01-01'); await f.version('EVD-old');
    for (let i = 0; i < 500; i++) f.record(`EVD-new-${i}`);
    const result = await readEvidenceHistoryOverview(f.db);
    assert.equal(result.evidenceItems.length, 500); assert.equal(result.evidenceItemsComplete, false);
    assert.equal(result.summary.evidenceRecords, 501); assert.equal(result.summary.legacyEvidence, 500);
    assert.equal(result.summary.trackedEvidence, 1); assert.equal(result.summary.uncheckedChains, 1);
    assert.equal(result.summary.integrityScanComplete, false); assert.equal(result.summary.verifiedChains, 0);
  } finally { f.sqlite.close(); }
});

test('retained histories do not consume the active integrity budget and timeline limits are explicit', async () => {
  const f = await fixture(); try {
    f.record('EVD-live'); await f.version('EVD-live');
    // History-only rows intentionally lack anchors; they must not affect active verification.
    f.sqlite.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2001)
      INSERT INTO evidence_versions SELECT 'old-'||x,'EVD-old',x,file_key||x,file_name,file_type,file_size,content_sha256,chain_sha256,previous_version_id,previous_chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at FROM evidence_versions,n WHERE evidence_id='EVD-live';
      INSERT INTO evidence_version_controls(version_id,evidence_id,version_no,control_ref,normalized_ref,created_at) SELECT id,evidence_id,version_no,'CTRL-A','ctrl-a',created_at FROM evidence_versions WHERE evidence_id='EVD-old'`);
    const result = await readEvidenceHistoryOverview(f.db);
    assert.equal(result.summary.verifiedChains, 1); assert.equal(result.summary.integrityScanComplete, true);
    assert.equal(result.summary.retainedVersions, 2001); assert.equal(result.recentVersionsComplete, false);
    const timeline = await readEvidenceControlTimeline(f.db, 'ctrl-a'); assert.equal(timeline.timeline.length, 300); assert.equal(timeline.complete, false);
    f.record('EVD-old', { versionNo: '2001' });
    const bounded = await readEvidenceHistoryOverview(f.db);
    assert.equal(bounded.summary.uncheckedChains, 1); assert.equal(bounded.summary.brokenChains, 0); assert.equal(bounded.summary.integrityScanComplete, false);
    assert.equal(bounded.evidenceItems.find(v => v.id === 'EVD-old')?.integrity, 'unavailable');
  } finally { f.sqlite.close(); }
});

test('bounded detail is unavailable while a fully read truncated chain is broken', async () => {
  const f = await fixture(); try {
    f.record('EVD-a'); await f.version('EVD-a'); await f.version('EVD-a');
    const rows = f.sqlite.prepare("SELECT * FROM evidence_versions WHERE evidence_id='EVD-a' ORDER BY version_no DESC").all() as unknown as EvidenceVersionRow[];
    const data = JSON.parse(String(f.sqlite.prepare("SELECT data_json FROM simple_grc_records WHERE id='EVD-a'").get()?.data_json));
    assert.equal((await historyIntegrity(rows.slice(0, 1), 2, data)).state, 'unavailable');
    assert.equal((await historyIntegrity(rows.slice(0, 1), 1, data)).state, 'broken');
    assert.equal((await historyIntegrity(rows, 2, data)).state, 'verified');
    f.sqlite.exec('DELETE FROM simple_grc_records');
    const empty = await readEvidenceHistoryOverview(f.db);
    assert.equal(empty.summary.evidenceRecords, 0); assert.equal(empty.summary.trackedEvidence, 0); assert.equal(empty.summary.retainedEvidence, 1);
  } finally { f.sqlite.close(); }
});
