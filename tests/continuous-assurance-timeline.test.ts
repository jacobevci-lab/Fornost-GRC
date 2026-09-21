import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/continuous-assurance/timeline/route.ts","utf8");
const component=readFileSync("app/continuous-assurance-timeline.tsx","utf8");

test("timeline aggregates assurance lifecycle sources",()=>{
  assert.match(route,/continuous_assurance_work_items/);
  assert.match(route,/evidence_automation_runs/);
  assert.match(route,/enterprise_finding_events/);
  assert.match(route,/Risk Assessment/);
  assert.match(route,/reassessmentSource/);
});

test("timeline remains read-only and role protected",()=>{
  assert.match(route,/requireRole\(req,\["Admin","Editor","Viewer"\]\)/);
  assert.doesNotMatch(route,/export async function POST/);
});

test("timeline UI supports category filtering and bounded expansion",()=>{
  assert.match(component,/ASSURANCE TIMELINE/);
  assert.match(component,/control/);
  assert.match(component,/review/);
  assert.match(component,/capa/);
  assert.match(component,/finding/);
  assert.match(component,/risk/);
  assert.match(component,/slice\(0,expanded\?100:12\)/);
});
