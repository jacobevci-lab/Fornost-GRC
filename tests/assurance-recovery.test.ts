import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAssuranceRecovery } from "../app/assurance-recovery";

const digest = "a".repeat(64);

test("re-test stays blocked until remediation and closure evidence are verified", () => {
  const result = evaluateAssuranceRecovery({
    assuranceState: "ineffective",
    remediationStatus: "in-progress",
    riskLinked: true,
  });
  assert.equal(result.recoveryState, "blocked");
  assert.equal(result.readyForRetest, false);
  assert.deepEqual(result.nextActions, ["verify-remediation", "attach-verified-closure-evidence"]);
});

test("verified remediation with immutable closure evidence becomes ready for re-test", () => {
  const result = evaluateAssuranceRecovery({
    assuranceState: "ineffective",
    remediationStatus: "verified",
    closureEvidenceRef: "EVD-2026-101",
    closureEvidenceSha256: digest,
  });
  assert.equal(result.recoveryState, "ready-for-retest");
  assert.equal(result.readyForRetest, true);
  assert.deepEqual(result.nextActions, ["run-control-retest"]);
});

test("failed re-test reopens remediation and escalates a linked risk", () => {
  const result = evaluateAssuranceRecovery({
    assuranceState: "degraded",
    remediationStatus: "closed",
    closureEvidenceRef: "EVD-2026-102",
    closureEvidenceSha256: digest,
    retestResult: "fail",
    retestEvidenceFreshness: "fresh",
    riskLinked: true,
  });
  assert.equal(result.recoveryState, "retest-failed");
  assert.equal(result.resultingAssuranceState, "ineffective");
  assert.equal(result.resultingAssuranceScore, 25);
  assert.equal(result.findingAction, "reopen");
  assert.equal(result.riskAction, "reassess-and-escalate");
});

test("successful re-test cannot recover assurance with stale evidence", () => {
  const result = evaluateAssuranceRecovery({
    assuranceState: "ineffective",
    remediationStatus: "completed",
    closureEvidenceRef: "EVD-2026-103",
    closureEvidenceSha256: digest,
    retestResult: "pass",
    retestEvidenceFreshness: "stale",
    riskLinked: true,
  });
  assert.equal(result.recoveryState, "evidence-degraded");
  assert.equal(result.resultingAssuranceState, "degraded");
  assert.equal(result.resultingAssuranceScore, 65);
  assert.equal(result.findingAction, "keep-open");
  assert.equal(result.riskAction, "none");
});

test("expiring evidence stays degraded and cannot close the assurance loop", () => {
  const result = evaluateAssuranceRecovery({
    assuranceState: "degraded",
    remediationStatus: "verified",
    closureEvidenceRef: "EVD-2026-103B",
    closureEvidenceSha256: digest,
    retestResult: "pass",
    retestEvidenceFreshness: "expiring",
    riskLinked: true,
  });
  assert.equal(result.recoveryState, "evidence-degraded");
  assert.equal(result.resultingAssuranceState, "degraded");
  assert.equal(result.findingAction, "keep-open");
});

test("fresh successful re-test restores assurance and triggers risk reassessment", () => {
  const result = evaluateAssuranceRecovery({
    assuranceState: "ineffective",
    remediationStatus: "verified",
    closureEvidenceRef: "EVD-2026-104",
    closureEvidenceSha256: digest,
    retestResult: "pass",
    retestEvidenceFreshness: "fresh",
    riskLinked: true,
  });
  assert.equal(result.recoveryState, "recovered");
  assert.equal(result.resultingAssuranceState, "effective");
  assert.equal(result.resultingAssuranceScore, 100);
  assert.equal(result.findingAction, "eligible-for-closure");
  assert.equal(result.riskAction, "reassess");
  assert.deepEqual(result.nextActions, ["reassess-linked-risk"]);
});
