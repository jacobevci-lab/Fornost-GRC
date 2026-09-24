import assert from "node:assert/strict";
import test from "node:test";
import { buildControlAssurance, type AssuranceRow } from "../app/control-assurance";

const row = (id: string, module: string, data: Record<string, unknown>, code?: string): AssuranceRow => ({ id, module, data, code });

test("resolves control evidence, audit, framework and automation through Connected GRC aliases", () => {
  const rows: AssuranceRow[] = [
    row("control-1", "Kontroller", {
      controlRef: "AC-01",
      controlTitle: "Access governance",
      owner: "Security",
      testOwner: "GRC",
      nextTestDate: "2026-12-01",
      testResult: "Passed",
      frameworks: "ISO 27001 A.5.15",
    }, "CTRL-001"),
    row("evidence-1", "Kanıtlar", { controlRef: "CTRL-001", status: "Approved", expiresAt: "2027-01-01" }, "EVD-001"),
    row("audit-1", "Denetim Yönetimi", { requirementRef: "AC-01", status: "Open" }, "AUD-001"),
    row("framework-1", "Uyum", { framework: "ISO 27001 A.5.15", status: "Uyumlu" }, "ISO-A515"),
    row("automation-1", "Kanıt Otomasyonu", { kind: "automation-rule", automationControlRefs: "AC-01" }, "AUTO-001"),
  ];

  const result = buildControlAssurance(rows, "2026-09-24");
  assert.equal(result.total, 1);
  assert.equal(result.items[0].evidenceCount, 1);
  assert.equal(result.items[0].currentEvidenceCount, 1);
  assert.equal(result.items[0].auditCount, 1);
  assert.equal(result.items[0].frameworkCount, 1);
  assert.equal(result.items[0].automationCount, 1);
  assert.ok(result.items[0].relationCount >= 4);
  assert.equal(result.items[0].score, 100);
  assert.equal(result.items[0].state, "healthy");
  assert.equal(result.automated, 1);
  assert.equal(result.frameworkMapped, 1);
  assert.equal(result.connected, 1);
});

test("failed tests and linked open findings reduce assurance without losing lineage", () => {
  const rows: AssuranceRow[] = [
    row("control-2", "Kontroller", {
      controlRef: "LOG-01",
      controlTitle: "Security logging",
      owner: "SOC",
      testOwner: "Security Assurance",
      nextTestDate: "2026-12-01",
      testResult: "Failed",
    }, "CTRL-LOG"),
    row("evidence-2", "Kanıtlar", { controlRef: "LOG-01", status: "Approved" }, "EVD-LOG"),
    row("audit-2", "Denetim Yönetimi", { controlRef: "LOG-01", status: "Open" }, "AUD-LOG"),
    row("finding-1", "Bulgular ve CAPA", { kind: "finding", findingControlRef: "LOG-01", status: "Open" }, "FND-001"),
  ];

  const result = buildControlAssurance(rows, "2026-09-24");
  const item = result.items[0];
  assert.equal(item.testFailed, true);
  assert.equal(item.openFindingCount, 1);
  assert.equal(item.score, 60);
  assert.equal(item.state, "attention");
  assert.deepEqual(item.reasons, ["test-failed", "open-findings"]);
  assert.equal(result.failedTests, 1);
  assert.equal(result.openFindings, 1);
});

test("review rejection makes otherwise unexpired evidence stale", () => {
  const rows: AssuranceRow[] = [
    row("control-3", "Kontroller", {
      controlRef: "BCP-01",
      owner: "Continuity",
      testOwner: "GRC",
      nextTestDate: "2026-12-01",
    }, "CTRL-BCP"),
    row("evidence-3", "Kanıtlar", {
      controlRef: "BCP-01",
      status: "Approved",
      reviewStatus: "Rejected",
      expiresAt: "2027-01-01",
    }, "EVD-BCP"),
    row("audit-3", "Denetim Yönetimi", { controlRef: "BCP-01", status: "Open" }, "AUD-BCP"),
  ];

  const result = buildControlAssurance(rows, "2026-09-24");
  assert.equal(result.items[0].evidenceCount, 1);
  assert.equal(result.items[0].currentEvidenceCount, 0);
  assert.ok(result.items[0].reasons.includes("evidence-stale"));
});
