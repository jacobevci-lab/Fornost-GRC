import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateImpact,
  impactReviewState,
  validateImpactAssessment,
} from "../app/ai/impact-assessment";
const controls = {
  privacy: 3,
  fundamentalRights: 3,
  safety: 2,
  workforce: 2,
  vulnerableGroups: 2,
  autonomy: 2,
  scale: 3,
  controlMaturity: 4,
  personalData: true,
  specialCategoryData: false,
  automatedDecision: false,
  children: false,
  hasTransparency: true,
  hasHumanOversight: true,
  hasAppeal: true,
  dpoConsulted: true,
};
test("AI impact scoring applies exposure modifiers and control maturity", () => {
  const low = calculateImpact(controls),
    high = calculateImpact({
      ...controls,
      specialCategoryData: true,
      automatedDecision: true,
      children: true,
      controlMaturity: 1,
      hasHumanOversight: false,
      hasAppeal: false,
    });
  assert.ok(high.inherent > low.inherent);
  assert.ok(high.residual > low.residual);
  assert.deepEqual(high.criticalGaps, ["humanOversight", "appealMechanism"]);
});
test("DPIA and FRIA validation requires privacy ownership and complete rationale", () => {
  const input = {
    modelId: "AIM-1",
    type: "Combined",
    title: "Customer support impact",
    context: "AI assists support analysts",
    affectedGroups: "Customers and employees",
    jurisdictions: "TR, EU",
    necessity: "Reduce response time while retaining human review",
    proportionality: "Advisory output only with narrow data scope",
    mitigations: "DLP, RBAC, human approval and appeal route",
    monitoringPlan: "Monthly bias, privacy and quality review",
    consultation: "DPO and worker representatives",
    owner: "product@example.com",
    dpo: "privacy@example.com",
    reviewDate: "2027-06-01",
    ...controls,
  };
  assert.equal(validateImpactAssessment(input).type, "Combined");
  assert.throws(() => validateImpactAssessment({ ...input, dpo: "" }), /DPO/);
  assert.throws(
    () => validateImpactAssessment({ ...input, privacy: 6 }),
    /1–5/,
  );
  assert.throws(
    () => validateImpactAssessment({ ...input, reviewDate: "2027-02-30" }),
    /eksiksiz/,
  );
});
test("impact reassessment state detects approaching and overdue reviews", () => {
  assert.equal(
    impactReviewState("approved", "2027-01-01", "2027-02-01"),
    "overdue",
  );
  assert.equal(
    impactReviewState("approved", "2027-02-20", "2027-02-01"),
    "due-soon",
  );
  assert.equal(
    impactReviewState("approved", "2027-06-01", "2027-02-01"),
    "current",
  );
});
test("impact API enforces maker-checker, critical gaps, exception binding and release gate", async () => {
  const [route, migration, storage, ui, copilot, release, layout] =
    await Promise.all([
      readFile("app/api/ai/impact-assessment/route.ts", "utf8"),
      readFile("drizzle/0052_fornost_ai_impact_assessment.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-impact-assessment.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
      readFile("app/layout.tsx", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı değerlendirmeyi onaylayamaz/);
  assert.match(route, /Kritik açık veya yüksek artık etki/);
  assert.match(route, /Bağlı risk istisnası kabul edilmiş/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(migration, /ai_impact_model_status_idx/);
  assert.match(storage, /aiImpactAssessmentsSql/);
  assert.match(ui, /AI Etki Değerlendirmesi Merkezi/);
  assert.match(copilot, /AI Etki/);
  assert.match(release, /ai_impact_assessments/);
  assert.match(layout, /fornost-ai-impact-assessment\.css/);
});
