import assert from "node:assert/strict";
import test from "node:test";
import { buildAssuranceReportHtml, buildExecutiveAssurance } from "../app/executive-assurance";

const rows = [
  { id:"risk-1", code:"RSK-001", module:"Risk Assessment", data:{ title:"Identity risk", asset:"M365" } },
  { id:"asset-1", code:"AST-001", module:"Varlık Envanteri", data:{ title:"M365" } },
  { id:"control-1", code:"CTL-001", module:"Kontroller", data:{ controlRef:"A.5.15", controlTitle:"Access control", owner:"IAM", testOwner:"Audit", nextTestDate:"2027-01-01", frameworks:"ISO 27001", status:"Aktif" } },
  { id:"framework-1", code:"CMP-001", module:"Uyum", data:{ framework:"ISO 27001", controlRef:"A.5.15", status:"Uyumlu" } },
  { id:"evidence-1", code:"EVD-001", module:"Kanıtlar", data:{ evidenceTitle:"MFA export", controlRef:"A.5.15", status:"Onaylandı", expiresAt:"2027-01-01" } },
  { id:"audit-1", code:"AUD-001", module:"Denetim Yönetimi", data:{ auditName:"ISO audit", requirementRef:"A.5.15", evidenceRef:"EVD-001", evidenceStatus:"Kanıt Tamam", status:"Açık" } },
];

test("executive assurance combines traceability, controls, evidence and audit readiness", () => {
  const result = buildExecutiveAssurance(rows, "2026-09-20");
  assert.equal(result.score, 100);
  assert.equal(result.state, "strong");
  assert.equal(result.completeChains, 4);
  assert.equal(result.priorities.length, 0);
});

test("assurance pack is escaped, bilingual and includes priority evidence", () => {
  const html = buildAssuranceReportHtml([...rows, { id:"risk-x", code:"RSK-X", module:"Risk Assessment", data:{ title:"<script>alert(1)</script>" } }], true, "2026-09-20");
  assert.match(html, /Yönetici Güvence Paketi/);
  assert.match(html, /RSK-X/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
