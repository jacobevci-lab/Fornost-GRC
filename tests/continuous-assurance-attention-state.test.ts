import test from "node:test";
import assert from "node:assert/strict";
import {
  capaGovernanceState,
  capaTraceabilityIntegrity,
  capaTraceabilityState,
  retestAttentionState,
  selectCapaWorkItem,
  selectRetestWorkItem,
  type CapaWorkItem,
  type EnterpriseFindingSnapshot,
  type RecoveryDecisionSnapshot,
} from "../app/continuous-assurance-attention-state";

const work = (overrides: Partial<CapaWorkItem> = {}): CapaWorkItem => ({
  id: "CAW-1",
  findingId: "CCM-1",
  ruleId: "CCR-1",
  action: "capa-promotion",
  status: "pending-review",
  createdAt: "2026-09-30T07:00:00.000Z",
  updatedAt: "2026-09-30T07:00:00.000Z",
  ...overrides,
});

const enterpriseFinding = (overrides: Partial<EnterpriseFindingSnapshot> = {}): EnterpriseFindingSnapshot => ({
  id: "FND-1",
  code: "FND-2026-ABCDEF12",
  status: "open",
  recurrenceCount: 0,
  ...overrides,
});

const recovery = (overrides: Partial<RecoveryDecisionSnapshot> = {}): RecoveryDecisionSnapshot => ({
  recoveryState: "ready-for-retest",
  readyForRetest: true,
  nextActions: ["run-control-retest"],
  ...overrides,
});

test("attention selects the newest CAPA promotion work item for a technical finding", () => {
  const items = [
    work({ id: "old", status: "rejected", updatedAt: "2026-09-29T07:00:00.000Z" }),
    work({ id: "new", status: "pending-review", updatedAt: "2026-09-30T07:00:00.000Z" }),
    work({ id: "retest", action: "control-retest", updatedAt: "2026-10-01T07:00:00.000Z" }),
    work({ id: "other", findingId: "CCM-2", updatedAt: "2026-10-02T07:00:00.000Z" }),
  ];
  assert.equal(selectCapaWorkItem(items, "CCM-1")?.id, "new");
});

test("attention deterministically prefers active governance state when timestamps tie", () => {
  const items = [
    work({ id: "rejected", status: "rejected" }),
    work({ id: "completed", status: "completed", resultRef: "FND-1" }),
    work({ id: "pending", status: "PENDING-REVIEW" }),
  ];
  assert.equal(selectCapaWorkItem(items, "CCM-1")?.id, "pending");
});

test("attention selects re-test work independently from CAPA promotion", () => {
  const items = [
    work({ id: "capa", status: "completed", resultRef: "FND-1" }),
    work({ id: "old-retest", action: "control-retest", status: "rejected", updatedAt: "2026-09-29T07:00:00.000Z" }),
    work({ id: "active-retest", action: "control-retest", status: "approved-awaiting-retest", updatedAt: "2026-09-30T07:00:00.000Z" }),
  ];
  assert.equal(selectRetestWorkItem(items, "CCM-1")?.id, "active-retest");
  assert.equal(selectCapaWorkItem(items, "CCM-1")?.id, "capa");
});

test("attention does not expose a governance action without a real technical finding", () => {
  assert.equal(capaGovernanceState(false, true), "not-applicable");
  assert.equal(capaGovernanceState(true, false), "unavailable");
  assert.equal(capaGovernanceState(true, true), "ready");
});

test("attention mirrors server-side governed CAPA lifecycle", () => {
  assert.equal(capaGovernanceState(true, true, work()), "pending-review");
  assert.equal(capaGovernanceState(true, true, work({ status: "completed", resultRef: "FND-1" })), "completed");
  assert.equal(capaGovernanceState(true, true, work({ status: "completed" })), "other");
  assert.equal(capaGovernanceState(true, true, work({ status: "rejected" })), "rejected");
  assert.equal(capaGovernanceState(true, true, work({ status: "unexpected" })), "other");
});

test("re-test attention mirrors the governed review and real-run reconciliation states", () => {
  const retest = (status: string, resultRef = "") => work({ action: "control-retest", status, resultRef });
  assert.equal(retestAttentionState(false, true), "not-applicable");
  assert.equal(retestAttentionState(true, false), "unavailable");
  assert.equal(retestAttentionState(true, true), "evaluate");
  assert.equal(retestAttentionState(true, true, retest("pending-review")), "pending-review");
  assert.equal(retestAttentionState(true, true, retest("approved-awaiting-retest")), "awaiting-run");
  assert.equal(retestAttentionState(true, true, retest("completed", "RUN-1")), "completed");
  assert.equal(retestAttentionState(true, true, retest("failed-retest", "RUN-2")), "failed");
  assert.equal(retestAttentionState(true, true, retest("retest-error", "RUN-3")), "error");
  assert.equal(retestAttentionState(true, true, retest("rejected")), "rejected");
});

test("re-test readiness is derived from authoritative recovery evaluation only", () => {
  assert.equal(retestAttentionState(true, true, undefined, recovery()), "ready");
  assert.equal(retestAttentionState(true, true, undefined, recovery({ recoveryState: "blocked", readyForRetest: false })), "blocked");
  assert.equal(retestAttentionState(true, true, undefined, recovery({ recoveryState: "recovered" })), "recovered");
  assert.equal(retestAttentionState(true, true, undefined, recovery({ recoveryState: "retest-failed" })), "failed");
  assert.equal(retestAttentionState(true, true, undefined, recovery({ recoveryState: "retest-error" })), "error");
  assert.equal(retestAttentionState(true, true, undefined, recovery({ recoveryState: "evidence-degraded" })), "error");
});

test("CAPA traceability follows the canonical enterprise finding lifecycle", () => {
  const promoted = work({ status: "completed", resultRef: "FND-1", resultCode: "FND-2026-ABCDEF12" });
  assert.equal(capaTraceabilityState(promoted, enterpriseFinding({ status: "open" })), "remediation-open");
  assert.equal(capaTraceabilityState(promoted, enterpriseFinding({ status: "in-progress" })), "remediation-active");
  assert.equal(capaTraceabilityState(promoted, enterpriseFinding({ status: "verification" })), "verification");
  assert.equal(capaTraceabilityState(promoted, enterpriseFinding({ status: "closed" })), "closed");
  assert.equal(capaTraceabilityState(promoted, enterpriseFinding({ status: "accepted" })), "accepted");
});

test("traceability fails closed when promotion or enterprise linkage is incomplete", () => {
  assert.equal(capaTraceabilityState(work(), enterpriseFinding()), "not-promoted");
  assert.equal(capaTraceabilityState(work({ status: "completed" }), enterpriseFinding()), "not-promoted");
  assert.equal(capaTraceabilityState(work({ status: "completed", resultRef: "FND-1" })), "unresolved");
  assert.equal(capaTraceabilityState(work({ status: "completed", resultRef: "FND-1" }), enterpriseFinding({ id: "FND-2" })), "unresolved");
});

test("traceability integrity reports remediation and verification evidence without inventing state", () => {
  const promoted = work({ status: "completed", resultRef: "FND-1" });
  assert.deepEqual(
    capaTraceabilityIntegrity(promoted, enterpriseFinding({
      status: "closed",
      evidenceReference: "evidence://capa-owner-proof",
      verificationEvidenceReference: "evidence://independent-retest",
      recurrenceCount: 2,
    })),
    {
      state: "closed",
      promoted: true,
      remediationEvidencePresent: true,
      verificationEvidencePresent: true,
      recurrenceCount: 2,
    },
  );
});
