import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const executivePanel = readFileSync("app/executive-assurance-panel.tsx", "utf8");
const attention = readFileSync("app/continuous-assurance-attention.tsx", "utf8");
const loader = readFileSync("app/assurance-attention-loader.ts", "utf8");

test("dashboard attention remains grounded in operational insights rather than executive score inference", () => {
  assert.match(attention, /readAttentionSnapshot\(controller.signal\)/);
  assert.match(loader, /\/api\/evidence-automation\/operations-insights/);
  assert.match(loader, /\/api\/evidence-automation/);
  assert.match(attention, /chainByInsight/);
  assert.match(attention, /sourceRef: ref/);
  assert.match(attention, /ruleRef: ref/);
  assert.match(attention, /findingRef: ref/);
  assert.match(attention, /filter: \{ controlRef \}/);
  assert.match(attention, /filter: \{ evidenceRef \}/);
  assert.doesNotMatch(executivePanel, /operations-insights/);
  assert.doesNotMatch(executivePanel, /criticalConnectors|watchConnectors|evidenceGapRules/);
});

test("dashboard loads the verified executive snapshot without opening notification history", () => {
  assert.match(executivePanel, /useExecutiveAssurance\(rows\)/);
  assert.doesNotMatch(executivePanel, /ContinuousAssuranceAttention|continuous-assurance\/notifications/);
});
