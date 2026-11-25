import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {failedAttemptsSinceReset,summarizeAssuranceDelivery,type AssuranceDeliveryOutbox,type AssuranceDeliveryRecord,type AssuranceNotificationRetryReset} from "../app/assurance-notification-delivery";
import {summarizeAssuranceSchedulerHealth,type AssuranceDispatchRun} from "../app/assurance-notification-dispatch";

const outbox:AssuranceDeliveryOutbox={id:"O-1",escalation_id:"E-1",recipient:"owner@example.com",route:"owner",subject:"Control failed",body:"Action required",severity:"high",status:"queued",reason:"accountable-owner",created_at:"2026-09-21T00:00:00.000Z",updated_at:"2026-09-21T00:00:00.000Z"};
const failed=(id:string,attempt:number,at:string):AssuranceDeliveryRecord=>({id,outbox_id:"O-1",attempt,provider:"smtp-bridge",state:"failed",detail:"HTTP 502",recipient:"owner@example.com",attempted_by:"system",attempted_at:at});
const reset:AssuranceNotificationRetryReset={id:"R-1",outbox_id:"O-1",actor:"admin@example.com",reason:"SMTP relay was remediated and validated before retry recovery.",prior_failed_attempts:2,created_at:"2026-09-21T03:00:00.000Z"};
const run=(patch:Partial<AssuranceDispatchRun>={}):AssuranceDispatchRun=>({id:"RUN-1",trigger:"scheduled",actor:"system",startedAt:"2026-09-21T11:55:00.000Z",completedAt:"2026-09-21T11:55:10.000Z",status:"success",requestedLimit:20,candidates:1,sent:1,failed:0,skipped:0,detail:"ok",...patch});

test("retry recovery preserves historical failures while reopening only the effective retry budget",()=>{
 const policy={criticalSlaMinutes:240,highSlaMinutes:1440,mediumSlaMinutes:4320,maxAttempts:2},old=[failed("D-1",1,"2026-09-21T01:00:00.000Z"),failed("D-2",2,"2026-09-21T02:00:00.000Z")];
 assert.equal(failedAttemptsSinceReset(old,reset).length,0);
 const reopened=summarizeAssuranceDelivery([outbox],old,policy,new Date("2026-09-21T04:00:00.000Z"),[reset]);
 assert.equal(reopened.pending,1);assert.equal(reopened.failed,0);assert.equal(reopened.retryExhausted,0);assert.equal(reopened.failedAttempts30d,2);assert.equal(reopened.retryResetEvents,1);
 const newFailures=[...old,failed("D-3",3,"2026-09-21T03:15:00.000Z"),failed("D-4",4,"2026-09-21T03:45:00.000Z")],exhausted=summarizeAssuranceDelivery([outbox],newFailures,policy,new Date("2026-09-21T04:00:00.000Z"),[reset]);
 assert.equal(exhausted.failed,1);assert.equal(exhausted.retryExhausted,1);assert.equal(exhausted.exhausted[0]?.failedAttempts,2);assert.equal(exhausted.failedAttempts30d,4,"historical failures remain visible in transport metrics");
});

test("retry recovery never reopens a notification that was already transport accepted",()=>{
 const accepted:AssuranceDeliveryRecord={...failed("D-S",1,"2026-09-21T01:00:00.000Z"),state:"sent",detail:"accepted"},summary=summarizeAssuranceDelivery([outbox],[accepted],{criticalSlaMinutes:240,highSlaMinutes:1440,mediumSlaMinutes:4320,maxAttempts:2},new Date("2026-09-21T04:00:00.000Z"),[reset]);
 assert.equal(summary.pending,0);assert.equal(summary.sent,1);assert.equal(summary.retryExhausted,0);
});

test("scheduler health distinguishes healthy degraded stale and unknown heartbeats",()=>{
 const now=new Date("2026-09-21T12:00:00.000Z");
 assert.equal(summarizeAssuranceSchedulerHealth([],now,15).state,"unknown");
 assert.equal(summarizeAssuranceSchedulerHealth([run()],now,15).state,"healthy");
 assert.equal(summarizeAssuranceSchedulerHealth([run({status:"failed"})],now,15).state,"degraded");
 assert.equal(summarizeAssuranceSchedulerHealth([run({startedAt:"2026-09-21T11:20:00.000Z"})],now,15).state,"degraded");
 const stale=summarizeAssuranceSchedulerHealth([run({startedAt:"2026-09-21T10:59:00.000Z"})],now,15);assert.equal(stale.state,"stale");assert.equal(stale.ageMinutes,61);
});

test("recovery is append-only governed and visible across API governance timeline and auditor surfaces",()=>{
 const delivery=readFileSync("app/assurance-notification-delivery.ts","utf8"),route=readFileSync("app/api/continuous-assurance/notifications/route.ts","utf8"),governance=readFileSync("app/assurance-notification-governance.ts","utf8"),timeline=readFileSync("app/api/continuous-assurance/timeline/route.ts","utf8"),pack=readFileSync("app/auditor-assurance-pack.ts","utf8"),packRoute=readFileSync("app/api/continuous-assurance/auditor-pack/route.ts","utf8");
 assert.match(delivery,/continuous_assurance_notification_retry_resets/);assert.match(delivery,/Retry reset reason must be at least 20 characters/);assert.match(delivery,/transport-accepted notification cannot be retry-reset/);assert.match(delivery,/retry budget is not exhausted/);assert.doesNotMatch(delivery,/DELETE FROM continuous_assurance_notification_deliveries/);
 assert.match(route,/action==="reset-retry"/);assert.match(route,/resetAssuranceNotificationRetry/);assert.match(route,/summarizeAssuranceSchedulerHealth/);
 assert.match(governance,/notification-scheduler-stale/);assert.match(governance,/governanceOnly:true/);assert.match(governance,/current retry budget/);
 assert.match(timeline,/notification-retry-reset/);assert.match(timeline,/continuous_assurance_notification_retry_resets/);
 assert.match(packRoute,/schedulerHealth/);assert.match(packRoute,/retryResets/);assert.match(pack,/Retry recovery audit/);assert.match(pack,/schemaVersion:"1\.3"/);
});
