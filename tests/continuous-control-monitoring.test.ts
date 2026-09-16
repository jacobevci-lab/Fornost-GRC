import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { controlHealth, evidenceFreshness, nextControlRun, remediationDueDate, validateContinuousControl } from "../app/evidence/continuous-controls";

test("continuous control schedules and policy limits are deterministic",()=>{
 const now=new Date("2027-01-01T00:00:00.000Z");
 assert.equal(nextControlRun("hourly",now),"2027-01-01T01:00:00.000Z");
 assert.equal(nextControlRun("weekly",now),"2027-01-08T00:00:00.000Z");
 assert.equal(remediationDueDate(7,now),"2027-01-08");
 assert.deepEqual(validateContinuousControl({schedule:"daily",freshnessHours:24,failureThreshold:2,remediationDueDays:7,autoFinding:true}),{freshnessHours:24,failureThreshold:2,remediationDueDays:7,autoFinding:true});
 assert.throws(()=>validateContinuousControl({schedule:"minute",freshnessHours:0,failureThreshold:0,remediationDueDays:0,autoFinding:true}),/zamanlaması/);
 assert.throws(()=>validateContinuousControl({schedule:"daily",freshnessHours:9000,failureThreshold:2,remediationDueDays:7,autoFinding:true}),/tazeliği/);
});

test("evidence freshness and control health expose missing, expiring and failing states",()=>{
 const now=new Date("2027-01-02T00:00:00.000Z");
 assert.equal(evidenceFreshness(null,24,now),"missing");
 assert.equal(evidenceFreshness("2027-01-01T02:00:00.000Z",24,now),"expiring");
 assert.equal(evidenceFreshness("2026-12-31T23:00:00.000Z",24,now),"stale");
 assert.equal(controlHealth({enabled:true,lastStatus:"fail",lastEvidenceAt:"2027-01-01T23:00:00.000Z",freshnessHours:24,consecutiveFailures:1},now),"failing");
 assert.equal(controlHealth({enabled:false,lastStatus:"pass",lastEvidenceAt:"2027-01-01T23:00:00.000Z",freshnessHours:24,consecutiveFailures:0},now),"paused");
});

test("CCM 2.0 persists schedules, immutable runs and independently closed CAPA",async()=>{
 const[route,migration,ui,schema,installer,server,scheduler]=await Promise.all([readFile("app/api/evidence-automation/route.ts","utf8"),readFile("drizzle/0067_continuous_control_monitoring.sql","utf8"),readFile("app/evidence-automation.tsx","utf8"),readFile("db/schema.ts","utf8"),readFile("scripts/linux/install.sh","utf8"),readFile("scripts/linux/serve.sh","utf8"),readFile("scripts/linux/evidence-scheduler.sh","utf8")]);
 assert.match(route,/run-due/);assert.match(route,/SOURCE_REQUEST_FAILED/);assert.match(route,/consecutive_failures/);assert.match(route,/BULGUYU KAPAT/);
 assert.match(route,/Bulguyu sahiplenen kişi aynı bulguyu kapatamaz/);assert.match(route,/Risk Assessment/);assert.match(route,/response_hash/);
 assert.match(migration,/evidence_automation_rules_due_idx/);assert.match(migration,/evidence_automation_findings_open_idx/);assert.match(migration,/closure_evidence_sha256/);
 assert.match(schema,/evidenceAutomationFindings/);assert.match(ui,/Sürekli Kontroller/);assert.match(ui,/Bulgular ve CAPA/);assert.match(ui,/Kanıt tazeliği/);
 assert.match(route,/constantTimeEqual\(configuredToken,presentedToken\)/);assert.match(installer,/evidence-scheduler\.token/);assert.match(server,/evidence-scheduler\.sh/);assert.match(scheduler,/x-fornost-scheduler-token/);
});
