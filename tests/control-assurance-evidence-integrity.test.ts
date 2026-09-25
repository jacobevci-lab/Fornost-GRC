import assert from "node:assert/strict";
import test from "node:test";
import { buildControlAssurance, type AssuranceRow } from "../app/control-assurance";

function assuranceRows(integrity: string): AssuranceRow[] {
  return [
    {
      id: "control-integrity",
      code: "CTL-INTEGRITY",
      module: "Kontroller",
      data: {
        controlRef: "CTL-INTEGRITY",
        controlTitle: "Evidence integrity control",
        owner: "Security",
        testOwner: "Internal Audit",
        nextTestDate: "2027-01-15",
        status: "Aktif",
      },
    },
    {
      id: "evidence-integrity",
      code: "EVD-INTEGRITY",
      module: "Kanıtlar",
      data: {
        controlRef: "CTL-INTEGRITY",
        evidenceTitle: "Quarterly assurance evidence",
        owner: "Security",
        status: "Onaylandı",
        expiresAt: "2027-03-01",
        evidenceIntegrity: integrity,
      },
    },
    {
      id: "audit-integrity",
      code: "AUD-INTEGRITY",
      module: "Denetim Yönetimi",
      data: { controlRef: "CTL-INTEGRITY", status: "Tamamlandı" },
    },
  ];
}

test("broken evidence lineage makes the linked control critical and non-current", () => {
  const result = buildControlAssurance(assuranceRows("broken"), "2026-09-25");
  const item = result.items[0];

  assert.equal(item.brokenEvidenceCount, 1);
  assert.equal(item.verifiedEvidenceCount, 0);
  assert.equal(item.currentEvidenceCount, 0);
  assert.ok(item.reasons.includes("evidence-integrity-broken"));
  assert.equal(item.state, "critical");
  assert.ok(item.score <= 45);
  assert.equal(result.integrityFailures, 1);
  assert.equal(result.verifiedEvidenceControls, 0);
});

test("verified evidence lineage contributes current trusted evidence without a penalty", () => {
  const result = buildControlAssurance(assuranceRows("verified"), "2026-09-25");
  const item = result.items[0];

  assert.equal(item.verifiedEvidenceCount, 1);
  assert.equal(item.brokenEvidenceCount, 0);
  assert.equal(item.currentEvidenceCount, 1);
  assert.equal(item.score, 100);
  assert.equal(item.state, "healthy");
  assert.equal(result.verifiedEvidenceControls, 1);
  assert.equal(result.integrityFailures, 0);
  assert.ok(!item.reasons.includes("evidence-integrity-broken"));
});

test("unavailable integrity verification is visible but does not falsely downgrade assurance", () => {
  const result = buildControlAssurance(assuranceRows("unavailable"), "2026-09-25");
  const item = result.items[0];

  assert.equal(item.unavailableEvidenceCount, 1);
  assert.equal(item.currentEvidenceCount, 1);
  assert.equal(item.score, 100);
  assert.equal(item.state, "healthy");
  assert.ok(item.reasons.includes("evidence-integrity-unavailable"));
  assert.equal(result.integrityUnknownControls, 1);
  assert.equal(result.integrityFailures, 0);
});

test("legacy evidence stays usable but carries an explicit assurance penalty", () => {
  const result = buildControlAssurance(assuranceRows("legacy-unverified"), "2026-09-25");
  const item = result.items[0];

  assert.equal(item.legacyEvidenceCount, 1);
  assert.equal(item.currentEvidenceCount, 1);
  assert.equal(item.score, 90);
  assert.equal(item.state, "healthy");
  assert.ok(item.reasons.includes("evidence-integrity-legacy"));
  assert.equal(result.legacyEvidenceControls, 1);
});
