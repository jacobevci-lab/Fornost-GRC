import assert from "node:assert/strict";
import test from "node:test";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph } from "../app/connected-grc-model";

test("connected GRC builds typed deterministic links and reports unresolved references", () => {
  const rows = [
    { id: "asset-tech-1", code: "AST-001", module: "Varlık Envanteri", data: { title: "M365 Tenant" } },
    { id: "risk-tech-1", code: "RSK-001", module: "Risk Assessment", data: { title: "Tenant outage", asset: "M365 Tenant" } },
    { id: "control-tech-1", code: "CTL-001", module: "Kontroller", data: { controlRef: "A.5.15", controlTitle: "Access control" } },
    { id: "evidence-tech-1", code: "EVD-001", module: "Kanıtlar", data: { evidenceTitle: "MFA export", controlRef: "A.5.15" } },
    { id: "risk-tech-2", code: "RSK-002", module: "Risk Assessment", data: { title: "Unknown dependency", asset: "Missing asset" } },
  ];
  const graph = buildConnectedGrcGraph(rows);
  assert.deepEqual(graph.links.map((link) => [link.source.code, link.target.code, link.relation]), [["RSK-001", "AST-001", "risk-asset"], ["EVD-001", "CTL-001", "control-evidence"]]);
  assert.equal(graph.unresolved.length, 1);
  assert.equal(graph.unresolved[0].value, "Missing asset");
  assert.equal(new Set(graph.links.map((link) => `${link.source.id}|${link.target.id}|${link.relation}`)).size, graph.links.length);
});

test("connected GRC scores assurance traceability and prioritizes critical gaps", () => {
  const rows = [
    { id: "asset-1", code: "AST-001", module: "Varlık Envanteri", data: { title: "M365" } },
    { id: "risk-1", code: "RSK-001", module: "Risk Assessment", data: { title: "Outage", asset: "M365" } },
    { id: "risk-2", code: "RSK-002", module: "Risk Assessment", data: { title: "Unlinked risk" } },
    { id: "control-1", code: "CTL-001", module: "Kontroller", data: { controlRef: "A.5.15" } },
    { id: "evidence-1", code: "EVD-001", module: "Kanıtlar", data: { evidenceTitle: "MFA", controlRef: "A.5.15" } },
    { id: "audit-1", code: "AUD-001", module: "Denetim Yönetimi", data: { auditName: "ISO audit" } },
  ];
  const graph = buildConnectedGrcGraph(rows);
  const coverage = assessConnectedGrcCoverage(rows, graph.links);
  assert.equal(coverage.eligible, 5);
  assert.equal(coverage.covered, 2);
  assert.equal(coverage.partial, 1);
  assert.equal(coverage.percent, 50);
  assert.deepEqual(coverage.gaps.map((gap) => [gap.row.code, gap.rule, gap.severity]), [
    ["AUD-001", "audit-traceability", "high"],
    ["RSK-002", "risk-context", "high"],
    ["CTL-001", "control-assurance", "high"],
  ]);
  assert.deepEqual(coverage.gaps[0].missingRelations, ["audit-control", "audit-evidence"]);
  assert.deepEqual(coverage.gaps[2].missingRelations, ["control-framework"]);
  assert.deepEqual(coverage.domains.map((domain) => [domain.module, domain.percent]), [["Risk Assessment",50],["Kontroller",50],["Kanıtlar",100],["Denetim Yönetimi",0]]);
});

test("duplicate labels remain ambiguous and cannot certify coverage", () => {
  const rows = [
    { id: "asset-a", code: "AST-A", module: "Varlık Envanteri", data: { title: "Shared service" } },
    { id: "asset-b", code: "AST-B", module: "Varlık Envanteri", data: { title: "Shared service" } },
    { id: "risk-a", module: "Risk Assessment", data: { asset: "Shared service" } },
  ];
  const graph = buildConnectedGrcGraph(rows);
  assert.equal(graph.links.length, 0);
  assert.equal(graph.unresolved[0].reason, "ambiguous");
  assert.deepEqual(graph.unresolved[0].candidates.map(row => row.id), ["asset-a", "asset-b"]);
  assert.equal(assessConnectedGrcCoverage(rows, graph.links).covered, 0);
});

test("canonical IDs outrank codes and labels; unique codes outrank labels", () => {
  const assets = [
    { id: "asset-a", code: "AST-A", module: "Varlık Envanteri", data: { title: "Production" } },
    { id: "asset-b", code: "asset-a", module: "Varlık Envanteri", data: { title: "AST-A" } },
    { id: "asset-c", code: "AST-C", module: "Varlık Envanteri", data: { title: "asset-a" } },
  ];
  for (const reference of ["asset-a", "AST-A"]) {
    const graph = buildConnectedGrcGraph([...assets, { id: "risk-a", module: "Risk Assessment", data: { asset: reference } }]);
    assert.deepEqual(graph.links.map(link => link.target.id), ["asset-a"]);
    assert.equal(graph.unresolved.length, 0);
  }
});

test("duplicate codes never fall through to a unique label and targets stay module scoped", () => {
  const rows = [
    { id: "asset-a", code: "DUP", module: "Varlık Envanteri", data: {} },
    { id: "asset-b", code: "DUP", module: "Varlık Envanteri", data: {} },
    { id: "asset-c", module: "Varlık Envanteri", data: { title: "DUP" } },
    { id: "DUP", module: "Kontroller", data: {} },
    { id: "risk-a", module: "Risk Assessment", data: { asset: "DUP" } },
  ];
  const graph = buildConnectedGrcGraph(rows);
  assert.equal(graph.links.length, 0);
  assert.equal(graph.unresolved[0].reason, "ambiguous");
  assert.deepEqual(graph.unresolved[0].candidates.map(row => row.id), ["asset-a", "asset-b"]);
});

test("projected native IDs outrank colliding legacy aliases and explicit lists retain multiple links", () => {
  const graph = buildConnectedGrcGraph([
    { id: "enterprise:vendor:vendor-1", module: "Tedarikçiler", data: { canonicalRefs: ["vendor-1"], title: "Supplier" } },
    { id: "enterprise:vendor:vendor-2", module: "Tedarikçiler", data: { canonicalRefs: ["vendor-2"], title: "vendor-1" } },
    { id: "asset-a", module: "Varlık Envanteri", data: { vendor: ["vendor-1", "vendor-2", "absent"] } },
  ]);
  assert.deepEqual(graph.links.map(link => link.target.id), ["enterprise:vendor:vendor-1", "enterprise:vendor:vendor-2"]);
  assert.equal(graph.unresolved[0].reason, "missing");
  assert.deepEqual(graph.unresolved[0].candidates, []);
});
