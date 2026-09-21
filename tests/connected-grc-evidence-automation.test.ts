import assert from "node:assert/strict";
import test from "node:test";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, type ConnectedGrcRow } from "../app/connected-grc-model";
import { buildConnectedGrcEnterpriseRows, connectedGrcEnterpriseEndpoints } from "../app/connected-grc-sources";

const coreRows: ConnectedGrcRow[] = [
  { id: "ctl-1", code: "CTL-001", module: "Kontroller", data: { title: "MFA coverage", controlRef: "CTL-001" } },
  { id: "EVD-AUTO-1", code: "EVD-AUTO-1", module: "Kanıtlar", data: { evidenceTitle: "MFA automation evidence", controlRef: "CTL-001" } },
  { id: "CCM-1", code: "RSK-CCM-1", module: "Risk Assessment", data: { title: "MFA assurance degradation risk", processLink: "MFA coverage" } },
];

test("Evidence Automation is an eighth live Connected GRC source", () => {
  assert.equal(connectedGrcEnterpriseEndpoints.length, 8);
  assert.ok(connectedGrcEnterpriseEndpoints.some((item) => item.key === "evidenceAutomation" && item.path === "/api/evidence-automation"));
});

test("Evidence Automation projects the full assurance lifecycle into Connected GRC", () => {
  const enterprise = buildConnectedGrcEnterpriseRows({
    evidenceAutomation: {
      sources: [{ id: "SRC-1", name: "Microsoft Defender", lastTestStatus: "success" }],
      rules: [{ id: "RULE-1", name: "MFA continuous check", sourceId: "SRC-1", controlRefs: "CTL-001", health: "failing", freshness: "fresh" }],
      findings: [{ id: "CCM-1", ruleId: "RULE-1", evidenceId: "EVD-AUTO-1", title: "MFA coverage below threshold", severity: "high", status: "open", owner: "security@example.test", dueDate: "2026-09-30" }],
      runs: [{ id: "RUN-1", ruleName: "MFA continuous check" }],
    },
  });

  assert.equal(enterprise.filter((row) => row.module === "Kanıt Otomasyonu").length, 5);
  const assurance = enterprise.find((row) => row.data.kind === "automation-assurance");
  assert.ok(assurance);
  assert.equal(assurance?.data.assuranceState, "ineffective");
  assert.equal(assurance?.data.assuranceScore, 25);
  const remediation = enterprise.find((row) => row.data.kind === "automation-remediation");
  assert.ok(remediation);
  assert.equal(remediation?.data.owner, "security@example.test");
  assert.equal(remediation?.data.dueDate, "2026-09-30");

  const graph = buildConnectedGrcGraph([...coreRows, ...enterprise]);
  const relations = new Set(graph.links.map((link) => link.relation));
  assert.ok(relations.has("automation-source"));
  assert.ok(relations.has("automation-control"));
  assert.ok(relations.has("automation-rule"));
  assert.ok(relations.has("automation-evidence"));
  assert.ok(relations.has("control-assurance"));
  assert.ok(relations.has("assurance-finding"));
  assert.ok(relations.has("finding-remediation"));
  assert.ok(relations.has("remediation-risk"));

  const chain = ["control-assurance", "assurance-finding", "finding-remediation", "remediation-risk"];
  for (const relation of chain) assert.ok(graph.links.some((link) => link.relation === relation), `missing ${relation}`);

  const coverage = assessConnectedGrcCoverage([...coreRows, ...enterprise], graph.links);
  const automationDomain = coverage.domains.find((domain) => domain.module === "Kanıt Otomasyonu");
  assert.ok(automationDomain);
  assert.equal(automationDomain?.eligible, 4);
  assert.equal(automationDomain?.percent, 100);
});

test("healthy and stale rules expose deterministic assurance state without inventing findings", () => {
  const rows = buildConnectedGrcEnterpriseRows({
    evidenceAutomation: {
      rules: [
        { id: "RULE-H", name: "Healthy rule", health: "healthy", freshness: "fresh" },
        { id: "RULE-S", name: "Stale rule", health: "stale", freshness: "stale" },
      ],
    },
  });
  const assurance = rows.filter((row) => row.data.kind === "automation-assurance");
  assert.equal(assurance.length, 2);
  assert.deepEqual(assurance.map((row) => [row.data.assuranceState, row.data.assuranceScore]), [["effective", 100], ["degraded", 65]]);
  assert.equal(rows.filter((row) => row.data.kind === "automation-finding").length, 0);
  assert.equal(rows.filter((row) => row.data.kind === "automation-remediation").length, 0);
});

test("Evidence Automation adapters tolerate partial payloads without inventing nodes", () => {
  const rows = buildConnectedGrcEnterpriseRows({ evidenceAutomation: { runs: [{ id: "RUN-ONLY" }], sources: [null, "bad"] } });
  assert.equal(rows.length, 0);
});
