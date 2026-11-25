import assert from "node:assert/strict";
import test from "node:test";
import { connectedGrcExport } from "../app/connected-grc-export";
const scope = { ready: 8, total: 8, loading: false, generatedAt: "2026-10-06T07:00:00Z" };
test("loading cannot produce a misleading complete export", () => {
  assert.equal(connectedGrcExport([], { ...scope, loading: true }), null);
});
test("empty partial exports retain their incomplete source coverage", () => {
  const result = connectedGrcExport([], { ...scope, ready: 7 })!;
  assert.equal(result.filename, "fornost-connected-grc-partial.csv");
  assert.match(result.content, /"partial";"7";"8";"2026-10-06T07:00:00Z"/);
});
test("loaded-source exports preserve relationship fields and neutralize spreadsheet formulas", () => {
  const row = { id: "id-1", module: "Kontroller", code: '=CMD()', data: { title: '  +formula;"quoted"\nnext' } };
  const result = connectedGrcExport([{ source: row, target: row, matched: "ref", field: "controlRef", relation: "control" }], scope)!;
  assert.equal(result.filename, "fornost-connected-grc.csv");
  assert.ok(result.content.includes('"\'=CMD()"'));
  assert.ok(result.content.includes('"\'  +formula;""quoted""\nnext"'));
  assert.match(result.content, /"loaded";"8";"8"/);
});
