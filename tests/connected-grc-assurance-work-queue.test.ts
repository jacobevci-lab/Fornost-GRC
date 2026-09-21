import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const connected = readFileSync("app/connected-grc.tsx", "utf8");
const queue = readFileSync("app/continuous-assurance-work-queue.tsx", "utf8");
const queueCss = readFileSync("app/continuous-assurance-work-queue.css", "utf8");
const route = readFileSync("app/api/continuous-assurance/route.ts", "utf8");

test("Connected GRC mounts the operational assurance work queue", () => {
  assert.match(connected, /ContinuousAssuranceWorkQueue/);
  assert.match(connected, /onOpenAutomation=\{\(\)=>go\("Kanıt Otomasyonu"\)\}/);
  assert.match(queue, /\/api\/continuous-assurance/);
  assert.match(queue, /pending-review/);
  assert.match(queue, /CAPA Promotion/);
  assert.match(queue, /Control Re-test/);
  assert.match(queue, /approved-awaiting-retest/);
  assert.match(queue, /review-work-item/);
});

test("work queue API enriches queue rows with finding and control context", () => {
  assert.match(route, /LEFT JOIN evidence_automation_findings/);
  assert.match(route, /LEFT JOIN evidence_automation_rules/);
  assert.match(route, /findingTitle/);
  assert.match(route, /severity:row\.finding_severity/);
  assert.match(route, /ruleName:row\.rule_name/);
  assert.match(route, /controlRefs:row\.control_refs/);
  assert.match(route, /catch\{[\s\S]*SELECT \* FROM continuous_assurance_work_items/);
});

test("work queue styling follows Fornost status and responsive contracts", () => {
  assert.match(queueCss, /\.assurance-work-queue/);
  assert.match(queueCss, /var\(--ws-brand\)/);
  assert.match(queueCss, /var\(--ws-warning\)/);
  assert.match(queueCss, /var\(--ws-danger\)/);
  assert.match(queueCss, /\.assurance-review-dialog/);
  assert.match(queueCss, /@media\(max-width:760px\)/);
});
