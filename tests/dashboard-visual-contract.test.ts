import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assurancePanel = readFileSync(new URL("../app/executive-assurance-panel.tsx", import.meta.url), "utf8");
const executiveDashboard = readFileSync(new URL("../app/executive-dashboard.tsx", import.meta.url), "utf8");
const executiveDashboardCss = readFileSync(new URL("../app/executive-dashboard.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const platformExperience = readFileSync(new URL("../app/platform-experience.tsx", import.meta.url), "utf8");

test("executive assurance score renders as one baseline-safe value", () => {
  assert.match(assurancePanel, /\{assurance\.score\}\/100/);
  assert.doesNotMatch(assurancePanel, /<sup>\s*\/100\s*<\/sup>/);
});

test("layout composes the v4 executive decision surface through PlatformExperience", () => {
  assert.match(layout, /import PlatformExperience from "\.\/platform-experience"/);
  assert.match(layout, /<PlatformExperience \/>/);
  assert.doesNotMatch(layout, /import ExecutiveDashboard from "\.\/executive-dashboard"/);
  assert.doesNotMatch(layout, /<DashboardCustomizer \/>/);

  assert.match(platformExperience, /import ExecutiveDashboard from "\.\/executive-dashboard"/);
  assert.match(platformExperience, /<ExecutiveDashboard \/>/);

  assert.match(executiveDashboard, /fornost:executive-dashboard:v4/);
  assert.match(executiveDashboard, /type WidgetId="riskHeatmap"\|"actionCenter"\|"recentChanges"\|"frameworkReadiness"\|"assuranceHealth"\|"auditRemediation"/);
  assert.match(executiveDashboard, /\/api\/risk-appetite/);
  assert.match(executiveDashboard, /\/api\/findings/);
  assert.match(executiveDashboard, /buildExecutiveAssurance/);
  assert.match(executiveDashboard, /buildControlAssurance/);
  assert.match(executiveDashboard, /Olasılık × Etki Isı Haritası/);
  assert.match(executiveDashboard, /Neler Değişti\?/);
  assert.match(executiveDashboard, /Framework hazırlığı/);
  assert.match(executiveDashboard, /Güvence sağlığı/);
  assert.match(executiveDashboard, /Denetim & İyileştirme/);
});

test("dashboard v4 replaces report stacking with an executive 12-column decision grid", () => {
  assert.match(executiveDashboardCss, /\.ed4-grid\{display:grid;grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(executiveDashboardCss, /\.ed4-risk-map\{grid-column:span 8\}/);
  assert.match(executiveDashboardCss, /\.ed4-action-center\{grid-column:span 4\}/);
  assert.match(executiveDashboardCss, /\.ed4-changes\{grid-column:span 5\}/);
  assert.match(executiveDashboardCss, /\.ed4-frameworks\{grid-column:span 7\}/);
  assert.match(executiveDashboardCss, /\.ed4-assurance\{grid-column:span 7/);
  assert.match(executiveDashboardCss, /\.ed4-audit\{grid-column:span 5\}/);
});

test("dashboard v4 preserves the Fornost palette and responsive contracts", () => {
  assert.doesNotMatch(executiveDashboardCss, /:root\s*\{/);
  assert.doesNotMatch(executiveDashboardCss, /html\[data-theme="dark"\]\s*\{/);
  assert.doesNotMatch(executiveDashboardCss, /--(?:ws|cp|fd)-(?:bg|panel|surface|brand|ink|green|teal|orange)\s*:/);
  assert.match(executiveDashboardCss, /var\(--cp-panel\)/);
  assert.match(executiveDashboardCss, /var\(--cp-line\)/);
  assert.match(executiveDashboardCss, /@media\(max-width:1450px\)/);
  assert.match(executiveDashboardCss, /@media\(max-width:1120px\)/);
  assert.match(executiveDashboardCss, /@media\(max-width:720px\)/);
});
