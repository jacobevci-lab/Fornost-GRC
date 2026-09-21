import assert from "node:assert/strict";
import test from "node:test";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, type ConnectedGrcRow } from "../app/connected-grc-model";
import { buildConnectedGrcEnterpriseRows } from "../app/connected-grc-sources";

const coreRows: ConnectedGrcRow[] = [
  { id: "asset-1", code: "AST-001", module: "Varlık Envanteri", data: { title: "Payments API" } },
  { id: "risk-1", code: "RSK-001", module: "Risk Assessment", data: { title: "Payments outage", asset: "AST-001" } },
  { id: "bia-1", code: "BIA-001", module: "BIA", data: { process: "Payment processing" } },
  { id: "ctl-1", code: "CTL-001", module: "Kontroller", data: { controlRef: "A.8.20", title: "Network security" } },
  { id: "evi-1", code: "EVD-001", module: "Kanıtlar", data: { evidenceTitle: "Firewall export", controlRef: "A.8.20" } },
  { id: "audit-1", code: "AUD-001", module: "Denetim Yönetimi", data: { auditName: "ISO 27001 Audit", requirementRef: "A.8.20", evidenceRef: "EVD-001" } },
  { id: "framework-1", code: "ISO27001", module: "Uyum", data: { framework: "ISO 27001" } },
];

test("enterprise source adapters create deterministic namespaced Connected GRC rows", () => {
  const rows = buildConnectedGrcEnterpriseRows({
    findings: { findings: [{ id: "F-1", code: "FND-001", title: "Firewall gap", sourceType: "audit", sourceRef: "AUD-001", riskRef: "RSK-001", controlRef: "CTL-001" }] },
    incidents: { incidents: [{ id: "I-1", code: "INC-001", title: "Payments outage", assetRefs: ["AST-001"], riskRef: "RSK-001", biaRef: "BIA-001" }] },
    continuity: {
      plans: [{ id: "P-1", code: "BCP-001", name: "Payments BCP", biaRef: "BIA-001" }],
      exercises: [{ id: "E-1", code: "BCE-001", name: "Payments failover", planId: "P-1" }],
      gaps: [{ id: "G-1", code: "BCG-001", title: "RTO gap", planId: "P-1" }],
    },
    policy: {
      documents: [{ id: "POL-1", code: "POL-001", title: "Access Control Policy" }],
      versions: [{ id: "PV-1", policyId: "POL-1", versionNumber: "2.0", controlRefs: ["CTL-001"], riskRefs: ["RSK-001"] }],
    },
    riskAppetite: {
      appetites: [{ id: "RAP-1", code: "RAP-001", statement: "Availability loss stays below threshold", kriName: "Downtime" }],
      measurements: [{ id: "M-1", appetiteId: "RAP-1", periodEnd: "2026-09-01" }],
      breaches: [{ id: "B-1", appetiteId: "RAP-1", measurementId: "M-1", severity: "high" }],
      scenarios: [{ id: "S-1", appetiteId: "RAP-1", name: "Provider outage" }],
    },
    regulatory: {
      sources: [{ id: "REGSRC-1", name: "EU DORA" }],
      changes: [{ id: "REGCHG-1", externalRef: "DORA-2026-1", title: "ICT resilience update", sourceId: "REGSRC-1" }],
      impacts: [{ id: "REGIMP-1", changeId: "REGCHG-1", targetType: "control", targetRef: "CTL-001", targetTitle: "Network security" }],
    },
    thirdParty: {
      vendors: [{ id: "V-1", vendorId: "VEN-001", name: "Cloud Provider" }],
      assessments: [{ id: "VA-1", vendorId: "VEN-001", cycleNumber: 2 }],
      findings: [{ id: "VF-1", vendorId: "VEN-001", assessmentId: "VA-1", title: "BCP evidence gap" }],
    },
  });

  assert.ok(rows.length >= 18);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.ok(rows.every((row) => row.id.startsWith("enterprise:")));
  assert.deepEqual(rows, buildConnectedGrcEnterpriseRows({
    findings: { findings: [{ id: "F-1", code: "FND-001", title: "Firewall gap", sourceType: "audit", sourceRef: "AUD-001", riskRef: "RSK-001", controlRef: "CTL-001" }] },
    incidents: { incidents: [{ id: "I-1", code: "INC-001", title: "Payments outage", assetRefs: ["AST-001"], riskRef: "RSK-001", biaRef: "BIA-001" }] },
    continuity: { plans: [{ id: "P-1", code: "BCP-001", name: "Payments BCP", biaRef: "BIA-001" }], exercises: [{ id: "E-1", code: "BCE-001", name: "Payments failover", planId: "P-1" }], gaps: [{ id: "G-1", code: "BCG-001", title: "RTO gap", planId: "P-1" }] },
    policy: { documents: [{ id: "POL-1", code: "POL-001", title: "Access Control Policy" }], versions: [{ id: "PV-1", policyId: "POL-1", versionNumber: "2.0", controlRefs: ["CTL-001"], riskRefs: ["RSK-001"] }] },
    riskAppetite: { appetites: [{ id: "RAP-1", code: "RAP-001", statement: "Availability loss stays below threshold", kriName: "Downtime" }], measurements: [{ id: "M-1", appetiteId: "RAP-1", periodEnd: "2026-09-01" }], breaches: [{ id: "B-1", appetiteId: "RAP-1", measurementId: "M-1", severity: "high" }], scenarios: [{ id: "S-1", appetiteId: "RAP-1", name: "Provider outage" }] },
    regulatory: { sources: [{ id: "REGSRC-1", name: "EU DORA" }], changes: [{ id: "REGCHG-1", externalRef: "DORA-2026-1", title: "ICT resilience update", sourceId: "REGSRC-1" }], impacts: [{ id: "REGIMP-1", changeId: "REGCHG-1", targetType: "control", targetRef: "CTL-001", targetTitle: "Network security" }] },
    thirdParty: { vendors: [{ id: "V-1", vendorId: "VEN-001", name: "Cloud Provider" }], assessments: [{ id: "VA-1", vendorId: "VEN-001", cycleNumber: 2 }], findings: [{ id: "VF-1", vendorId: "VEN-001", assessmentId: "VA-1", title: "BCP evidence gap" }] },
  }));
});

