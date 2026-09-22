import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assurancePanel = readFileSync(new URL("../app/executive-assurance-panel.tsx", import.meta.url), "utf8");
const dashboardCustomizer = readFileSync(new URL("../app/dashboard-customizer.tsx", import.meta.url), "utf8");
const dashboardCustomizerCss = readFileSync(new URL("../app/dashboard-customizer.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("executive assurance score renders as one baseline-safe value", () => {
  assert.match(assurancePanel, /\{assurance\.score\}\/100/);
  assert.doesNotMatch(assurancePanel, /<sup>\s*\/100\s*<\/sup>/);
});

test("dashboard mounts the customizable executive workspace instead of the retired DOM cleanup", () => {
  assert.match(layout, /import DashboardCustomizer from "\.\/dashboard-customizer"/);
  assert.match(layout, /<DashboardCustomizer \/>/);
  assert.doesNotMatch(layout, /DashboardRetirement/);

  assert.match(dashboardCustomizer, /fornost:dashboard-preferences:v1/);
  assert.match(dashboardCustomizer, /type PresetId="executive"\|"risk"\|"assurance"\|"operations"/);
  assert.match(dashboardCustomizer, /Dashboard'ı Özelleştir/);
  assert.match(dashboardCustomizer, /\.dashboard-metrics/);
  assert.match(dashboardCustomizer, /\.executive-assurance-panel/);
  assert.match(dashboardCustomizer, /\.risk-focus-panel/);
  assert.match(dashboardCustomizer, /\.attention-panel/);
  assert.match(dashboardCustomizer, /\.assurance-panel/);
  assert.match(dashboardCustomizer, /\.resilience-panel/);
  assert.match(dashboardCustomizer, /\.dashboard-shortcuts/);
  assert.match(dashboardCustomizer, /window\.localStorage\.setItem\(STORAGE_KEY/);
});

test("custom dashboard keeps enterprise responsive and compact layout contracts", () => {
  assert.match(dashboardCustomizerCss, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(dashboardCustomizerCss, /\.fornost-dashboard-compact/);
  assert.match(dashboardCustomizerCss, /\.dashboard-customizer-drawer/);
  assert.match(dashboardCustomizerCss, /@media\(max-width:1200px\)/);
  assert.match(dashboardCustomizerCss, /@media\(max-width:820px\)/);
  assert.match(dashboardCustomizerCss, /html\[data-theme="dark"\]/);
});
