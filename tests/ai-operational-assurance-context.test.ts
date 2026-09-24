import assert from "node:assert/strict";
import test from "node:test";
import { inferReadModules } from "../app/ai/context";
import { targetControlRefFromDecision } from "../app/continuous-assurance-store";

test("Ask Fornost routes Continuous Assurance questions to operational evidence context", () => {
  const modules = inferReadModules("Which continuous assurance controls have stale evidence or failed retests?");
  assert.ok(modules.includes("Kanıt Otomasyonu"));
  assert.ok(modules.includes("Kontroller"));
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
