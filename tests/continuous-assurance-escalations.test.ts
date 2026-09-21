import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {daysUntil,exceptionExpirySeverity,riskReviewSeverity} from "../app/assurance-escalations";

const route=readFileSync("app/api/continuous-assurance/escalations/route.ts","utf8");
const panel=readFileSync("app/continuous-assurance-escalation-center.tsx","utf8");
const connected=readFileSync("app/connected-grc.tsx","utf8");

test("exception expiry escalation respects the configured reminder window",()=>{
 assert.equal(daysUntil("2026-09-22","2026-09-21"),1);
 assert.equal(exceptionExpirySeverity("2026-09-22","2026-09-21",15),"critical");
 assert.equal(exceptionExpirySeverity("2026-09-24","2026-09-21",15),"high");
 assert.equal(exceptionExpirySeverity("2026-09-30","2026-09-21",15),"medium");
 assert.equal(exceptionExpirySeverity("2026-11-01","2026-09-21",15),null);
 assert.equal(exceptionExpirySeverity("not-a-date","2026-09-21",15),null);
});

test("risk review escalation maps governance urgency without inventing severity",()=>{
 assert.equal(riskReviewSeverity("due-soon"),"medium");
 assert.equal(riskReviewSeverity("overdue"),"high");
 assert.equal(riskReviewSeverity("critical"),"critical");
 assert.equal(riskReviewSeverity("none"),null);
});

test("escalation API is durable deduplicated policy-aware and condition resolved",()=>{
 assert.match(route,/continuous_assurance_escalations/);assert.match(route,/UNIQUE/);assert.match(route,/ON CONFLICT\(fingerprint\)/);
 assert.match(route,/platform_settings/);assert.match(route,/reminderDays/);assert.match(route,/remindersEnabled/);
 assert.match(route,/risk-review:/);assert.match(route,/exception-expiry:/);assert.match(route,/mandatory-retest/);assert.match(route,/retest-failure/);
 assert.match(route,/system:condition-cleared/);assert.match(route,/status='resolved'/);assert.match(route,/status='acknowledged'/);
 assert.match(route,/requireRole\(req,\["Admin","Editor"\]\)/);assert.match(route,/Acknowledgement notu en az 10 karakter/);
});

test("reminder disablement does not suppress overdue or control-failure governance signals",()=>{
 assert.match(route,/!settings\.remindersEnabled&&aging\.state==="due-soon"/);
 assert.match(route,/if\(settings\.remindersEnabled\)for\(const row of rows\.results\)/);
 assert.match(route,/failed\?"critical":"high"/);
});

test("Connected GRC mounts a role-aware escalation center with acknowledgement lifecycle",()=>{
 assert.match(connected,/import ContinuousAssuranceEscalationCenter/);assert.match(connected,/<ContinuousAssuranceEscalationCenter lang=\{lang\}\/>/);
 assert.match(panel,/ASSURANCE ESCALATION CENTER/);assert.match(panel,/\/api\/continuous-assurance\/escalations/);assert.match(panel,/action:"acknowledge"/);assert.match(panel,/role!=="Viewer"/);
 assert.match(panel,/Critical open/);assert.match(panel,/Resolved in 30d/);assert.match(panel,/Reminder policy/);
});
