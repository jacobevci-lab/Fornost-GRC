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

test('missing, malformed, timezone-free, impossible and future creation timestamps are unknown',()=>{
 for(const createdAt of [undefined,'','garbage','2026-09-21','2026-09-21T11:00:00','2026-02-30T11:00:00Z','2026-09-21T24:00:00Z','2026-09-21T12:00:01Z']){
  const item={action:'control-retest',status:'pending-review',createdAt,updatedAt:'2026-09-21T11:00:00Z'};
  assert.equal(assuranceWorkSlaState(item,now),'unknown',String(createdAt));
 }
 assert.equal(assuranceWorkSlaState({action:'control-retest',status:'completed'},now),'closed');
});
test('SLA boundaries use the same instant for offset timestamps and breach at the deadline',()=>{
 const item={action:'control-retest',status:'pending-review',severity:'high',createdAt:'2026-09-21T07:00:00+03:00'};
 assert.equal(assuranceWorkSlaState(item,new Date('2026-09-21T11:59:59Z')),'due-soon');
 assert.equal(assuranceWorkSlaState(item,now),'breached');
 assert.equal(assuranceWorkSlaState(item,new Date('invalid')),'unknown');
});
test('unknown active timestamps suppress overall SLA percentage and incomplete pending-age metrics',()=>{
 const summary=summarizeAssuranceQueue([
  {action:'control-retest',status:'pending-review',createdAt:'2026-09-21T11:00:00Z'},
  {action:'control-retest',status:'pending-review',updatedAt:'2026-09-21T11:00:00Z'},
  {action:'control-retest',status:'completed'},
 ],now);
 assert.equal(summary.active,2);assert.equal(summary.unknown,1);assert.equal(summary.withinSlaPercent,null);assert.equal(summary.oldestPendingHours,null);
 assert.equal(summary.breached,0);assert.equal(summary.averageReviewHours,null);
});
test('no active work or valid review observations yield no fabricated 100 percent or zero-hour average',()=>{
 assert.equal(summarizeAssuranceQueue([],now).withinSlaPercent,null);
 assert.equal(summarizeAssuranceQueue([],now).oldestPendingHours,null);
 const summary=summarizeAssuranceQueue([
  {action:'control-retest',status:'completed',createdAt:'2026-09-21T10:00:00Z',reviewedAt:'2026-09-22T10:00:00Z'},
  {action:'control-retest',status:'completed',createdAt:'2026-09-21T10:00:00Z',reviewedAt:'2026-09-21T09:00:00Z'},
 ],now);
 assert.equal(summary.averageReviewHours,null);assert.equal(summary.unknown,0);
});


test('broken source links remain unknown rather than inheriting a normal-severity SLA',()=>{
 const now=new Date('2026-10-08T12:00:00Z');
 const valid={action:'control-retest',status:'pending-review',createdAt:'2026-10-08T11:00:00Z',severity:'high'};
 for(const sourceState of ['missing-finding','missing-rule','rule-mismatch','unavailable'] as const){
  const broken={...valid,sourceState};
  assert.equal(assuranceWorkSlaState(broken,now),'unknown');
  const result=summarizeAssuranceQueue([valid,broken],now);
  assert.equal(result.active,2);assert.equal(result.unknown,1);assert.equal(result.withinSlaPercent,null);
 }
});
