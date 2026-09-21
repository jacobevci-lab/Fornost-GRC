import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {defaultAssuranceNotificationPolicy,summarizeAssuranceDelivery,type AssuranceDeliveryOutbox,type AssuranceDeliveryRecord} from "../app/assurance-notification-delivery";

const outbox=(patch:Partial<AssuranceDeliveryOutbox>={}):AssuranceDeliveryOutbox=>({id:"O-1",escalation_id:"E-1",recipient:"owner@example.com",route:"in-app-owner",subject:"Critical control failure",body:"Follow up required",severity:"critical",status:"queued",reason:"accountable-owner",created_at:"2026-09-21T00:00:00.000Z",updated_at:"2026-09-21T00:00:00.000Z",...patch});
const delivery=(patch:Partial<AssuranceDeliveryRecord>={}):AssuranceDeliveryRecord=>({id:"D-1",outbox_id:"O-1",attempt:1,provider:"microsoft-graph-mail",state:"sent",detail:"transport accepted",recipient:"owner@example.com",attempted_by:"admin@example.com",attempted_at:"2026-09-21T01:00:00.000Z",...patch});

test("delivery posture separates open queue from 30-day transport history",()=>{
 const now=new Date("2026-09-21T08:00:00.000Z"),pending=outbox(),inApp=outbox({id:"O-2",recipient:"",route:"in-app-governance",severity:"high"});
 const first=summarizeAssuranceDelivery([pending,inApp],[],defaultAssuranceNotificationPolicy,now);
 assert.equal(first.pending,1);assert.equal(first.sent30d,0);assert.equal(first.inAppOnly,1);assert.equal(first.slaBreaches,1);assert.equal(first.deliveryRate30d,100);
 const accepted=summarizeAssuranceDelivery([pending,inApp],[delivery()],defaultAssuranceNotificationPolicy,now);
 assert.equal(accepted.pending,0);assert.equal(accepted.sent,1);assert.equal(accepted.sent30d,1);assert.equal(accepted.attempts30d,1);assert.equal(accepted.deliveryRate30d,100);assert.equal(accepted.slaBreaches,0);
 const acknowledged=summarizeAssuranceDelivery([pending,{...inApp,id:"O-3",recipient:"other@example.com",status:"acknowledged"}],[delivery({outbox_id:"O-3",attempted_at:"2026-09-20T01:00:00.000Z"})],defaultAssuranceNotificationPolicy,now);
 assert.equal(acknowledged.sent30d,1,"historical provider acceptance remains visible after routing lifecycle closes");
});

test("failed attempts remain pending and retry exhaustion is explicit",()=>{
 const p={...defaultAssuranceNotificationPolicy,maxAttempts:2},row=outbox({severity:"high"}),attempts=[delivery({id:"D-1",state:"failed",provider:"smtp-bridge",detail:"HTTP 502",attempt:1}),delivery({id:"D-2",state:"failed",provider:"smtp-bridge",detail:"HTTP 502",attempt:2})];
 const result=summarizeAssuranceDelivery([row],attempts,p,new Date("2026-09-21T02:00:00.000Z"));
 assert.equal(result.pending,1);assert.equal(result.failed,1);assert.equal(result.retryExhausted,1);assert.equal(result.sent,0);assert.equal(result.failedAttempts30d,2);assert.equal(result.deliveryRate30d,0);
});

test("dispatcher uses configured secure email integrations and only claims sent on transport success",()=>{
 const transport=readFileSync("app/api/integrations/email-transport.ts","utf8");
 assert.match(transport,/microsoft-graph-mail/);assert.match(transport,/smtp-bridge/);assert.match(transport,/email-api/);
 assert.match(transport,/decryptSecret/);assert.match(transport,/safeHttpUrl/);assert.match(transport,/AbortSignal\.timeout\(8_000\)/);
 assert.match(transport,/if\(!response\.ok\)return\{sent:false,state:"failed"/);
 assert.match(transport,/return\{sent:true,state:"sent"/);
 assert.doesNotMatch(transport,/console\.log/);
});

test("notification dispatcher is Admin-only for policy and delivery while posture remains readable",()=>{
 const route=readFileSync("app/api/continuous-assurance/notifications/route.ts","utf8"),dispatcher=readFileSync("app/assurance-notification-dispatch.ts","utf8");
 assert.match(route,/GET\(req:NextRequest\)[\s\S]*requireRole\(req,\["Admin","Editor","Viewer"\]\)/);
 assert.match(route,/PUT\(req:NextRequest\)[\s\S]*requireRole\(req,\["Admin"\]\)/);
 assert.match(route,/POST\(req:NextRequest\)[\s\S]*requireRole\(req,\["Admin"\]\)/);
 assert.match(route,/action!=="dispatch"/);assert.match(route,/maxAttempts/);assert.match(route,/dispatchAssuranceNotifications/);assert.match(route,/Etkin e-posta entegrasyonu bulunamadı/);
 assert.doesNotMatch(route,/deliverConfiguredEmail/);
 assert.match(dispatcher,/state==="sent"/);assert.match(dispatcher,/maxAttempts/);assert.match(dispatcher,/continuous_assurance_notification_deliveries/);assert.match(dispatcher,/deliverConfiguredEmail/);
});

test("SLA policy is ordered, auditable and included in delivery governance",()=>{
 const runtime=readFileSync("app/assurance-notification-delivery.ts","utf8"),route=readFileSync("app/api/continuous-assurance/notifications/route.ts","utf8"),packRoute=readFileSync("app/api/continuous-assurance/auditor-pack/route.ts","utf8"),pack=readFileSync("app/auditor-assurance-pack.ts","utf8");
 assert.deepEqual(defaultAssuranceNotificationPolicy,{criticalSlaMinutes:240,highSlaMinutes:1440,mediumSlaMinutes:4320,maxAttempts:3});
 assert.match(runtime,/continuous_assurance_notification_deliveries/);assert.match(runtime,/continuous_assurance_notification_policy_events/);assert.match(runtime,/deliveryRate30d/);assert.match(runtime,/retryExhausted/);
 assert.match(route,/criticalSlaMinutes<=next\.highSlaMinutes/);assert.match(route,/highSlaMinutes<=next\.mediumSlaMinutes/);assert.match(route,/before_json/);assert.match(route,/after_json/);assert.match(route,/attempted_by/);assert.match(route,/attempted_at/);
 assert.match(packRoute,/readAssuranceNotificationPolicyEvents/);assert.match(pack,/Notification policy audit/);assert.match(pack,/schemaVersion:"1\.2"/);
});

test("Email & Notifications exposes the enterprise assurance dispatch console",()=>{
 const integration=readFileSync("app/integration-settings.tsx","utf8"),consoleUi=readFileSync("app/assurance-notification-settings.tsx","utf8"),css=readFileSync("app/assurance-notification-settings.css","utf8");
 assert.match(integration,/AssuranceNotificationSettings/);assert.match(integration,/kind===?"email"/);
 assert.match(consoleUi,/CONTINUOUS ASSURANCE NOTIFICATIONS/);assert.match(consoleUi,/Dispatch Pending/);assert.match(consoleUi,/SLA BREACH REGISTER/);assert.match(consoleUi,/DELIVERY AUDIT TRAIL/);assert.match(consoleUi,/Policy Kaydet/);assert.match(consoleUi,/retryExhausted/);assert.match(css,/assurance-notification-console/);
});
