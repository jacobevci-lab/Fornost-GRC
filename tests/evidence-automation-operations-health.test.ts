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
