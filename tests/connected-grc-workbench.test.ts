import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { connectedNeighborhood, connectedIssues, changeConnectionData } from '../app/connected-grc-workbench-model';
import { buildConnectedGrcGraph, type ConnectedGrcRow as Row, type ConnectedGrcLink as Link } from '../app/connected-grc-model';
import { writeConnectedLink, connectedLinkHistorySchema } from '../app/connected-grc-link-store';

const row = (id: string, module = 'BIA', data: Record<string, unknown> = {}): Row => ({ id, code: id, module, data });
const edge = (source: Row, target: Row): Link => ({ source, target, relation: 'risk-process', field: 'processLink', matched: target.id });
test('neighborhood is cycle-safe, deterministic, bounded and carries each exact relationship direction', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => row(id));
  const links = [edge(c, b), edge(b, a), edge(c, a), edge(d, c)];
  const one = connectedNeighborhood(a, links, 1); assert.deepEqual(one.records.map(item => item.row.id), ['b', 'c']);
  const three = connectedNeighborhood(a, links, 3); assert.equal(three.records.length, 3); assert.equal(three.records.find(item => item.row.id === 'd')?.depth, 2);
  assert.equal(three.records[0].path[0].source.id, 'b'); assert.deepEqual(three.records[0].via, ['a', 'b']);
  assert.deepEqual(connectedNeighborhood(a, [...links].reverse(), 3), three);
  const limited = connectedNeighborhood(a, links, 3, 2); assert.equal(limited.records.length, 1); assert.equal(limited.truncated, true);
});
test('unresolved references never become indirect paths', () => {
  const a = row('RSK-001', 'Risk Assessment', { asset: 'Ambiguous' }), b = row('AST-001', 'Varlık Envanteri', { title: 'Ambiguous' }), c = row('AST-002', 'Varlık Envanteri', { title: 'Ambiguous' });
  const graph = buildConnectedGrcGraph([a, b, c]); assert.equal(graph.unresolved.length, 1); assert.equal(connectedNeighborhood(a, graph.links, 3).records.length, 0);
});
test('work queue distinguishes plan gaps, expired evidence and review dates without inventing dates', () => {
  const bia = row('BIA-001'), archived = row('BIA-002', 'BIA', { status: 'Arşivlendi' }), evidence = row('EVD-001', 'Kanıtlar', { expiresAt: '2026-11-10' }), future = row('EVD-002', 'Kanıtlar', { expiresAt: '2026-11-12' }), risk = row('RSK-001', 'Risk Assessment', { nextReview: '2026-11-09' });
  const issues = connectedIssues([bia, archived, evidence, future, risk], [], [], [], '2026-11-11');
  assert.deepEqual(new Set(issues.map(item => item.kind)), new Set(['plan', 'expired', 'review']));
  assert.equal(issues.find(item => item.kind === 'plan')?.due, undefined);
  assert.equal(connectedIssues([bia], [{ ...edge(row('BCP-001'), bia), relation: 'continuity-bia' }], [], [], '2026-11-11').length, 0);
});
test('same-title legacy references are never removed as though they were canonical identities', () => {
  const source = row('RSK-001', 'Risk Assessment', { existingControls: 'Same name; CTL-001' }), target = row('CTL-001', 'Kontroller', { controlTitle: 'Same name' });
  assert.equal(changeConnectionData(source, 'existingControls', target, 'unlink').existingControls, 'Same name');
});

