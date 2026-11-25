import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/evidence-automation/operations-insights/route.ts", "utf8");
const insights = readFileSync("app/evidence/operations-insights.ts", "utf8");

test("operations insights reuse the authoritative operations health contract", () => {
  assert.match(route, /loadContinuousAssuranceOperationsHealth/);
  assert.match(route, /buildContinuousAssuranceOperationsInsights/);
  assert.match(route, /requireRole\(req, \["Admin", "Editor", "Viewer"\]\)/);
  assert.match(route, /cache-control/);
});

test("operations insights classify connector state from concrete operational signals", () => {
  assert.match(insights, /connector\.activeRules === 0/);
  assert.match(insights, /connector\.errorRuns24h > 0 \|\| connector\.unhealthyRules > 0/);
  assert.match(insights, /gap > 0 \|\| connector\.dueRules > 0/);
  assert.match(insights, /"critical"/);
  assert.match(insights, /"watch"/);
  assert.match(insights, /"healthy"/);
  assert.match(insights, /"idle"/);
});

test("operations insights expose actionable reasons without guessing record identities", () => {
  for (const code of ["connector-errors", "control-health", "evidence-gap", "due-backlog", "no-active-rules"])
    assert.match(insights, new RegExp(code));
  assert.match(insights, /sourceId: connector\.sourceId/);
  assert.match(insights, /sourceName: connector\.sourceName/);
  assert.match(insights, /evidenceGap: connector\.evidenceGap/);
  assert.match(insights, /successRate24h: connector\.successRate24h/);
  assert.doesNotMatch(insights, /`CCM-\$\{/);
  assert.doesNotMatch(insights, /`EVD-AUTO-\$\{/);
});

test("operations insight summary stays scoped to the authoritative health population", () => {
  assert.match(insights, /enabledSources: health\.summary\.enabledSources/);
  assert.match(insights, /operationalRules: health\.summary\.operationalRules/);
  assert.match(insights, /dueRules: health\.summary\.dueRules/);
  assert.match(insights, /errorRuns24h: health\.summary\.errorRuns24h/);
  assert.match(insights, /attentionConnectors: criticalConnectors \+ watchConnectors/);
  assert.match(insights, /evidenceGapRules: connectors\.reduce/);
});

test("operations insights fail closed into unknown availability rather than fake health", () => {
  assert.match(route, /available: false/);
  assert.match(route, /state: "unknown"/);
  assert.match(route, /summary: null/);
  assert.match(route, /connectors: \[\]/);
  assert.match(route, /insights: \[\]/);
});
