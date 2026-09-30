import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/continuous-assurance/traceability/route.ts", "utf8");

test("traceability projection is authenticated and reuses schema compatibility", () => {
  assert.match(route, /requireRole\(req, \["Admin", "Editor", "Viewer"\]\)/);
  assert.match(route, /ensureAssuranceWorkSchema\(env\.DB\)/);
  assert.match(route, /ensureFindingsSchemaCompatibility\(env\.DB\)/);
});

test("traceability projection is bounded to governed completed CAPA promotions", () => {
  assert.match(route, /w\.action = 'capa-promotion'/);
  assert.match(route, /w\.status = 'completed'/);
  assert.match(route, /w\.result_ref IS NOT NULL/);
  assert.match(route, /LEFT JOIN enterprise_findings ef ON ef\.id = w\.result_ref/);
  assert.match(route, /LIMIT 500/);
  assert.doesNotMatch(route, /enterprise_finding_events/);
  assert.doesNotMatch(route, /SELECT \* FROM enterprise_findings/);
});

test("traceability projection exposes only lifecycle integrity fields needed by attention", () => {
  assert.match(route, /ef\.status AS enterprise_status/);
  assert.match(route, /ef\.evidence_reference/);
  assert.match(route, /ef\.verification_evidence_reference/);
  assert.match(route, /ef\.recurrence_count/);
  assert.match(route, /enterpriseFinding: row\.enterprise_id \?/);
  assert.match(route, /available: false/);
  assert.match(route, /unresolved: items\.filter/);
});