const stamp = '2026-11-11T10:00:00.000Z', actor = { role: 'Admin', email: 'qa@fornost.test' };
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT,updated_at TEXT); CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT); ${connectedLinkHistorySchema}; CREATE TABLE enterprise_continuity_plans(id TEXT PRIMARY KEY,bia_ref TEXT,owner TEXT,status TEXT,version INTEGER,updated_by TEXT,updated_at TEXT); CREATE TABLE enterprise_continuity_events(id TEXT PRIMARY KEY,entity_type TEXT,entity_id TEXT,action TEXT,detail TEXT,actor TEXT,created_at TEXT);`);
  const add = (id: string, module: string, data: Record<string, unknown>) => { sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?,?)').run(id, module, JSON.stringify(data), stamp); sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?)').run(id, id); };
  add('AST-001', 'Varlık Envanteri', { title: 'Original' }); add('AST-002', 'Varlık Envanteri', { title: 'Replacement' }); add('BIA-001', 'BIA', { process: 'Identity' }); add('CTL-001', 'Kontroller', { controlTitle: 'MFA' });
  add('RSK-001', 'Risk Assessment', { title: 'Privileged access', owner: actor.email, asset: 'AST-001', status: 'Değerlendiriliyor' });
  let race: (() => void) | undefined;
  function prepare(sql: string) { let values: (string | number | null)[] = []; return { bind(...params: (string | number | null)[]) { values = params; return this; }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async all() { return { results: sqlite.prepare(sql).all(...values) }; }, async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; } }; }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { race?.(); race = undefined; sqlite.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as unknown as D1Database;
  const read = () => sqlite.prepare("SELECT * FROM simple_grc_records WHERE id='RSK-001'").get()!;
  const count = () => Number(sqlite.prepare('SELECT count(*) n FROM connected_grc_link_events').get()!.n);
  const body = { sourceId: 'RSK-001', targetId: 'AST-002', field: 'asset', action: 'link', expectedUpdatedAt: stamp, note: 'Verified dependency' };
  return { sqlite, db, add, read, count, body, race: (callback: () => void) => { race = callback; } };
}
test('canonical replacement changes only the relation and atomically records actor, reason and history', async () => {
  const f = fixture(); try { const result = await writeConnectedLink(f.db, actor, f.body); const data = JSON.parse(String(f.read().data_json)); assert.equal(data.asset, 'AST-002'); assert.equal(data.title, 'Privileged access'); assert.equal(data.status, 'Değerlendiriliyor'); assert.equal(f.count(), 1); assert.equal(f.read().updated_at, result.updatedAt); assert.equal(f.sqlite.prepare('SELECT actor FROM connected_grc_link_events').get()!.actor, actor.email); } finally { f.sqlite.close(); }
});
test('stale versions, wrong-module targets and required unlink leave source and history untouched', async () => {
  for (const change of [{ expectedUpdatedAt: 'stale' }, { targetId: 'BIA-001' }, { targetId: 'AST-001', action: 'unlink' }, { field: 'status' }, { note: '' }]) {
    const f = fixture(); try { const before = f.read(); await assert.rejects(writeConnectedLink(f.db, actor, { ...f.body, ...change })); assert.deepEqual(f.read(), before); assert.equal(f.count(), 0); } finally { f.sqlite.close(); }
  }
});
test('viewer, read-only source and inaccessible target cannot mutate a relationship', async () => {
  for (const restricted of [{ ...actor, role: 'Viewer' }, { ...actor, role: 'Editor', moduleAccess: { mode: 'scoped' as const, modules: { 'Risk Assessment': 'read' as const, 'Varlık Envanteri': 'read' as const } } }, { ...actor, role: 'Editor', moduleAccess: { mode: 'scoped' as const, modules: { 'Risk Assessment': 'write' as const } } }]) {
    const f = fixture(); try { await assert.rejects(writeConnectedLink(f.db, restricted, f.body)); assert.equal(f.count(), 0); assert.equal(f.read().updated_at, stamp); } finally { f.sqlite.close(); }
  }
});
test('optional unlink removes only a relationship and retains both records', async () => {
  const f = fixture(); try { const first = await writeConnectedLink(f.db, actor, { ...f.body, field: 'processLink', targetId: 'BIA-001' }); await writeConnectedLink(f.db, actor, { ...f.body, field: 'processLink', targetId: 'BIA-001', action: 'unlink', expectedUpdatedAt: first.updatedAt }); assert.equal(JSON.parse(String(f.read().data_json)).processLink, ''); assert.ok(f.sqlite.prepare("SELECT id FROM simple_grc_records WHERE id='BIA-001'").get()); assert.equal(f.count(), 2); } finally { f.sqlite.close(); }
});
test('target disappearance or source race rejects the transaction without a success event', async () => {
  for (const sql of ["DELETE FROM simple_grc_records WHERE id='AST-002'", "UPDATE simple_grc_records SET updated_at='newer' WHERE id='RSK-001'"]) { const f = fixture(); try { f.race(() => f.sqlite.exec(sql)); await assert.rejects(writeConnectedLink(f.db, actor, f.body)); assert.equal(f.count(), 0); assert.equal(JSON.parse(String(f.read().data_json)).asset, 'AST-001'); } finally { f.sqlite.close(); } }
});
test('history failure rolls back the relationship change', async () => {
  const f = fixture(); try { f.sqlite.exec("CREATE TRIGGER history_fail BEFORE INSERT ON connected_grc_link_events BEGIN SELECT RAISE(ABORT,'fail'); END;"); await assert.rejects(writeConnectedLink(f.db, actor, f.body)); assert.equal(f.read().updated_at, stamp); assert.equal(f.count(), 0); } finally { f.sqlite.close(); }
});
test('evidence primary reference and full list stay consistent when adding/removing controls', async () => {
  const f = fixture(); try { f.add('CTL-002', 'Kontroller', { controlTitle: 'Second' }); f.add('EVD-001', 'Kanıtlar', { evidenceTitle: 'MFA config', controlRef: 'CTL-001', owner: actor.email, period: '2026', status: 'Taslak' }); const body = { ...f.body, sourceId: 'EVD-001', targetId: 'CTL-002', field: 'controlRefs' }; const first = await writeConnectedLink(f.db, actor, body); await writeConnectedLink(f.db, actor, { ...body, targetId: 'CTL-001', action: 'unlink', expectedUpdatedAt: first.updatedAt }); const data = JSON.parse(String(f.sqlite.prepare("SELECT data_json FROM simple_grc_records WHERE id='EVD-001'").get()!.data_json)); assert.equal(data.controlRef, 'CTL-002'); assert.deepEqual(data.controlRefs, ['CTL-002']); } finally { f.sqlite.close(); }
});
test('draft plan linkage changes its BIA and version without approving the plan', async () => {
  const f = fixture(); try { f.sqlite.prepare('INSERT INTO enterprise_continuity_plans VALUES(?,?,?,?,?,?,?)').run('BCP-001', 'Old BIA', actor.email, 'draft', 1, actor.email, stamp); await writeConnectedLink(f.db, actor, { ...f.body, sourceId: 'BCP-001', targetId: 'BIA-001', field: 'continuityBiaRef', kind: 'continuity-plan' }); const plan = f.sqlite.prepare('SELECT * FROM enterprise_continuity_plans').get()!; assert.equal(plan.bia_ref, 'BIA-001'); assert.equal(plan.status, 'draft'); assert.equal(plan.version, 2); assert.equal(f.count(), 1); assert.equal(f.sqlite.prepare('SELECT action FROM enterprise_continuity_events').get()!.action, 'link-bia'); } finally { f.sqlite.close(); }
});
test('approved plans and unassigned editors cannot change BIA linkage', async () => {
  for (const status of ['draft', 'approved']) { const f = fixture(); try { f.sqlite.prepare('INSERT INTO enterprise_continuity_plans VALUES(?,?,?,?,?,?,?)').run('BCP-001', 'Old BIA', 'different@fornost.test', status, 1, actor.email, stamp); await assert.rejects(writeConnectedLink(f.db, status === 'draft' ? { ...actor, role: 'Editor' } : actor, { ...f.body, sourceId: 'BCP-001', targetId: 'BIA-001', field: 'continuityBiaRef', kind: 'continuity-plan' })); assert.equal(f.count(), 0); } finally { f.sqlite.close(); } }
});
