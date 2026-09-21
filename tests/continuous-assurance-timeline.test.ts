import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/continuous-assurance/timeline/route.ts","utf8");
const component=readFileSync("app/continuous-assurance-timeline.tsx","utf8");
const css=readFileSync("app/continuous-assurance-timeline.css","utf8");

test("timeline aggregates assurance lifecycle sources including escalations",()=>{
  assert.match(route,/continuous_assurance_work_items/);
  assert.match(route,/evidence_automation_runs/);
  assert.match(route,/enterprise_finding_events/);
  assert.match(route,/Risk Assessment/);
  assert.match(route,/reassessmentSource/);
  assert.match(route,/startsWith\("Continuous Assurance"\)/);
  assert.match(route,/continuous_assurance_escalations/);
});

test("timeline preserves escalation opened acknowledged and resolved audit events",()=>{
  assert.match(route,/escalation-opened/);
  assert.match(route,/escalation-acknowledged/);
  assert.match(route,/escalation-resolved/);
  assert.match(route,/acknowledged_by/);
  assert.match(route,/ack_note/);
  assert.match(route,/resolved_by/);
  assert.match(route,/first_seen_at/);
  assert.match(route,/resolved_at/);
});

test("timeline remains read-only and role protected",()=>{
  assert.match(route,/requireRole\(req,\["Admin","Editor","Viewer"\]\)/);
  assert.doesNotMatch(route,/export async function POST/);
});

test("timeline UI supports escalation filtering and bounded expansion",()=>{
  assert.match(component,/ASSURANCE TIMELINE/);
  assert.match(component,/control/);
  assert.match(component,/review/);
  assert.match(component,/capa/);
  assert.match(component,/finding/);
  assert.match(component,/risk/);
  assert.match(component,/escalation/);
  assert.match(component,/slice\(0,expanded\?100:12\)/);
  assert.match(css,/article>i\.escalation/);
});
