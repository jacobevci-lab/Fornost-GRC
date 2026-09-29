import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/evidence-automation/operations-health/route.ts", "utf8");
const implementation = readFileSync("app/evidence/operations-health.ts", "utf8");

test("operations health is a governed read-only assurance endpoint", () => {
  assert.match(route, /requireRole\(req, \["Admin", "Editor", "Viewer"\]\)/);
  assert.match(route, /cache-control": "no-store"/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(route, /loadContinuousAssuranceOperationsHealth\(runtime\.DB, now\)/);
});

test("operations health scopes telemetry to enabled sources and enabled rules", () => {
  assert.match(implementation, /const enabledSources = sourceResult\.results\.filter\(\(source\) => Boolean\(source\.enabled\)\)/);
  assert.match(implementation, /const enabledSourceIds = new Set\(enabledSources\.map\(\(source\) => source\.id\)\)/);
  assert.match(implementation, /Boolean\(rule\.enabled\) && enabledSourceIds\.has\(rule\.source_id\)/);
  assert.match(implementation, /const operationalRuleIds = new Set\(operationalRules\.map\(\(rule\) => rule\.id\)\)/);
  assert.match(implementation, /operationalRuleIds\.has\(run\.rule_id\)/);
});

test("operations health derives control health from authoritative run and evidence timestamps", () => {
  assert.match(implementation, /WHEN last_run_at IS NULL THEN 'missing'/);
  assert.match(implementation, /WHEN last_status IN \('fail','error'\) THEN 'failing'/);
  assert.match(implementation, /WHEN last_evidence_at IS NULL THEN 'missing'/);
  assert.match(implementation, /datetime\(last_evidence_at, '\+' \|\| freshness_hours \|\| ' hours'\) < datetime\(\?\) THEN 'stale'/);
  assert.match(implementation, /ELSE 'healthy'/);
});

test("shared operations health exposes useful 24 hour reliability telemetry without secrets", () => {
  assert.match(implementation, /windowHours: 24/);
  assert.match(implementation, /successRate24h/);
  assert.match(implementation, /averageDurationMs24h/);
  assert.match(implementation, /p95DurationMs24h/);
  assert.match(implementation, /passRuns24h/);
  assert.match(implementation, /failRuns24h/);
  assert.match(implementation, /errorRuns24h/);
  assert.match(implementation, /evidenceReadyRules/);
  assert.match(implementation, /dueRules/);
  assert.doesNotMatch(implementation, /secret_ciphertext/);
  assert.doesNotMatch(implementation, /config_json/);
});

test("operations health returns unknown availability rather than fabricated zero health on backend failure", () => {
  assert.match(route, /available: false/);
  assert.match(route, /summary: null/);
  assert.match(route, /connectors: \[\]/);
});
