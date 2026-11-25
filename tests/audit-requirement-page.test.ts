import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRequirementPage } from '../app/audit-requirement-page';
test('all 1014 requirements remain reachable without duplicate or missing pages', () => {
 const rows = Array.from({ length: 1014 }, (_, id) => ({ id }));
 const seen = Array.from({ length: 21 }, (_, i) => auditRequirementPage(rows, i + 1, 50).rows).flat();
 assert.deepEqual(seen, rows);
 assert.equal(auditRequirementPage(rows, 21, 50).rows.length, 14);
 assert.equal(auditRequirementPage(rows, 21, 50).start, 1001);
});
test('filtered/deleted records clamp the page and empty results stay empty', () => {
 assert.deepEqual(auditRequirementPage([1, 2], 21, 50).rows, [1, 2]);
 const empty = auditRequirementPage([], 21, 100);
 assert.equal(empty.page, 1); assert.equal(empty.start, 0); assert.equal(empty.end, 0);
 assert.deepEqual(empty.rows, []);
});
test('invalid page sizes and indices cannot hide records', () => {
 const rows = Array.from({ length: 300 }, (_, id) => id);
 assert.equal(auditRequirementPage(rows, NaN, -1).size, 50);
 assert.equal(auditRequirementPage(rows, -2, 100).page, 1);
 assert.deepEqual(auditRequirementPage(rows, 2, 200).rows, rows.slice(200));
});
