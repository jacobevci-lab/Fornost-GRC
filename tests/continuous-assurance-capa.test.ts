import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContinuousAssuranceCapaCandidate,
  resolveContinuousAssuranceTargetControl,
  splitContinuousAssuranceControlRefs,
} from "../app/continuous-assurance-capa";

const base = {
  findingId: "CCM-FINDING-1",
  ruleId: "RULE-1",
  ruleName: "MFA coverage continuous validation",
  title: "MFA coverage below required threshold",
  detail: "Continuous evidence shows that privileged MFA coverage remains below the approved control threshold.",
  severity: "high",
  owner: "control.owner@example.com",
  reviewer: "security.reviewer@example.com",
  dueDate: "2026-10-15",
  controlRef: "CTL-001",
  riskRef: "RSK-001",
  rootCause: "Legacy privileged accounts are outside the enforced conditional access scope.",
  correctiveAction: "Move all privileged identities into the enforced MFA policy scope and verify coverage.",
  preventiveAction: "Add continuous privileged identity coverage monitoring and monthly exception review.",
  originEvidenceReference: "EVD-AUTO-1",
  originEvidenceSha256: "b".repeat(64),
};

test("continuous assurance finding becomes a canonical control-deficiency while preserving automation lineage", () => {
  const result = buildContinuousAssuranceCapaCandidate(base, "2026-09-21");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.payload?.sourceType, "continuous-control");
  assert.equal(result.payload?.sourceRef, "RULE-1");
  assert.equal(result.payload?.findingType, "control-deficiency");
  assert.equal(result.payload?.controlRef, "CTL-001");
  assert.equal(result.payload?.riskRef, "RSK-001");
  assert.equal(result.lineage.automationFindingRef, "CCM-FINDING-1");
  assert.equal(result.lineage.automationRuleRef, "RULE-1");
  assert.equal(result.lineage.originEvidenceReference, "EVD-AUTO-1");
});

test("promotion is blocked when control risk and immutable origin evidence lineage are missing", () => {
  const result = buildContinuousAssuranceCapaCandidate({
    ...base,
    controlRef: "",
    riskRef: "",
    originEvidenceReference: "",
    originEvidenceSha256: "bad",
  }, "2026-09-21");
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("control-link-required"));
  assert.ok(result.reasons.includes("risk-link-required"));
  assert.ok(result.reasons.includes("origin-evidence-integrity-required"));
});

test("promotion enforces maker-checker separation", () => {
  const result = buildContinuousAssuranceCapaCandidate({
    ...base,
    reviewer: base.owner,
  }, "2026-09-21");
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("maker-checker-separation-required"));
});

test("promotion reuses canonical finding SLA validation", () => {
  const result = buildContinuousAssuranceCapaCandidate({
    ...base,
    dueDate: "2027-03-01",
  }, "2026-09-21");
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => reason.includes("30 gün")));
});

test("single mapped control is resolved automatically", () => {
  const result = resolveContinuousAssuranceTargetControl("CTL-001", "");
  assert.equal(result.ok, true);
  assert.equal(result.controlRef, "CTL-001");
  assert.deepEqual(result.availableControlRefs, ["CTL-001"]);
});

test("multi-control assurance rule requires an explicit target control", () => {
  const result = resolveContinuousAssuranceTargetControl("CTL-001, CTL-002", "");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "target-control-required");
  assert.deepEqual(result.availableControlRefs, ["CTL-001", "CTL-002"]);
});

test("explicit target control must belong to the assurance rule mapping", () => {
  const accepted = resolveContinuousAssuranceTargetControl("CTL-001; CTL-002", "ctl-002");
  assert.equal(accepted.ok, true);
  assert.equal(accepted.controlRef, "CTL-002");

  const rejected = resolveContinuousAssuranceTargetControl("CTL-001; CTL-002", "CTL-999");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "target-control-not-mapped");
});

test("mapped control parser supports all accepted separators and removes case-insensitive duplicates", () => {
  assert.deepEqual(
    splitContinuousAssuranceControlRefs("CTL-001, ctl-001; CTL-002|CTL-003\nCTL-004"),
    ["CTL-001", "CTL-002", "CTL-003", "CTL-004"],
  );
});
