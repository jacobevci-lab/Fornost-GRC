import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveMetricTrends,
  metricSnapshotDay,
  normalizeMetricPeriod,
  validateExecutiveMetricValue,
  type ExecutiveMetricSnapshot,
} from "../app/executive-metric-history";

test("normalizes supported dashboard periods", () => {
  assert.equal(normalizeMetricPeriod("30"), 30);
  assert.equal(normalizeMetricPeriod("90"), 90);
  assert.equal(normalizeMetricPeriod("365"), 365);
  assert.equal(normalizeMetricPeriod("999"), 30);
});

test("validates bounded executive metrics", () => {
  assert.equal(validateExecutiveMetricValue("grc_health", 58.124), 58.12);
  assert.equal(validateExecutiveMetricValue("control_effectiveness", 101), null);
  assert.equal(validateExecutiveMetricValue("high_critical_risks", -1), null);
  assert.equal(validateExecutiveMetricValue("overdue_actions", 4), 4);
});

test("uses a real historical baseline close to the requested period", () => {
  const snapshots: ExecutiveMetricSnapshot[] = [
    { metricKey: "grc_health", snapshotDay: "2026-09-23", value: 62, unit: "score" },
    { metricKey: "grc_health", snapshotDay: "2026-08-24", value: 58, unit: "score" },
    { metricKey: "high_critical_risks", snapshotDay: "2026-09-23", value: 1, unit: "count" },
    { metricKey: "high_critical_risks", snapshotDay: "2026-08-24", value: 3, unit: "count" },
  ];
  const trends = buildExecutiveMetricTrends(snapshots, 30, "2026-09-23T12:00:00Z");
  assert.equal(trends.grc_health.baseline, 58);
  assert.equal(trends.grc_health.delta, 4);
  assert.equal(trends.grc_health.improved, true);
  assert.equal(trends.high_critical_risks.delta, -2);
  assert.equal(trends.high_critical_risks.improved, true);
});

test("does not manufacture a trend when no baseline exists", () => {
  const snapshots: ExecutiveMetricSnapshot[] = [
    { metricKey: "evidence_freshness", snapshotDay: "2026-09-23", value: 75, unit: "percent" },
    { metricKey: "evidence_freshness", snapshotDay: "2026-09-10", value: 70, unit: "percent" },
  ];
  const trends = buildExecutiveMetricTrends(snapshots, 30, "2026-09-23T12:00:00Z");
  assert.equal(trends.evidence_freshness.historyAvailable, false);
  assert.equal(trends.evidence_freshness.baseline, null);
  assert.equal(trends.evidence_freshness.delta, null);
});

test("snapshot days are UTC-stable", () => {
  assert.equal(metricSnapshotDay("2026-09-23T23:59:59Z"), "2026-09-23");
});
