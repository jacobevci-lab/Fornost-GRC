import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectedGrcGraph, type ConnectedGrcRow } from "../app/connected-grc-model";
import { buildConnectedGrcEnterpriseRows } from "../app/connected-grc-sources";
import { buildContinuousAssuranceChains, summarizeContinuousAssurance } from "../app/continuous-assurance-chain";

function fixture(health: "healthy" | "stale" | "failing", withFinding = false, withRisk = false, dueDate = "2026-09-30") {
  const rows: ConnectedGrcRow[] = [
    { id: "ctl-1", code: "CTL-001", module: "Kontroller", data: { title: "MFA coverage", controlRef: "CTL-001" } },
    { id: "evidence-1", code: "EVD-1", module: "Kanıtlar", data: { evidenceTitle: "MFA evidence", controlRef: "CTL-001" } },
  ];
  if (withRisk) rows.push({ id: "FIND-1", code: "RSK-1", module: "Risk Assessment", data: { title: "MFA control failure risk" } });

  const enterprise = buildConnectedGrcEnterpriseRows({
    evidenceAutomation: {
      sources: [{ id: "SRC-1", name: "Defender" }],
      rules: [{ id: "RULE-1", name: "MFA continuous check", sourceId: "SRC-1", controlRefs: "CTL-001", health, freshness: health === "stale" ? "stale" : "fresh" }],
      findings: withFinding ? [{ id: "FIND-1", ruleId: "RULE-1", evidenceId: "EVD-1", title: "MFA below target", severity: "high", status: "open", owner: "security@example.test", dueDate }] : [],
    },
  });
  return [...rows, ...enterprise];
}

test("effective assurance is a complete chain without forcing findings or remediation", () => {
  const rows = fixture("healthy");
  const graph = buildConnectedGrcGraph(rows);
  const chains = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chains.length, 1);
  assert.equal(chains[0].assuranceState, "effective");
  assert.equal(chains[0].assuranceScore, 100);
  assert.equal(chains[0].chainState, "complete");
  assert.deepEqual(chains[0].escalationReasons, []);
});

test("ineffective assurance without a finding is a broken chain requiring escalation", () => {
  const rows = fixture("failing");
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.assuranceState, "ineffective");
  assert.equal(chain.assuranceScore, 25);
  assert.equal(chain.chainState, "broken");
  assert.ok(chain.escalationReasons.includes("finding-missing"));
});

test("finding and remediation remain attention until the generated risk is linked", () => {
  const rows = fixture("failing", true, false);
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.findings.length, 1);
  assert.equal(chain.remediations.length, 1);
  assert.equal(chain.risks.length, 0);
  assert.equal(chain.chainState, "broken");
  assert.ok(chain.escalationReasons.includes("risk-link-missing"));
});

test("full ineffective assurance → finding → remediation → risk chain is traceable", () => {
  const rows = fixture("failing", true, true);
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.findings.length, 1);
  assert.equal(chain.remediations.length, 1);
  assert.equal(chain.risks.length, 1);
  assert.equal(chain.riskLinked, true);
  assert.equal(chain.chainState, "attention");
  assert.deepEqual(chain.escalationReasons, []);
});

test("overdue remediation is surfaced independently of graph completeness", () => {
  const rows = fixture("failing", true, true, "2026-09-01");
  const graph = buildConnectedGrcGraph(rows);
  const [chain] = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  assert.equal(chain.overdueRemediations, 1);
  assert.equal(chain.chainState, "attention");
  assert.ok(chain.escalationReasons.includes("remediation-overdue"));
});

test("summary exposes assurance posture and broken-chain pressure", () => {
  const healthyRows = fixture("healthy");
  const failingRows = fixture("failing", true, false).map((row) => ({ ...row, id: `b:${row.id}`, code: row.code ? `B-${row.code}` : row.code, data: { ...row.data } }));
  const rows = [...healthyRows, ...failingRows];
  const graph = buildConnectedGrcGraph(rows);
  const chains = buildContinuousAssuranceChains(rows, graph.links, new Date("2026-09-21T12:00:00Z"));
  const summary = summarizeContinuousAssurance(chains);
  assert.equal(summary.rules, 2);
  assert.equal(summary.effective, 1);
  assert.equal(summary.ineffective, 1);
  assert.equal(summary.averageAssuranceScore, 63);
  assert.ok(summary.brokenChains >= 1);
});
