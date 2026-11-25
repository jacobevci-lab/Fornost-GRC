import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component=readFileSync("app/continuous-assurance-work-queue.tsx","utf8");
const css=readFileSync("app/assurance-work-queue-operations.css","utf8");

test("assurance work queue surfaces SLA aging and operational filters",()=>{
  assert.match(component,/summarizeAssuranceQueue/);
  assert.match(component,/assuranceWorkSlaState/);
  assert.match(component,/oldestPendingHours/);
  assert.match(component,/averageReviewHours/);
  assert.match(component,/withinSlaPercent/);
  assert.match(component,/QueueFilter/);
  assert.match(component,/attention/);
  assert.match(css,/\.assurance-ops/);
  assert.match(css,/\.assurance-work-filters/);
  assert.match(css,/\.assurance-work-sla\.breached/);
});
