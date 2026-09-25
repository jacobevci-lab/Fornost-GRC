import assert from "node:assert/strict";
import test from "node:test";
import { applyEvidenceIntegrityOverview, buildAssuranceReportHtml, buildExecutiveAssurance } from "../app/executive-assurance";
import type { AssuranceRow } from "../app/control-assurance";

const rows: AssuranceRow[] = [
  { id: "risk-1", code: "RSK-001", module: "Risk Assessment", data: { title: "Identity risk", asset: "M365" } },
  { id: "asset-1", code: "AST-001", module: "Varlık Envanteri", data: { title: "M365" } },
  { id: "control-1", code: "CTL-001", module: "Kontroller", data: { controlRef: "A.5.15", controlTitle: "Access control", owner: "IAM", testOwner: "Audit", nextTestDate: "2027-01-01", frameworks: "ISO 27001", status: "Aktif" } },
  { id: "framework-1", code: "CMP-001", module: "Uyum", data: { framework: "ISO 27001", controlRef: "A.5.15", status: "Uyumlu" } },
  { id: "evidence-1", code: "EVD-001", module: "Kanıtlar", data: { evidenceTitle: "MFA export", controlRef: "A.5.15", status: "Onaylandı", expiresAt: "2027-01-01" } },
  { id: "audit-1", code: "AUD-001", module: "Denetim Yönetimi", data: { auditName: "ISO audit", requirementRef: "A.5.15", evidenceRef: "EVD-001", evidenceStatus: "Kanıt Tamam", status: "Açık" } },
];

test("evidence history overview decorates only matching evidence records", () => {
  const enriched = applyEvidenceIntegrityOverview(rows, [
    { id: "evidence-1", integrity: "verified", checkedVersions: 3, failedVersion: 0 },
    { id: "missing-evidence", integrity: "broken", checkedVersions: 2, failedVersion: 2 },
  ]);
  const evidence = enriched.find((row) => row.id === "evidence-1");
  const control = enriched.find((row) => row.id === "control-1");

  assert.equal(evidence?.data.evidenceIntegrity, "verified");
  assert.equal(evidence?.data.evidenceIntegrityCheckedVersions, 3);
  assert.equal(control?.data.evidenceIntegrity, undefined);
});

test("broken cryptographic evidence lowers executive assurance and becomes an action signal", () => {
  const enriched = applyEvidenceIntegrityOverview(rows, [
    { id: "evidence-1", integrity: "broken", checkedVersions: 3, failedVersion: 2 },
  ]);
  const result = buildExecutiveAssurance(enriched, "2026-09-25");

  assert.equal(result.brokenEvidence, 1);
  assert.equal(result.verifiedEvidence, 0);
  assert.equal(result.currentEvidence, 0);
  assert.equal(result.integrityFailureControls, 1);
  assert.equal(result.integrityCoverage, 100);
  assert.ok(result.controlScore <= 45);
  assert.ok(result.evidenceScore < 100);
  assert.ok(result.score < 100);
  assert.equal(result.controlPriorities[0]?.reference, "A.5.15");
  assert.ok(result.controlPriorities[0]?.reasons.includes("evidence-integrity-broken"));
});

test("verified cryptographic evidence is visible in the executive assurance pack", () => {
  const enriched = applyEvidenceIntegrityOverview(rows, [
    { id: "evidence-1", integrity: "verified", checkedVersions: 3, failedVersion: 0 },
  ]);
  const result = buildExecutiveAssurance(enriched, "2026-09-25");
  const html = buildAssuranceReportHtml(enriched, true, "2026-09-25");

  assert.equal(result.verifiedEvidence, 1);
  assert.equal(result.brokenEvidence, 0);
  assert.equal(result.integrityCoverage, 100);
  assert.equal(result.fullyVerifiedEvidenceControls, 1);
  assert.match(html, /Kanıt bütünlüğü ve aksiyon posture/);
  assert.match(html, /Doğrulanmış kanıt zinciri/);
  assert.match(html, /Kontrol güvence öncelikleri/);
});

test("missing runtime integrity data stays explicitly unknown instead of being reported verified", () => {
  const result = buildExecutiveAssurance(rows, "2026-09-25");

  assert.equal(result.integrityCoverage, 0);
  assert.equal(result.verifiedEvidence, 0);
  assert.equal(result.integrityUnknownEvidence, 1);
  assert.equal(result.evidenceScore, 100);
});
