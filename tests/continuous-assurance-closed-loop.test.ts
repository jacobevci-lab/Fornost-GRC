import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildResidualRiskReassessment } from "../app/continuous-assurance-runtime";

const route = readFileSync("app/api/continuous-assurance/route.ts", "utf8");
const promotion = readFileSync("app/findings/promotion.ts", "utf8");
const queueUi = readFileSync("app/continuous-assurance-work-queue.tsx", "utf8");

test("successful re-test preserves an already approved residual rating", () => {
  const result = buildResidualRiskReassessment({ inherentLikelihood: "4", inherentImpact: "5", residualLikelihood: "2", residualImpact: "5" }, "pass", "RUN-1", "2026-09-21T12:00:00.000Z");
  assert.equal(result.residualLikelihood, "2");
  assert.equal(result.residualImpact, "5");
  assert.equal(result.residualScore, "10");
  assert.equal(result.residualRiskLevel, "Yüksek");
  assert.equal(result.assuranceState, "effective");
  assert.equal(result.residualRiskReviewRequired, false);
  assert.equal(result.riskReviewRequestedAt, "");
  assert.equal(result.lastAssuranceRunRef, "RUN-1");
});

test("successful re-test never invents a residual reduction when no approved rating exists", () => {
  const result = buildResidualRiskReassessment({ inherentLikelihood: "4", inherentImpact: "5" }, "pass", "RUN-1B", "2026-09-21T12:10:00.000Z");
  assert.equal(result.residualLikelihood, "4");
  assert.equal(result.residualImpact, "5");
  assert.equal(result.residualScore, "20");
  assert.equal(result.residualRiskReviewRequired, true);
  assert.equal(result.riskReviewRequestedAt, "2026-09-21T12:10:00.000Z");
  assert.match(String(result.reassessmentReason), /no approved residual rating/i);
});

test("failed re-test restores residual exposure and preserves the original review aging start", () => {
  const result = buildResidualRiskReassessment({ inherentLikelihood: "4", inherentImpact: "4", residualLikelihood: "2", residualImpact: "3", residualRiskReviewRequired: true, riskReviewRequestedAt: "2026-09-10T09:00:00.000Z" }, "fail", "RUN-2", "2026-09-21T13:00:00.000Z");
  assert.equal(result.residualLikelihood, "4");
  assert.equal(result.residualImpact, "4");
  assert.equal(result.residualScore, "16");
  assert.equal(result.residualRiskLevel, "Kritik");
  assert.equal(result.assuranceState, "ineffective");
  assert.equal(result.residualRiskReviewRequired, true);
  assert.equal(result.riskReviewRequestedAt, "2026-09-10T09:00:00.000Z");
});

test("re-test execution errors do not claim a risk reduction", () => {
  const result = buildResidualRiskReassessment({ inherentLikelihood: "5", inherentImpact: "4", residualLikelihood: "3", residualImpact: "4" }, "error", "RUN-3", "2026-09-21T14:00:00.000Z");
  assert.equal(result.residualLikelihood, "3");
  assert.equal(result.residualScore, "12");
  assert.equal(result.assuranceState, "degraded");
  assert.equal(result.residualRiskReviewRequired, true);
  assert.equal(result.riskReviewRequestedAt, "2026-09-21T14:00:00.000Z");
});

test("work queue review is Admin-only and enforces maker-checker separation", () => {
  assert.match(route, /action==="review-work-item"\?\["Admin"\]/);
  assert.match(route, /Maker-checker: işi kuyruğa alan kullanıcı aynı işi onaylayamaz/);
  assert.match(route, /approved-awaiting-retest/);
  assert.match(route, /status='rejected'/);
});

test("GET reconciliation closes approved re-tests and reassesses linked risk", () => {
  assert.match(route, /reconcileApprovedRetests\(env\.DB\)/);
  const runtime = readFileSync("app/continuous-assurance-runtime.ts", "utf8");
  assert.match(runtime, /evidence_automation_runs WHERE rule_id=\? AND created_at>\?/);
  assert.match(runtime, /failed-retest/);
  assert.match(runtime, /retest-error/);
  assert.match(runtime, /buildResidualRiskReassessment/);
  assert.match(runtime, /riskReviewRequestedAt/);
  assert.match(runtime, /residualRiskReviewRequired/);
  assert.match(runtime, /status='acknowledged'/);
});

test("approved CAPA promotion creates a canonical Connected GRC finding with immutable origin evidence and system detection lineage", () => {
  assert.match(route, /promoteContinuousAssuranceFinding\(env\.DB,candidate,access\.actor\.email,work\.actor,work\.id/);
  assert.match(promotion, /enterprise_findings/);
  assert.match(promotion, /continuous-assurance-promotion/);
  assert.match(promotion, /originEvidenceReference/);
  assert.match(promotion, /originEvidenceSha256/);
  assert.match(promotion, /system:continuous-assurance/);
  assert.match(promotion, /queued by \$\{queueActor\}; approved by \$\{approvalActor\}/);
  assert.match(promotion, /source_type='continuous-control'/);
  assert.match(promotion, /source_ref=\? AND control_ref=\?/);
  assert.match(promotion, /status NOT IN \('closed','accepted'\)/);
  assert.match(promotion, /validateFinding\(candidate\.payload, today\)/);
});

test("Connected GRC queue exposes approval and rejection controls only after role discovery", () => {
  assert.match(queueUi, /fetch\(withBasePath\("\/api\/auth"\)/);
  assert.match(queueUi, /setCanReview\(auth\?\.user\?\.role==="Admin"\)/);
  assert.match(queueUi, /decision:"approve"/);
  assert.match(queueUi, /decision:"reject"/);
  assert.match(queueUi, /Run Re-test/);
});
