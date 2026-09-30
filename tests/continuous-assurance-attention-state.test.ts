import test from "node:test";
import assert from "node:assert/strict";
import {
  capaGovernanceState,
  selectCapaWorkItem,
  type CapaWorkItem,
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

test("attention selects the newest CAPA promotion work item for a technical finding", () => {
  const items = [
    work({ id: "old", status: "rejected", updatedAt: "2026-09-29T07:00:00.000Z" }),
    work({ id: "new", status: "pending-review", updatedAt: "2026-09-30T07:00:00.000Z" }),
    work({ id: "retest", action: "control-retest", updatedAt: "2026-10-01T07:00:00.000Z" }),
    work({ id: "other", findingId: "CCM-2", updatedAt: "2026-10-02T07:00:00.000Z" }),
  ];
  assert.equal(selectCapaWorkItem(items, "CCM-1")?.id, "new");
});

test("attention does not expose a governance action without a real technical finding", () => {
  assert.equal(capaGovernanceState(false, true), "not-applicable");
  assert.equal(capaGovernanceState(true, false), "unavailable");
  assert.equal(capaGovernanceState(true, true), "ready");
});

test("attention mirrors server-side governed CAPA lifecycle", () => {
  assert.equal(capaGovernanceState(true, true, work()), "pending-review");
  assert.equal(capaGovernanceState(true, true, work({ status: "completed", resultRef: "FND-1" })), "completed");
  assert.equal(capaGovernanceState(true, true, work({ status: "rejected" })), "rejected");
  assert.equal(capaGovernanceState(true, true, work({ status: "unexpected" })), "other");
});
