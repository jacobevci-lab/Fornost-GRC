import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const executivePanel = readFileSync("app/executive-assurance-panel.tsx", "utf8");
const attention = readFileSync("app/continuous-assurance-attention.tsx", "utf8");

test("executive dashboard reuses the authoritative Continuous Assurance attention surface", () => {
  assert.match(executivePanel, /import ContinuousAssuranceAttention from "\.\/continuous-assurance-attention"/);
  assert.match(executivePanel, /<ContinuousAssuranceAttention lang=\{lang\}\/>/);
  assert.equal((executivePanel.match(/<ContinuousAssuranceAttention /g) || []).length, 1);
});

test("dashboard attention remains grounded in operational insights rather than executive score inference", () => {
  assert.match(attention, /\/api\/evidence-automation\/operations-insights/);
  assert.match(attention, /\/api\/evidence-automation/);
  assert.match(attention, /chainByInsight/);
  assert.match(attention, /sourceRef: ref/);
  assert.match(attention, /ruleRef: ref/);
  assert.match(attention, /findingRef: ref/);
  assert.match(attention, /filter: \{ controlRef \}/);
  assert.match(attention, /filter: \{ evidenceRef \}/);
  assert.doesNotMatch(executivePanel, /operations-insights/);
  assert.doesNotMatch(executivePanel, /criticalConnectors|watchConnectors|evidenceGapRules/);
});

test("executive dashboard does not replace existing assurance, delivery or auditor surfaces", () => {
  assert.match(executivePanel, /buildExecutiveAssurance/);
  assert.match(executivePanel, /\/api\/continuous-assurance\/executive/);
  assert.match(executivePanel, /\/api\/continuous-assurance\/notifications/);
  assert.match(executivePanel, /\/api\/continuous-assurance\/auditor-pack/);
  assert.match(executivePanel, /OWNER ACCOUNTABILITY/);
  assert.match(executivePanel, /DELIVERY &amp; SLA/);
});
