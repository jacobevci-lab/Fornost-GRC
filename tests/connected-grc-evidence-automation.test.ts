import assert from "node:assert/strict";
import test from "node:test";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, type ConnectedGrcRow } from "../app/connected-grc-model";
import { buildConnectedGrcEnterpriseRows, connectedGrcEnterpriseEndpoints } from "../app/connected-grc-sources";

const coreRows: ConnectedGrcRow[] = [
  { id: "ctl-1", code: "CTL-001", module: "Kontroller", data: { title: "MFA coverage", controlRef: "CTL-001" } },
  { id: "risk-1", code: "RSK-001", module: "Risk Assessment", data: { title: "Account takeover" } },
  { id: "EVD-AUTO-1", code: "EVD-AUTO-1", module: "Kanıtlar", data: { evidenceTitle: "MFA automation evidence", controlRef: "CTL-001" } },
];

test("Evidence Automation is an eighth live Connected GRC source", () => {
  assert.equal(connectedGrcEnterpriseEndpoints.length, 8);
  assert.ok(connectedGrcEnterpriseEndpoints.some((item) => item.key === "evidenceAutomation" && item.path === "/api/evidence-automation"));
});

test("Evidence Automation projects source, rule and finding nodes into the graph", () => {
  const enterprise = buildConnectedGrcEnterpriseRows({
    evidenceAutomation: {
      sources: [{ id: "SRC-1", name: "Microsoft Defender", lastTestStatus: "success" }],
      rules: [{ id: "RULE-1", name: "MFA continuous check", sourceId: "SRC-1", controlRefs: "CTL-001", health: "healthy", freshness: "fresh" }],
      findings: [{ id: "CCM-1", ruleId: "RULE-1", evidenceId: "EVD-AUTO-1", title: "MFA coverage below threshold", severity: "high", status: "open" }],
      runs: [{ id: "RUN-1", ruleName: "MFA continuous check" }],
    },
  });

  assert.equal(enterprise.filter((row) => row.module === "Kanıt Otomasyonu").length, 3);
  const graph = buildConnectedGrcGraph([...coreRows, ...enterprise]);
  const relations = new Set(graph.links.map((link) => link.relation));
  assert.ok(relations.has("automation-source"));
  assert.ok(relations.has("automation-control"));
  assert.ok(relations.has("automation-rule"));
  assert.ok(relations.has("automation-evidence"));

  const coverage = assessConnectedGrcCoverage([...coreRows, ...enterprise], graph.links);
  const automationDomain = coverage.domains.find((domain) => domain.module === "Kanıt Otomasyonu");
  assert.ok(automationDomain);
  assert.equal(automationDomain?.eligible, 2);
  assert.equal(automationDomain?.percent, 100);
});

test("continuous-control CAPA connects automation finding context through remediation to risk", () => {
  const enterprise = buildConnectedGrcEnterpriseRows({
    evidenceAutomation: {
      sources: [{ id: "SRC-1", name: "Microsoft Defender" }],
      rules: [{ id: "RULE-1", name: "MFA continuous check", sourceId: "SRC-1", controlRefs: "CTL-001", health: "failing", freshness: "fresh" }],
      findings: [{ id: "CCM-1", ruleId: "RULE-1", evidenceId: "EVD-AUTO-1", title: "MFA coverage below threshold", severity: "high", status: "open" }],
    },
    findings: {
      findings: [{ id: "FND-1", code: "FND-001", title: "MFA assurance gap", sourceType: "continuous-control", sourceRef: "RULE-1", controlRef: "CTL-001", riskRef: "RSK-001", status: "in-progress", correctiveAction: "Restore MFA coverage and validate continuous evidence" }],
    },
  });
  const rows = [...coreRows, ...enterprise];
  const graph = buildConnectedGrcGraph(rows);
  const relations = new Set(graph.links.map((link) => link.relation));
  for (const relation of ["finding-automation-rule", "finding-remediation", "remediation-risk", "remediation-control", "remediation-automation-rule"])
    assert.ok(relations.has(relation), `expected relationship ${relation}`);

  const coverage = assessConnectedGrcCoverage(rows, graph.links);
  const remediation = coverage.gaps.find((gap) => gap.row.data.kind === "remediation");
  assert.equal(remediation, undefined);
});

test("Evidence Automation adapters tolerate partial payloads without inventing nodes", () => {
  const rows = buildConnectedGrcEnterpriseRows({ evidenceAutomation: { runs: [{ id: "RUN-ONLY" }], sources: [null, "bad"] } });
  assert.equal(rows.length, 0);
});
