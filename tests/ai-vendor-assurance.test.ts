import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateVendorAssurance,
  validateVendorAssessment,
  vendorReviewState,
} from "../app/ai/vendor-assurance";
const complete = {
  modelId: "AIM-1",
  serviceName: "Enterprise AI",
  legalEntity: "AI Vendor Ltd",
  serviceOwner: "owner@example.com",
  dataLocations: "EU",
  subprocessors: "Cloud host",
  certifications: "ISO 27001, SOC 2",
  sla: "99.9 percent availability",
  exitPlan: "Export all data and verify deletion",
  contractEnd: "2028-01-01",
  reviewDate: "2027-06-01",
  breachHours: 24,
  dpa: true,
  trainingOptOut: true,
  deletionCommitment: true,
  auditRights: true,
  securityExhibit: true,
  bcdr: true,
  subprocessorNotice: true,
  dataPortability: true,
};
test("AI vendor assurance scores complete and incomplete control sets", () => {
  assert.deepEqual(calculateVendorAssurance(complete), {
    score: 100,
    gaps: [],
    criticalGaps: [],
    tier: "Low",
  });
  const result = calculateVendorAssurance({
    ...complete,
    dpa: false,
    breachHours: 96,
  });
  assert.equal(result.tier, "High");
  assert.deepEqual(result.criticalGaps, ["dpa", "breachNotification"]);
});
test("AI vendor validation bounds dates and breach notification SLA", () => {
  assert.equal(validateVendorAssessment(complete).score, 100);
  assert.throws(
    () => validateVendorAssessment({ ...complete, breachHours: 169 }),
    /1–168/,
  );
  assert.throws(
    () => validateVendorAssessment({ ...complete, reviewDate: "2027-02-30" }),
    /tarihleri/,
  );
  assert.throws(
    () => validateVendorAssessment({ ...complete, exitPlan: "none" }),
    /zorunludur/,
  );
});
test("vendor reassessment queue is deterministic", () => {
  assert.equal(
    vendorReviewState("approved", "2027-01-15", "2027-02-01"),
    "overdue",
  );
  assert.equal(
    vendorReviewState("approved", "2027-02-15", "2027-02-01"),
    "due-soon",
  );
  assert.equal(
    vendorReviewState("approved", "2027-06-01", "2027-02-01"),
    "current",
  );
  assert.equal(
    vendorReviewState("suspended", "2027-06-01", "2027-02-01"),
    "suspended",
  );
});
test("AI vendor API enforces model binding, critical gates and accepted exception", async () => {
  const [route, migration, storage, ui, copilot, layout] = await Promise.all([
    readFile("app/api/ai/vendor-assurance/route.ts", "utf8"),
    readFile("drizzle/0049_fornost_ai_vendor_assurance.sql", "utf8"),
    readFile("app/ai/storage.ts", "utf8"),
    readFile("app/fornost-ai-vendor-assurance.tsx", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(route, /Risk istisnası bu AI modeline ait değil/);
  assert.match(route, /Kritik güvence açıkları giderilmeden/);
  assert.match(route, /Risk istisnası kabul edilmiş ve geçerli olmalıdır/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(migration, /ai_vendor_model_status_idx/);
  assert.match(storage, /aiVendorAssessmentsSql/);
  assert.match(ui, /AI Sağlayıcı Güvence Merkezi/);
  assert.match(ui, /role !== "Viewer"/);
  assert.match(copilot, /AI Tedarikçi/);
  assert.match(layout, /fornost-ai-vendor-assurance\.css/);
});
