import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectedGrcGraph } from "../app/connected-grc-model";

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
