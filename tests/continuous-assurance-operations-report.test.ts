import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildContinuousAssuranceOperationsCsv,
  buildContinuousAssuranceOperationsHtml,
  buildContinuousAssuranceOperationsReport,
} from "../app/evidence/operations-report";
import type { ContinuousAssuranceOperationsInsights } from "../app/evidence/operations-insights";

const insights: ContinuousAssuranceOperationsInsights = {
  generatedAt: "2026-09-29T20:00:00.000Z",
  windowHours: 24,
  state: "critical",
  summary: {
    enabledSources: 1,
    operationalRules: 2,
    healthyConnectors: 0,
    watchConnectors: 0,
    criticalConnectors: 1,
    idleConnectors: 0,
    attentionConnectors: 1,
    evidenceGapRules: 1,
    dueRules: 1,
    errorRuns24h: 2,
  },
  connectors: [{
    sourceId: "SRC-1",
    sourceName: "MDE, Production",
    vendor: "Microsoft",
    category: "Endpoint <Security>",
    activeRules: 2,
    healthyRules: 0,
    unhealthyRules: 1,
    dueRules: 1,
    evidenceReadyRules: 1,
    runs24h: 5,
    passRuns24h: 3,
    failRuns24h: 0,
    errorRuns24h: 2,
    successRate24h: 60,
    averageDurationMs24h: 840,
    p95DurationMs24h: 1200,
    lastRunAt: "2026-09-29T19:50:00.000Z",
    lastRunStatus: "error",
    state: "critical",
    reasons: ["connector-errors", "evidence-gap", "due-backlog"],
    evidenceGap: 1,
  }],
  insights: [{
    sourceId: "SRC-1",
    sourceName: "MDE, Production",
    vendor: "Microsoft",
    category: "Endpoint <Security>",
    state: "critical",
    code: "connector-errors",
    title: "Connector execution errors detected",
    detail: "2 connector execution error(s) were recorded in the last 24 hours.",
    affectedRules: 1,
    evidenceGap: 1,
    dueRules: 1,
    errorRuns24h: 2,
    successRate24h: 60,
  }],
};

test("operations report keeps the authoritative insight snapshot and immutable snapshot id", () => {
  const report = buildContinuousAssuranceOperationsReport(insights, "SHA256:abc123");
  assert.equal(report.schemaVersion, "1.0");
  assert.equal(report.snapshotId, "SHA256:abc123");
  assert.equal(report.generatedAt, insights.generatedAt);
  assert.equal(report.connectors[0]?.sourceId, "SRC-1");
  assert.equal(report.summary.errorRuns24h, 2);
  assert.match(report.notice, /not an independent audit opinion/i);
});

test("CSV export preserves connector identity, telemetry and safely quotes values", () => {
  const csv = buildContinuousAssuranceOperationsCsv(buildContinuousAssuranceOperationsReport(insights, "SHA256:abc123"));
  assert.match(csv, /snapshot_id,generated_at,window_hours,overall_state,source_id/);
  assert.match(csv, /SHA256:abc123/);
  assert.match(csv, /SRC-1/);
  assert.match(csv, /"MDE, Production"/);
  assert.match(csv, /connector-errors\|evidence-gap\|due-backlog/);
  assert.match(csv, /,60,840,1200,/);
});

test("HTML export escapes connector data and states its assurance limitation", () => {
  const report = buildContinuousAssuranceOperationsReport(insights, "SHA256:abc123");
  const html = buildContinuousAssuranceOperationsHtml(report, false);
  assert.match(html, /Continuous Assurance Operations Report/);
  assert.match(html, /Endpoint &lt;Security&gt;/);
  assert.doesNotMatch(html, /Endpoint <Security>/);
  assert.match(html, /not an independent audit opinion/i);
  assert.match(html, /SHA256:abc123/);
  assert.match(html, /SRC-1/);
});

test("operations report API is role-protected, hash-addressed and supports governed formats", () => {
  const route = readFileSync("app/api/evidence-automation/operations-report/route.ts", "utf8");
  assert.match(route, /requireRole\(req, \["Admin", "Editor", "Viewer"\]\)/);
  assert.match(route, /loadContinuousAssuranceOperationsHealth/);
  assert.match(route, /buildContinuousAssuranceOperationsInsights/);
  assert.match(route, /SHA256:/);
  assert.match(route, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(route, /\["html", "csv", "json"\]/);
  assert.match(route, /content-disposition/);
  assert.match(route, /x-content-type-options/);
  assert.match(route, /status: 503/);
  assert.match(route, /Continuous Assurance operations report is unavailable/);
});
