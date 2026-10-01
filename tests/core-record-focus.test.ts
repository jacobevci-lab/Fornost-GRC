import assert from "node:assert/strict";
import test from "node:test";
import { resolveCoreRecord, isCoreRecordRequest } from "../app/core-record-focus.ts";
const rows = [
  { id: "r1", code: "BIA-001", module: "BIA", data: { process: "Shared title" } },
  { id: "r10", code: "BIA-0010", module: "BIA", data: { process: "Shared title" } },
  { id: "a1", code: "AST-001", module: "Varlık Envanteri", data: {} },
];
test("contextual navigation resolves the exact record and module aliases", () => {
  assert.equal(resolveCoreRecord(rows, { module: "Business Impact Analysis (BIA)", ref: "BIA-001", kind: "record" })?.id, "r1");
  assert.equal(resolveCoreRecord(rows, { module: "BIA", ref: "r10", source: "connected-grc-register" })?.id, "r10");
});
test("unknown, wrong-module and ambiguous references never focus a nearby record", () => {
  for (const ref of ["BIA-00", "Shared title", "AST-001", "gone"])
    assert.equal(resolveCoreRecord(rows, { module: "BIA", ref, kind: "record" }), null);
  assert.equal(resolveCoreRecord([...rows, { ...rows[0], id: "duplicate" }], { module: "BIA", ref: "BIA-001", kind: "record" }), null);
});
test("related-control searches and enterprise modules stay with their own navigation handlers", () => {
  assert.equal(isCoreRecordRequest({ module: "Kanıtlar", ref: "A.5.1", source: "audit-readiness", filter: { controlRef: "A.5.1" } }), false);
  assert.equal(isCoreRecordRequest({ module: "Bulgular ve CAPA", kind: "record", ref: "FND-001" }), false);
});
