import assert from "node:assert/strict";
import test from "node:test";
import { buildControlAssurance } from "../app/control-assurance";

test("control assurance correlates evidence and audit trace and prioritizes gaps", () => {
  const rows = [
    { id: "c1", code: "CTL-001", module: "Kontroller", data: { controlRef: "A.5.15", controlTitle: "Access control", owner: "IAM", testOwner: "Audit", nextTestDate: "2027-02-01", status: "Aktif" } },
    { id: "c2", code: "CTL-002", module: "Kontroller", data: { controlRef: "A.5.16", controlTitle: "Identity", owner: "", nextTestDate: "2026-01-01", status: "İyileştirme Gerekli" } },
    { id: "e1", code: "EVD-001", module: "Kanıtlar", data: { controlRef: "A.5.15", status: "Onaylandı", expiresAt: "2027-03-01" } },
    { id: "e2", code: "EVD-002", module: "Kanıtlar", data: { controlRef: "A.5.16", status: "Süresi Doldu", expiresAt: "2026-02-01" } },
    { id: "a1", code: "AUD-001", module: "Denetim Yönetimi", data: { controlRef: "A.5.15" } },
  ];
  const result = buildControlAssurance(rows, "2026-09-20");
  assert.equal(result.total, 2);
  assert.equal(result.healthy, 1);
  assert.equal(result.currentEvidence, 1);
  assert.equal(result.overdueTests, 1);
  assert.equal(result.items[0].reference, "A.5.16");
  assert.equal(result.items[0].state, "critical");
  assert.deepEqual(result.items[0].reasons, ["owner-missing", "test-owner-missing", "test-overdue", "evidence-stale", "audit-missing", "control-needs-improvement"]);
  assert.equal(result.items[1].state, "healthy");
});

test("control assurance treats missing test and evidence as actionable gaps", () => {
  const result = buildControlAssurance([
    { id: "c1", module: "Kontroller", data: { controlRef: "CTL-X", owner: "Risk", testOwner: "Assurance", status: "Aktif" } },
  ], "2026-09-20");
  assert.equal(result.items[0].score, 40);
  assert.deepEqual(result.items[0].reasons, ["test-date-missing", "evidence-missing", "audit-missing"]);
});
