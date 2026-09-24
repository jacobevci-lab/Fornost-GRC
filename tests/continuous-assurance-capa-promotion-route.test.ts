import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildContinuousAssuranceCapaCandidate } from "../app/continuous-assurance-capa";

test("promotion route hydrates trusted automation lineage server-side before creating enterprise CAPA", async () => {
  const route = await readFile("app/api/findings/promote-continuous-assurance/route.ts", "utf8");
  assert.match(route, /evidence_automation_findings WHERE id=\?/);
  assert.match(route, /evidence_automation_rules WHERE id=\?/);
  assert.match(route, /evidence_automation_runs WHERE rule_id=\? AND evidence_id=\?/);
  assert.match(route, /response_hash IS NOT NULL/);
  assert.match(route, /buildContinuousAssuranceCapaCandidate/);
  assert.match(route, /source_type='continuous-control'/);
  assert.match(route, /status NOT IN \('closed','accepted'\)/);
  assert.match(route, /finding-promote-continuous-assurance/);
  assert.match(route, /env\.DB\.batch/);
  assert.match(route, /status=CASE WHEN status='open' THEN 'acknowledged'/);
});

test("canonical promotion keeps rule control risk and immutable evidence references distinct", () => {
  const candidate = buildContinuousAssuranceCapaCandidate({
    findingId: "AUTO-F-77",
    ruleId: "RULE-MFA-1",
    ruleName: "Privileged MFA coverage",
    title: "Privileged MFA coverage below threshold",
    detail: "Automated evaluation detected privileged accounts outside the enforced MFA scope.",
    severity: "critical",
    owner: "control.owner@example.com",
    reviewer: "reviewer@example.com",
    dueDate: "2026-10-01",
    controlRef: "CTL-IAM-01",
    riskRef: "RSK-IAM-01",
    rootCause: "Legacy privileged identities were excluded from the policy scope during migration.",
    correctiveAction: "Move all privileged identities into the enforced MFA policy and verify effective coverage.",
    preventiveAction: "Continuously reconcile privileged identity inventory against enforced MFA policy scope.",
    originEvidenceReference: "EVD-AUTO-77",
    originEvidenceSha256: "7".repeat(64),
  }, "2026-09-24");
  assert.equal(candidate.eligible, true);
  assert.equal(candidate.payload?.sourceType, "continuous-control");
  assert.equal(candidate.payload?.sourceRef, "RULE-MFA-1");
  assert.equal(candidate.payload?.controlRef, "CTL-IAM-01");
  assert.equal(candidate.payload?.riskRef, "RSK-IAM-01");
  assert.equal(candidate.lineage.automationFindingRef, "AUTO-F-77");
  assert.equal(candidate.lineage.originEvidenceReference, "EVD-AUTO-77");
  assert.equal(candidate.lineage.originEvidenceSha256, "7".repeat(64));
});
