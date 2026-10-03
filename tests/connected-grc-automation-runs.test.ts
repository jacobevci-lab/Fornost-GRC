import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectedGrcEnterpriseRows } from "../app/connected-grc-sources";
import { connectedGrcNavigation } from "../app/connected-grc-navigation";

test("automation runs retain immutable rule and evidence links without replacing current assurance", () => {
  const rows = buildConnectedGrcEnterpriseRows({ evidenceAutomation: {
    rules: [{ id: "r1", name: "Renamed rule", controlRefs: ["C1"], health: "failing" }],
    runs: [{ id: "run1", ruleId: "r1", ruleName: "Old name", evidenceId: "e1", status: "passed", createdAt: "2026-10-01T12:00:00Z" }],
  } });
  const run = rows.find(row => row.data?.kind === "automation-run")!;
  assert.deepEqual(run.data?.automationRuleRef, ["r1", "RULE:r1"]);
  assert.deepEqual(run.data?.automationEvidenceRef, ["e1"]);
  assert.deepEqual(run.data?.automationControlRefs, ["C1"]);
  assert.equal(run.data?.executedAt, "2026-10-01T12:00:00Z");
  assert.equal(run.data?.assuranceScore, undefined);
  assert.equal(rows.find(row => row.data?.kind === "automation-assurance")?.data?.assuranceState, "ineffective");
  assert.deepEqual(connectedGrcNavigation(run), { module: "Kanıt Otomasyonu", ref: "r1", filterKey: "ruleRef" });
});

test("missing rule IDs never bind runs by a colliding display name", () => {
  const rows = buildConnectedGrcEnterpriseRows({ evidenceAutomation: {
    rules: [{ id: "a", name: "Same", controlRefs: ["A"] }, { id: "b", name: "Same", controlRefs: ["B"] }],
    runs: [{ id: "legacy", ruleName: "Same", evidence_id: "e1" }, { id: "gone", rule_id: "deleted", status: "error" }, {}, null],
  } });
  const runs = rows.filter(row => row.data?.kind === "automation-run");
  assert.equal(runs.length, 2);
  const legacy = runs.find(row => row.id.endsWith(":legacy"))!;
  assert.deepEqual(legacy.data?.automationRuleRef, []);
  assert.deepEqual(legacy.data?.automationControlRefs, []);
  assert.deepEqual(legacy.data?.automationEvidenceRef, ["e1"]);
  assert.equal(connectedGrcNavigation(legacy), undefined);
  const gone = runs.find(row => row.id.endsWith(":gone"))!;
  assert.deepEqual(gone.data?.automationRuleRef, ["deleted", "RULE:deleted"]);
  assert.deepEqual(gone.data?.automationControlRefs, []);
});
