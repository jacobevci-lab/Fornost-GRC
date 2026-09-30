import test from "node:test";
import assert from "node:assert/strict";
import {
  capaGovernanceState,
  capaTraceabilityIntegrity,
  capaTraceabilityState,
  selectCapaWorkItem,
  type CapaWorkItem,
  type EnterpriseFindingSnapshot,
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
