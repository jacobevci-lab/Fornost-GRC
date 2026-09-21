import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {buildExecutiveOperationsSummary,buildOwnerAccountability,notificationRoutes,type AssuranceEscalationRecord} from "../app/assurance-executive-operations";

const base=(patch:Partial<AssuranceEscalationRecord>={}):AssuranceEscalationRecord=>({id:"E-1",kind:"risk-review",severity:"high",subject_ref:"R-1",owner:"risk.owner@example.com",title:"Residual risk review overdue",detail:"Review required",status:"active",first_seen_at:"2026-09-01T00:00:00.000Z",last_seen_at:"2026-09-21T00:00:00.000Z",...patch});

test("notification routing is in-app, deduplicable and reminder-aware",()=>{
 assert.deepEqual(notificationRoutes(base({severity:"medium"}),false),[]);
 assert.deepEqual(notificationRoutes(base({severity:"high"}),false),[{route:"in-app-owner",recipient:"risk.owner@example.com",reason:"accountable-owner"}]);
 assert.deepEqual(notificationRoutes(base({severity:"critical"}),false),[
  {route:"in-app-owner",recipient:"risk.owner@example.com",reason:"accountable-owner"},
  {route:"in-app-governance",recipient:"",reason:"critical-governance-escalation"},
 ]);
 assert.deepEqual(notificationRoutes(base({severity:"high",owner:""}),true),[{route:"in-app-governance",recipient:"",reason:"owner-unassigned"}]);
 assert.deepEqual(notificationRoutes(base({status:"acknowledged"}),true),[]);
});

test("owner accountability exposes unassigned work instead of inventing ownership",()=>{
 const rows=[base(),base({id:"E-2",kind:"mandatory-retest",severity:"critical",owner:"",subject_ref:"EX-1"}),base({id:"E-3",owner:"risk.owner@example.com",status:"acknowledged",severity:"critical"})];
 const owners=buildOwnerAccountability(rows,new Date("2026-09-21T12:00:00.000Z"));
 assert.equal(owners[0].owner,"risk.owner@example.com");
 assert.equal(owners[0].open,2);
 const unassigned=owners.find(item=>item.owner==="Unassigned");assert.ok(unassigned);assert.equal(unassigned.assigned,false);assert.equal(unassigned.critical,1);
 const summary=buildExecutiveOperationsSummary(rows,[{status:"queued"}],new Date("2026-09-21T12:00:00.000Z"));
 assert.equal(summary.openEscalations,3);assert.equal(summary.ownerless,1);assert.equal(summary.ownerCoverage,67);assert.equal(summary.queuedNotifications,1);
});

test("durable outbox keeps routing intent separate from external transport",()=>{
 const source=readFileSync("app/assurance-executive-operations.ts","utf8");
 assert.match(source,/continuous_assurance_notification_outbox/);
 assert.match(source,/fingerprint TEXT NOT NULL UNIQUE/);
 assert.match(source,/in-app-owner/);
 assert.match(source,/in-app-governance/);
 assert.match(source,/status='acknowledged'/);
 assert.match(source,/status='cancelled'/);
 assert.doesNotMatch(source,/status='delivered'/);
 assert.doesNotMatch(source,/smtp/i);
});

test("executive API is read-only, role protected and enriches owners from connected lineage",()=>{
 const route=readFileSync("app/api/continuous-assurance/executive/route.ts","utf8");
 const operations=readFileSync("app/assurance-executive-operations.ts","utf8");
 assert.match(route,/requireRole\(req,\["Admin","Editor","Viewer"\]\)/);
 assert.match(route,/enrichAssuranceEscalationOwners/);
 assert.match(route,/source_json/);
 assert.match(route,/syncAssuranceNotificationOutbox/);
 assert.match(route,/summary,routes,owners/);
 assert.match(operations,/ownerCoverage/);
 assert.match(operations,/continuous_assurance_exceptions/);
 assert.match(operations,/enterprise_findings/);
 assert.doesNotMatch(route,/export async function POST/);
});

test("auditor pack is hash-addressed and distinguishes transport acceptance from human reading",()=>{
 const route=readFileSync("app/api/continuous-assurance/auditor-pack/route.ts","utf8");
 const pack=readFileSync("app/auditor-assurance-pack.ts","utf8");
 assert.match(route,/SHA-256/);
 assert.match(route,/snapshotId/);
 assert.match(route,/content-disposition/);
 assert.match(route,/format===\"json\"/);
 assert.match(route,/summarizeAssuranceDelivery/);
 assert.match(pack,/not an independent audit opinion/i);
 assert.match(pack,/transport accepted the message/i);
 assert.match(pack,/does not prove that a human read it/i);
 assert.match(pack,/Owner accountability/);
 assert.match(pack,/Notification \/ routing queue/);
 assert.match(pack,/Notification delivery audit/);
});

test("dashboard executive panel surfaces operations delivery posture and auditor export",()=>{
 const panel=readFileSync("app/executive-assurance-panel.tsx","utf8");
 assert.match(panel,/\/api\/continuous-assurance\/executive/);
 assert.match(panel,/\/api\/continuous-assurance\/notifications/);
 assert.match(panel,/\/api\/continuous-assurance\/auditor-pack/);
 assert.match(panel,/ownerCoverage/);
 assert.match(panel,/overdueRiskReviews/);
 assert.match(panel,/mandatoryRetests/);
 assert.match(panel,/queuedNotifications/);
 assert.match(panel,/slaBreaches/);
 assert.match(panel,/30d transport sent/);
 assert.match(panel,/deliveryRate30d/);
 assert.match(panel,/retryExhausted/);
});
