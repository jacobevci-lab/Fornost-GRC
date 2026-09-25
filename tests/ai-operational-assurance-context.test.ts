import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import { inferReadModules } from "../app/ai/context";
import { targetControlRefFromDecision } from "../app/continuous-assurance-store";

const operational=readFileSync("app/ai/operational-assurance-context.ts","utf8");
const aiContext=readFileSync("app/ai/context.ts","utf8");

test("Ask Fornost routes Continuous Assurance questions to operational evidence context", () => {
  const modules = inferReadModules("Which continuous assurance controls have stale evidence or failed retests?");
  assert.ok(modules.includes("Kanıt Otomasyonu"));
  assert.ok(modules.includes("Kontroller"));
});

test("Ask Fornost routes governance exception and escalation language to operational assurance",()=>{
 const english=inferReadModules("Show active assurance exceptions, expiring waivers, mandatory retests and critical escalations");
 assert.ok(english.includes("Kanıt Otomasyonu"));
 const turkish=inferReadModules("Süresi yaklaşan istisnaları, residual risk review ve eskalasyonları göster");
 assert.ok(turkish.includes("Kanıt Otomasyonu"));
 assert.match(aiContext,/"assurance exception"/);assert.match(aiContext,/"waiver"/);assert.match(aiContext,/"residual risk review"/);assert.match(aiContext,/"escalation"/);
});

test("operational AI context reads bounded governance queues without assuming every schema generation",()=>{
 assert.match(operational,/continuous_assurance_risk_reviews/);
 assert.match(operational,/continuous_assurance_exceptions/);
 assert.match(operational,/continuous_assurance_escalations/);
 assert.match(operational,/async function safeRows/);
 assert.match(operational,/async function exceptionRows/);
 assert.match(operational,/Omit<ExceptionRow,"retest_required">/);
 assert.match(operational,/CA-GOVERNANCE-SUMMARY/);
 assert.match(operational,/pendingRiskReviews/);
 assert.match(operational,/mandatoryRetests/);
 assert.match(operational,/criticalEscalations/);
});

test("governance-only state remains available to Ask Fornost even without control snapshots",()=>{
 assert.match(operational,/snapshotAvailable=Boolean/);
 assert.match(operational,/governanceAvailable=Object\.values\(governance\)\.some/);
 assert.match(operational,/if\(!snapshotAvailable&&!governanceAvailable\)/);
 assert.doesNotMatch(operational,/if \(!snapshots\.rules\.length && !snapshots\.findings\.length && !snapshots\.workItems\.length\)/);
});

test("Ask Fornost routes CAPA remediation questions to Findings and CAPA", () => {
  const modules = inferReadModules("Hangi CAPA düzeltmeleri gecikmiş ve hangi bulgular yeniden test bekliyor?");
  assert.ok(modules.includes("Bulgular ve CAPA"));
  assert.ok(modules.includes("Kanıt Otomasyonu"));
});

test("audit questions do not automatically misclassify findings as audit management", () => {
  const findingModules = inferReadModules("Show open findings and corrective actions");
  assert.ok(findingModules.includes("Bulgular ve CAPA"));
  assert.ok(!findingModules.includes("Denetim Yönetimi"));
  const auditModules = inferReadModules("Show the latest audit and auditor records");
  assert.ok(auditModules.includes("Denetim Yönetimi"));
});

test("governed target control parsing prefers candidate payload lineage", () => {
  assert.equal(targetControlRefFromDecision(JSON.stringify({
    candidate: { payload: { controlRef: "A.5.17" }, lineage: { controlRef: "A.5.16" } },
    targetControlRef: "A.5.15",
  })), "A.5.17");
});

test("governed target control parsing supports lineage and legacy explicit fallback", () => {
  assert.equal(targetControlRefFromDecision(JSON.stringify({ candidate: { lineage: { controlRef: "CC6.1" } } })), "CC6.1");
  assert.equal(targetControlRefFromDecision(JSON.stringify({ targetControlRef: "PCI-8.4.2" })), "PCI-8.4.2");
  assert.equal(targetControlRefFromDecision("not-json"), "");
});
