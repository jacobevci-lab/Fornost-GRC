import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {notificationRetryDelayMinutes} from "../app/assurance-notification-dispatch";
import {buildNotificationGovernanceSignalsFromData} from "../app/assurance-notification-governance";

test("notification retry backoff grows exponentially and caps at six hours",()=>{
 assert.equal(notificationRetryDelayMinutes(0),0);
 assert.equal(notificationRetryDelayMinutes(1),15);
 assert.equal(notificationRetryDelayMinutes(2),30);
 assert.equal(notificationRetryDelayMinutes(3),60);
 assert.equal(notificationRetryDelayMinutes(4),120);
 assert.equal(notificationRetryDelayMinutes(8),360);
});

test("dispatcher uses durable leases and rechecks sent/retry-budget state after lease acquisition",()=>{
 const source=readFileSync("app/assurance-notification-dispatch.ts","utf8");
 assert.match(source,/continuous_assurance_notification_leases/);
 assert.match(source,/lease_token/);
 assert.match(source,/leased_until<=\?/);
 assert.match(source,/liveHistory\(db,item\.id\)/);
 assert.match(source,/liveRetryReset\(db,item\.id\)/);
 assert.match(source,/!history\.some\(x=>x\.state===?"sent"\)/);
 assert.match(source,/failedAttemptsSinceReset\(history,reset\)\.length<maxAttempts/);
 assert.match(source,/continuous_assurance_notification_retry_resets/);
 assert.match(source,/continuous_assurance_notification_dispatch_runs/);
 assert.match(source,/trigger:"scheduled"|AssuranceDispatchTrigger/);
});

test("worker schedules the same assurance runtime every fifteen minutes",()=>{
 const worker=readFileSync("worker/index.ts","utf8"),vite=readFileSync("vite.config.ts","utf8"),runtime=readFileSync("app/assurance-scheduled-runtime.ts","utf8");
 assert.match(worker,/async scheduled\(/);
 assert.match(worker,/runScheduledAssuranceOperations/);
 assert.match(worker,/ctx\.waitUntil/);
 assert.match(vite,/\*\/15 \* \* \* \*/);
 assert.match(runtime,/reconcileAssuranceEscalations/);
 assert.match(runtime,/syncAssuranceNotificationOutbox/);
 assert.match(runtime,/dispatchAssuranceNotifications/);
 assert.match(runtime,/system:scheduled-dispatch/);
 assert.match(runtime,/const second=await reconcileAssuranceEscalations/);
});

test("transport failures create governance-only signals and cannot recursively email themselves",()=>{
 const policy={criticalSlaMinutes:60,highSlaMinutes:240,mediumSlaMinutes:1440,maxAttempts:2},now=new Date("2026-09-21T20:00:00.000Z"),outbox=[{id:"O-1",escalation_id:"E-1",recipient:"owner@example.com",route:"in-app-owner",severity:"critical",status:"queued",subject:"Critical assurance issue",body:"Action required",reason:"accountable-owner",created_at:"2026-09-21T17:00:00.000Z",updated_at:"2026-09-21T17:00:00.000Z"}],deliveries=[{id:"D-1",outbox_id:"O-1",attempt:1,provider:"email-api",state:"failed",detail:"HTTP 500",recipient:"owner@example.com",attempted_by:"system",attempted_at:"2026-09-21T18:00:00.000Z"},{id:"D-2",outbox_id:"O-1",attempt:2,provider:"email-api",state:"failed",detail:"HTTP 500",recipient:"owner@example.com",attempted_by:"system",attempted_at:"2026-09-21T19:00:00.000Z"}];
 const signals=buildNotificationGovernanceSignalsFromData(outbox,deliveries,policy,true,now);
 const exhausted=signals.find(item=>item.kind==="notification-delivery-exhausted");assert.ok(exhausted);assert.equal(exhausted.owner,"");assert.equal(exhausted.source.governanceOnly,true);assert.equal(exhausted.severity,"critical");
});

test("notification and escalation APIs share runtime services instead of transport/reconcile copies",()=>{
 const notificationRoute=readFileSync("app/api/continuous-assurance/notifications/route.ts","utf8"),escalationRoute=readFileSync("app/api/continuous-assurance/escalations/route.ts","utf8"),settings=readFileSync("app/assurance-notification-settings.tsx","utf8");
 assert.match(notificationRoute,/dispatchAssuranceNotifications/);
 assert.match(notificationRoute,/readAssuranceNotificationDispatchRuns/);
 assert.doesNotMatch(notificationRoute,/deliverConfiguredEmail/);
 assert.match(notificationRoute,/cadenceMinutes:15/);
 assert.match(escalationRoute,/reconcileAssuranceEscalations/);
 assert.doesNotMatch(escalationRoute,/riskReviewEscalation/);
 assert.match(settings,/AUTOMATED DISPATCH/);
 assert.match(settings,/DISPATCH RUN AUDIT/);
 assert.match(settings,/dispatchRuns/);
});

test("reactivated escalation clears stale acknowledgement metadata",()=>{
 const store=readFileSync("app/assurance-escalation-store.ts","utf8");
 assert.match(store,/acknowledged_by=CASE WHEN continuous_assurance_escalations\.status='resolved' THEN NULL/);
 assert.match(store,/acknowledged_at=CASE WHEN continuous_assurance_escalations\.status='resolved' THEN NULL/);
 assert.match(store,/ack_note=CASE WHEN continuous_assurance_escalations\.status='resolved' THEN NULL/);
});