test("Connected GRC resolves enterprise lineage across findings incidents policies regulation KRI continuity and vendors", () => {
  const enterprise = buildConnectedGrcEnterpriseRows({
    findings: { findings: [{ id: "F-1", code: "FND-001", title: "Firewall gap", sourceType: "audit", sourceRef: "AUD-001", riskRef: "RSK-001", controlRef: "CTL-001" }] },
    incidents: { incidents: [{ id: "I-1", code: "INC-001", title: "Payments outage", assetRefs: ["AST-001"], riskRef: "RSK-001", biaRef: "BIA-001" }] },
    continuity: { plans: [{ id: "P-1", code: "BCP-001", name: "Payments BCP", biaRef: "BIA-001" }], exercises: [{ id: "E-1", code: "BCE-001", name: "Payments failover", planId: "P-1" }] },
    policy: { documents: [{ id: "POL-1", code: "POL-001", title: "Access Control Policy" }], versions: [{ id: "PV-1", policyId: "POL-1", versionNumber: "2.0", controlRefs: ["CTL-001"], riskRefs: ["RSK-001"] }] },
    riskAppetite: { appetites: [{ id: "RAP-1", code: "RAP-001", statement: "Availability", kriName: "Downtime" }], measurements: [{ id: "M-1", appetiteId: "RAP-1", periodEnd: "2026-09-01" }], breaches: [{ id: "B-1", appetiteId: "RAP-1", measurementId: "M-1", severity: "high" }] },
    regulatory: { sources: [{ id: "REGSRC-1", name: "EU DORA" }], changes: [{ id: "REGCHG-1", title: "ICT resilience update", sourceId: "REGSRC-1" }], impacts: [{ id: "REGIMP-1", changeId: "REGCHG-1", targetType: "control", targetRef: "CTL-001" }] },
    thirdParty: { vendors: [{ id: "V-1", vendorId: "VEN-001", name: "Cloud Provider" }], assessments: [{ id: "VA-1", vendorId: "VEN-001" }], findings: [{ id: "VF-1", vendorId: "VEN-001", assessmentId: "VA-1", title: "BCP gap" }] },
  });
  const rows = [...coreRows, ...enterprise];
  const graph = buildConnectedGrcGraph(rows);
  const relations = new Set(graph.links.map((link) => link.relation));
  for (const relation of [
    "finding-risk", "finding-control", "finding-audit", "incident-asset", "incident-risk", "incident-bia",
    "continuity-bia", "continuity-plan", "policy-version", "policy-control", "policy-risk", "regulatory-source",
    "regulatory-impact", "regulatory-control", "kri-appetite", "kri-measurement", "vendor-assessment", "assessment-finding",
  ]) assert.ok(relations.has(relation), `expected relationship ${relation}`);

  const coverage = assessConnectedGrcCoverage(rows, graph.links);
  assert.ok(coverage.eligible > 10);
  assert.ok(coverage.domains.some((domain) => domain.module === "Bulgular ve CAPA"));
  assert.ok(coverage.domains.some((domain) => domain.module === "Güvenlik Olayları"));
  assert.ok(coverage.domains.some((domain) => domain.module === "Politika Merkezi"));
  assert.ok(coverage.domains.some((domain) => domain.module === "Regülasyon Merkezi"));
  assert.ok(coverage.domains.some((domain) => domain.module === "Risk İştahı ve KRI"));
  assert.ok(coverage.domains.some((domain) => domain.module === "Tedarikçiler"));
});

test("enterprise source adapters tolerate partial and missing payloads", () => {
  assert.deepEqual(buildConnectedGrcEnterpriseRows({}), []);
  const rows = buildConnectedGrcEnterpriseRows({ findings: { findings: [null, "bad", { id: "F-1", title: "Manual finding" }] } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].module, "Bulgular ve CAPA");
});
