import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { searchRecords, foldSearch, SearchInputError } from '../app/record-search-store';
import { ACCESS_MODULES, scopedApiAllowed, type AccessSubject } from '../app/module-access';
const full = { role: 'Viewer' }, restricted: AccessSubject = { role: 'Editor', moduleAccess: { mode: 'scoped', modules: { BIA: 'read' } } };
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT); CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT,code TEXT);');
  const add = (id: string, module = 'BIA', data = { process: 'Search fixture' } as Record<string, unknown>, code = id) => {
    sqlite.prepare('INSERT INTO simple_grc_records VALUES(?,?,?)').run(id, module, JSON.stringify(data));
    sqlite.prepare('INSERT INTO simple_grc_record_codes VALUES(?,?,?)').run(id, module, code);
  };
  const db = { prepare(sql: string) { return { bind(...args: SQLInputValue[]) { return { async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; } }; } }; } } as unknown as D1Database;
  const search = (q: string, actor = full as AccessSubject, extra: Record<string, string> = {}) => searchRecords(db, actor, new URLSearchParams({ q, ...extra }));
  return { sqlite, add, search, db };
}
test('search covers all eight core modules by code, title, owner and Turkish casing, without exposing record payloads', async () => {
  const f = fixture();
  ACCESS_MODULES.forEach((module, i) => f.add(`id-${i}`, module, { title: 'İŞ SÜREKLİLİĞİ', owner: 'Çağrı', privateNote: 'Hidden content' }, `CODE-${i}`));
  for (const q of ['iş sürekliliği', 'İŞ SÜREKLİLİĞİ', 'ÇAĞRI']) assert.equal((await f.search(q)).results.length, 8);
  assert.equal(foldSearch('Iıİi'), 'iiii');
  const result = (await f.search('CODE-3')).results;
  assert.equal(result.length, 1); assert.equal(result[0].id, 'id-3');
  assert.deepEqual(Object.keys(result[0]).sort(), ['code','id','module','owner','status','title']);
  assert.equal((await f.search('Hidden content')).results.length, 0);
});
test('authorization precedes limit and pagination, cursor cannot be reused across query or scope', async () => {
  const f = fixture();
  for (let i = 0; i < 40; i++) f.add(`a-${i}`, 'Kanıtlar', { evidenceTitle: 'Search fixture secret' });
  for (let i = 0; i < 31; i++) f.add(`z-${String(i).padStart(2,'0')}`);
  const first = await f.search('fixture', restricted); assert.equal(first.results.length, 25); assert.ok(first.results.every(x => x.module === 'BIA'));
  const next = await f.search('fixture', restricted, { cursor: first.nextCursor! }); assert.equal(next.results.length, 6); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...first.results, ...next.results].map(x => x.id)).size, 31);
  await assert.rejects(f.search('other', restricted, { cursor: first.nextCursor! }), SearchInputError);
  await assert.rejects(f.search('fixture', full, { cursor: first.nextCursor! }), SearchInputError);
  await assert.rejects(f.search('fixture', restricted, { module: 'Kanıtlar' }), SearchInputError);
  assert.deepEqual(await f.search('fixture', { role: 'Viewer', moduleAccess: { mode: 'scoped', modules: {} } }), { results: [], nextCursor: null });
});
test('search is not limited to loaded client records and handles literal wildcard characters', async () => {
  const f = fixture();
  f.sqlite.exec('BEGIN'); for (let i = 0; i < 5100; i++) f.add(`row-${i}`, 'BIA', { process: i === 5099 ? 'Budget 100%_complete' : 'Other process' }); f.sqlite.exec('COMMIT');
  assert.deepEqual((await f.search('100%_')).results.map(x => x.id), ['row-5099']);
  assert.equal((await f.search("' OR 1=1 --")).results.length, 0);
});
test('malformed data and mismatched module code joins cannot leak or break search', async () => {
  const f = fixture(); f.add('one', 'BIA', { process: 'Known process' });
  f.sqlite.exec("UPDATE simple_grc_record_codes SET module='Kanıtlar',code='SECRET-CODE'; INSERT INTO simple_grc_records VALUES('broken','BIA','{');");
  assert.equal((await f.search('SECRET-CODE', restricted)).results.length, 0);
  assert.equal((await f.search('broken', restricted)).results[0].title, 'broken');
});
test('invalid inputs and database failures stay distinct from a successful empty search', async () => {
  const f = fixture();
  for (const q of ['', 'a', 'a'.repeat(121)]) await assert.rejects(f.search(q), SearchInputError);
  for (const cursor of ['null', '{}', '{', 'x'.repeat(1801)]) await assert.rejects(f.search('valid', full, { cursor }), SearchInputError);
  f.sqlite.exec('DROP TABLE simple_grc_records'); await assert.rejects(f.search('valid'));
  assert.equal(scopedApiAllowed(restricted, '/api/search', 'GET'), true);
  assert.equal(scopedApiAllowed(restricted, '/api/search', 'POST'), false);
  assert.equal(scopedApiAllowed(restricted, '/api/search/future', 'GET'), false);
});
