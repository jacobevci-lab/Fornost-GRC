import assert from "node:assert/strict";
import test from "node:test";
import { assuranceWorkSlaHours, assuranceWorkSlaState, summarizeAssuranceQueue } from "../app/assurance-work-queue-metrics";

const now = new Date("2026-09-21T12:00:00Z");

test("critical assurance work receives the shortest review SLA", () => {
  assert.equal(assuranceWorkSlaHours({action:"capa-promotion",status:"pending-review",severity:"critical"}),4);
  assert.equal(assuranceWorkSlaHours({action:"control-retest",status:"pending-review",severity:"high"}),8);
  assert.equal(assuranceWorkSlaHours({action:"control-retest",status:"pending-review",severity:"medium"}),12);
});

test("active work becomes due soon and breached by elapsed age", () => {
  assert.equal(assuranceWorkSlaState({action:"control-retest",status:"pending-review",createdAt:"2026-09-21T04:00:00Z",severity:"medium"},now),"within-sla");
  assert.equal(assuranceWorkSlaState({action:"control-retest",status:"pending-review",createdAt:"2026-09-21T02:30:00Z",severity:"medium"},now),"due-soon");
  assert.equal(assuranceWorkSlaState({action:"control-retest",status:"pending-review",createdAt:"2026-09-20T23:00:00Z",severity:"medium"},now),"breached");
});

test("closed work is excluded from active SLA breach calculations", () => {
  const summary=summarizeAssuranceQueue([
    {action:"control-retest",status:"pending-review",createdAt:"2026-09-20T23:00:00Z",severity:"medium"},
    {action:"capa-promotion",status:"completed",createdAt:"2026-09-19T00:00:00Z",reviewedAt:"2026-09-19T03:00:00Z",severity:"high"},
  ],now);
  assert.equal(summary.active,1);
  assert.equal(summary.breached,1);
  assert.equal(summary.averageReviewHours,3);
  assert.equal(summary.withinSlaPercent,0);
});
