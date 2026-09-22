import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {activeStormDeferrals,defaultAssuranceNotificationStormPolicy,deriveRecipientStormDecision,stormLimitForSeverity,type AssuranceNotificationDeferral} from "../app/assurance-notification-storm";

const policy={windowMinutes:60,highMaxPerRecipient:6,mediumMaxPerRecipient:3};
const now=new Date("2026-09-21T12:00:00.000Z");
const sent=(...minutes:number[])=>minutes.map(min=>new Date(now.getTime()-min*60_000).toISOString());

test("storm policy is severity aware and critical notifications always bypass recipient throttling",()=>{
 assert.deepEqual(defaultAssuranceNotificationStormPolicy,policy);
 assert.equal(stormLimitForSeverity("critical",policy),Number.POSITIVE_INFINITY);
 assert.equal(stormLimitForSeverity("high",policy),6);
 assert.equal(stormLimitForSeverity("medium",policy),3);
 const critical=deriveRecipientStormDecision(sent(5,10,15,20,25,30,35,40,45,50),"critical",policy,now);assert.equal(critical.allowed,true);assert.equal(critical.nextEligibleAt,"");
});

test("high and medium budgets defer without losing the notification and compute deterministic re-eligibility",()=>{
 assert.equal(deriveRecipientStormDecision(sent(10,20,30,40,50),"high",policy,now).allowed,true);
 const high=deriveRecipientStormDecision(sent(10,20,30,40,50,55),"high",policy,now);assert.equal(high.allowed,false);assert.equal(high.count,6);assert.equal(high.limit,6);assert.equal(high.nextEligibleAt,"2026-09-21T12:05:00.000Z");
 assert.equal(deriveRecipientStormDecision(sent(10,20),"medium",policy,now).allowed,true);
 const medium=deriveRecipientStormDecision(sent(10,20,50),"medium",policy,now);assert.equal(medium.allowed,false);assert.equal(medium.count,3);assert.equal(medium.limit,3);assert.equal(medium.nextEligibleAt,"2026-09-21T12:10:00.000Z");
});

test("rolling storm window ignores old or future transport acceptances",()=>{
 const decision=deriveRecipientStormDecision([new Date(now.getTime()-61*60_000).toISOString(),new Date(now.getTime()+5*60_000).toISOString(),...sent(10,20)],"medium",policy,now);assert.equal(decision.allowed,true);assert.equal(decision.count,2);
});

test("only uncleared future deferrals contribute to current storm pressure",()=>{
 const row=(id:string,next:string,cleared_at:string|null=null):AssuranceNotificationDeferral=>({outbox_id:id,recipient:"owner@example.com",severity:"high",reason:"recipient-rate-limit",first_deferred_at:"2026-09-21T11:30:00.000Z",last_deferred_at:"2026-09-21T11:45:00.000Z",defer_count:2,next_eligible_at:next,cleared_at});
 const active=activeStormDeferrals([row("A","2026-09-21T12:15:00.000Z"),row("B","2026-09-21T11:59:00.000Z"),row("C","2026-09-21T12:30:00.000Z","2026-09-21T11:55:00.000Z")],now);assert.deepEqual(active.map(item=>item.outbox_id),["A"]);
});

test("dispatcher enforces recipient lease before transport and records deferral instead of delivery failure",()=>{
 const dispatcher=readFileSync("app/assurance-notification-dispatch.ts","utf8"),storm=readFileSync("app/assurance-notification-storm.ts","utf8");
 assert.match(dispatcher,/continuous_assurance_notification_recipient_leases/);assert.match(dispatcher,/if\(item\.severity!=="critical"\)/);assert.match(dispatcher,/acquireAssuranceRecipientLease/);assert.match(dispatcher,/recipientStormDecision/);assert.match(dispatcher,/recordAssuranceStormDeferral/);assert.match(dispatcher,/clearAssuranceStormDeferral/);assert.match(dispatcher,/stormDeferred/);
 assert.match(storm,/continuous_assurance_notification_deferrals/);assert.match(storm,/continuous_assurance_notification_storm_policy_events/);assert.match(storm,/recipient-rate-limit/);assert.doesNotMatch(storm,/DELETE FROM continuous_assurance_notification_deliveries/);
});

test("storm policy is Admin governed visible in Email settings and produces governance-only pressure signals",()=>{
 const route=readFileSync("app/api/continuous-assurance/notifications/route.ts","utf8"),integration=readFileSync("app/integration-settings.tsx","utf8"),panel=readFileSync("app/assurance-notification-storm-settings.tsx","utf8"),governance=readFileSync("app/assurance-notification-governance.ts","utf8");
 assert.match(route,/PUT\(req:NextRequest\)[\s\S]*requireRole\(req,\["Admin"\]\)/);assert.match(route,/section==="storm"/);assert.match(route,/saveAssuranceNotificationStormPolicy/);assert.match(route,/activeDeferrals/);assert.match(route,/policyEvents/);
 assert.match(integration,/AssuranceNotificationStormSettings/);assert.match(panel,/NOTIFICATION STORM CONTROL/);assert.match(panel,/ACTIVE DEFERRALS/);assert.match(panel,/Critical/);assert.match(panel,/section:"storm"/);
 assert.match(governance,/notification-storm-pressure/);assert.match(governance,/governanceOnly:true/);assert.match(governance,/highSeverityDeferred/);
});
