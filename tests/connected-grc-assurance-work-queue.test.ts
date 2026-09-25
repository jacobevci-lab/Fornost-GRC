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
  assert.match(queue, /capa-promotion/);
  assert.match(queue, /Complete review, CAPA and re-test work from one focused queue/);
  assert.match(queue, /Approval promotes this candidate into the Findings & CAPA lifecycle/);
  assert.match(queue, /Control Re-test|Re-test/);
  assert.match(queue, /approved-awaiting-retest/);
  assert.match(queue, /review-work-item/);
});

test("approved CAPA promotion opens the governed enterprise finding in context", () => {
  assert.match(queue, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(queue, /function openPromotedCapa\(code:string\)/);
  assert.match(queue, /module:"Bulgular ve CAPA"/);
  assert.match(queue, /source:"continuous-assurance-work-queue"/);
  assert.match(queue, /filter:\{findingRef:findingCode\}/);
  assert.match(queue, /review\.decision==="approve"&&review\.item\.action==="capa-promotion"&&data\.code/);
  assert.match(queue, /openPromotedCapa\(data\.code\)/);
});

test("retest work deep-links to the exact automation rule and mapped control", () => {
  assert.match(queue, /targetControlRef\?:string/);
  assert.match(queue, /function openAutomationRule\(ruleId:string\)/);
  assert.match(queue, /module:"Kanıt Otomasyonu"/);
  assert.match(queue, /filter:\{ruleRef:ref\}/);
  assert.match(queue, /function openMappedControl\(controlRef:string\)/);
  assert.match(queue, /module:"Kontroller"/);
  assert.match(queue, /filter:\{controlRef:ref\}/);
  assert.match(queue, /openAutomationRule\(item\.ruleId\)/);
  assert.match(queue, /openMappedControl\(item\.targetControlRef\|\|""\)/);
  assert.match(queue, /Re-test Kuralına Git/);
  assert.match(queue, /Open Retest Rule/);
});

test("completed CAPA queue items preserve human-readable canonical result codes", () => {
  assert.match(route, /LEFT JOIN enterprise_findings ef ON ef\.id=w\.result_ref/);
  assert.match(route, /ef\.code result_code/);
  assert.match(route, /resultCode:row\.result_code\|\|""/);
  assert.match(queue, /resultCode\?:string/);
  assert.match(queue, /item\.resultCode\|\|item\.resultRef/);
  assert.match(queue, /item\.status==="completed"&&item\.action==="capa-promotion"&&item\.resultCode/);
  assert.match(queue, /CAPA'yı Aç/);
  assert.match(queue, /Open CAPA/);
});

test("work queue API enriches queue rows with finding and control context", () => {
  assert.match(route, /LEFT JOIN evidence_automation_findings/);
  assert.match(route, /LEFT JOIN evidence_automation_rules/);
  assert.match(route, /findingTitle/);
  assert.match(route, /severity:row\.finding_severity/);
  assert.match(route, /ruleName:row\.rule_name/);
  assert.match(route, /controlRefs:row\.control_refs/);
  assert.match(route, /targetControlRef:targetControlFromDecision\(decision\)/);
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
