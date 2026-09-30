import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const platform = readFileSync("app/platform-experience.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const dashboard = readFileSync("app/executive-dashboard-reference.tsx", "utf8");
const css = readFileSync("app/executive-assurance.css", "utf8");

test("native dashboard replaces the old surface instead of stacking above it", () => {
  const native = page.slice(page.indexOf("function Dashboard("), page.indexOf("function Kpi("));
  assert.equal((native.match(/<ExecutiveAssurancePanel /g) || []).length, 1);
  assert.doesNotMatch(native, /dashboard-hero|dashboard-metrics|dashboard-intelligence|dashboard-shortcuts/);
  assert.doesNotMatch(platform, /<ExecutiveDashboard|<DashboardV|<DashboardMetric|<DashboardRuntime|<DashboardData/);
  assert.doesNotMatch(layout, /import "\.\/dashboard-/);
});

test("dashboard uses the shared palette and responsive cards", () => {
  for (const token of ["bg", "surface", "ink", "muted", "brand", "line"])
    assert.ok(css.includes(`var(--ws-${token})`));
  assert.match(css, /repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.doesNotMatch(css, /font-size:(?:7(?:\.5)?|8|9)px/);
  assert.doesNotMatch(css, /:has\(> \.executive-dashboard-reference\)/);
});

test("executive metrics retain authoritative data and honest empty states", () => {
  assert.match(dashboard, /assessedRiskScore\(row.data\)/);
  assert.match(dashboard, /score === null \? \[\]/);
  assert.match(dashboard, /\/api\/findings/);
  assert.match(dashboard, /Promise.allSettled/);
  assert.match(dashboard, /role="status"/);
  assert.match(dashboard, /total \? .* : "—"/);
  assert.match(dashboard, /decisionItems.filter\(\(item\) => item.value > 0\).slice\(0, 4\)/);
});
