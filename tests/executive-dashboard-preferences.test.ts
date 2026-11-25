import assert from "node:assert/strict";
import test from "node:test";
import {
  EXECUTIVE_DASHBOARD_DEFAULT_ORDER,
  EXECUTIVE_DASHBOARD_PRESETS,
  executiveDashboardPreferencesFingerprint,
  normalizeExecutiveDashboardPreferences,
} from "../app/executive-dashboard-preferences";

test("normalizes unknown dashboard preference input to the executive profile", () => {
  const preferences = normalizeExecutiveDashboardPreferences(null);
  assert.equal(preferences.preset, "executive");
  assert.deepEqual(preferences.order, EXECUTIVE_DASHBOARD_DEFAULT_ORDER);
  assert.deepEqual(preferences.visible, EXECUTIVE_DASHBOARD_PRESETS.executive.visible);
  assert.equal(preferences.compact, false);
});

test("preserves a valid preset while accepting explicit user overrides", () => {
  const preferences = normalizeExecutiveDashboardPreferences({
    preset: "risk",
    compact: true,
    visible: { assuranceHealth: true, auditRemediation: true },
  });
  assert.equal(preferences.preset, "risk");
  assert.equal(preferences.compact, true);
  assert.equal(preferences.visible.riskHeatmap, true);
  assert.equal(preferences.visible.assuranceHealth, true);
  assert.equal(preferences.visible.auditRemediation, true);
});

test("deduplicates widget order, rejects unknown widgets and appends missing widgets", () => {
  const preferences = normalizeExecutiveDashboardPreferences({
    order: ["auditRemediation", "actionCenter", "auditRemediation", "unknown", "riskHeatmap"],
  });
  assert.deepEqual(preferences.order, [
    "auditRemediation",
    "actionCenter",
    "riskHeatmap",
    "recentChanges",
    "frameworkReadiness",
    "assuranceHealth",
  ]);
});

test("ignores non-boolean visibility values", () => {
  const preferences = normalizeExecutiveDashboardPreferences({
    preset: "assurance",
    visible: { riskHeatmap: "yes", actionCenter: false },
  });
  assert.equal(preferences.visible.riskHeatmap, false);
  assert.equal(preferences.visible.actionCenter, false);
  assert.equal(preferences.visible.assuranceHealth, true);
});

test("produces a stable canonical fingerprint for equivalent preferences", () => {
  const first = normalizeExecutiveDashboardPreferences({
    preset: "executive",
    order: ["riskHeatmap", "actionCenter"],
  });
  const second = normalizeExecutiveDashboardPreferences(first);
  assert.equal(executiveDashboardPreferencesFingerprint(first), executiveDashboardPreferencesFingerprint(second));
});
