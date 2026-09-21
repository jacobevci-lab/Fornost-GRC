import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assurancePanel = readFileSync(new URL("../app/executive-assurance-panel.tsx", import.meta.url), "utf8");
const dashboardRetirement = readFileSync(new URL("../app/dashboard-retirement.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("executive assurance score renders as one baseline-safe value", () => {
  assert.match(assurancePanel, /\{assurance\.score\}\/100/);
  assert.doesNotMatch(assurancePanel, /<sup>\s*\/100\s*<\/sup>/);
});

test("dashboard workspace shortcut strip is removed from the runtime DOM", () => {
  assert.match(dashboardRetirement, /\.dashboard-shortcuts/);
  assert.match(dashboardRetirement, /querySelectorAll\(RETIRED_DASHBOARD_SELECTOR\)/);
  assert.match(dashboardRetirement, /element\.remove\(\)/);
  assert.match(dashboardRetirement, /MutationObserver/);
  assert.match(layout, /import DashboardRetirement from "\.\/dashboard-retirement"/);
  assert.match(layout, /<DashboardRetirement \/>/);
});
