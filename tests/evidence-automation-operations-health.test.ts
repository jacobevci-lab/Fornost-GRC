import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/evidence-automation/operations-health/route.ts", "utf8");

test("operations health is a governed read-only assurance endpoint", () => {
  assert.match(route, /requireRole\(req, \["Admin", "Editor", "Viewer"\]\)/);
  assert.match(route, /cache-control": "no-store"/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST/);
});

test("operations health scopes telemetry to enabled sources and enabled rules", () => {
  assert.match(route, /const enabledSources = sourceResult\.results\.filter\(\(source\) => Boolean\(source\.enabled\)\)/);
  assert.match(route, /const enabledSourceIds = new Set\(enabledSources\.map\(\(source\) => source\.id\)\)/);
  assert.match(route, /Boolean\(rule\.enabled\) && enabledSourceIds\.has\(rule\.source_id\)/);
  assert.match(route, /const operationalRuleIds = new Set\(operationalRules\.map\(\(rule\) => rule\.id\)\)/);
  assert.match(route, /operationalRuleIds\.has\(run\.rule_id\)/);
});

test("operations health derives control health from authoritative run and evidence timestamps", () => {
  assert.match(route, /WHEN last_run_at IS NULL THEN 'missing'/);
  assert.match(route, /WHEN last_status IN \('fail','error'\) THEN 'failing'/);
  assert.match(route, /WHEN last_evidence_at IS NULL THEN 'missing'/);
  assert.match(route, /datetime\(last_evidence_at, '\+' \|\| freshness_hours \|\| ' hours'\) < datetime\(\?\) THEN 'stale'/);
  assert.match(route, /ELSE 'healthy'/);
});

test("operations health exposes useful 24 hour reliability telemetry without secrets", () => {
  assert.match(route, /windowHours: 24/);
  assert.match(route, /successRate24h/);
  assert.match(route, /averageDurationMs24h/);
  assert.match(route, /p95DurationMs24h/);
  assert.match(route, /passRuns24h/);
  assert.match(route, /failRuns24h/);
  assert.match(route, /errorRuns24h/);
  assert.match(route, /evidenceReadyRules/);
  assert.match(route, /dueRules/);
  assert.doesNotMatch(route, /secret_ciphertext/);
  assert.doesNotMatch(route, /config_json/);
});

test("operations health returns unknown availability rather than fabricated zero health on backend failure", () => {
  assert.match(route, /available: false/);
  assert.match(route, /summary: null/);
  assert.match(route, /connectors: \[\]/);
});
