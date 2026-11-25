import assert from "node:assert/strict";
import test from "node:test";
import {
  assessedRiskScore,
  calculatedRiskScore,
  isRiskAssessed,
  splitRiskAssessmentState,
} from "../app/risk-methodology";

test("quick-intake risks remain explicitly unassessed instead of becoming low risk", () => {
  const intake = { title: "Payment API riski", owner: "Security", asset: "Payment API" };
  assert.equal(calculatedRiskScore(intake), 0);
  assert.equal(isRiskAssessed(intake), false);
  assert.equal(assessedRiskScore(intake), null);
});

test("completed assessment is scored normally", () => {
  const assessed = { inherentLikelihood: 4, inherentImpact: 5 };
  assert.equal(isRiskAssessed(assessed), true);
  assert.equal(assessedRiskScore(assessed), 20);
});

test("risk posture can separate assessed and pending-assessment populations", () => {
  const rows = [
    { id: "r1", data: { title: "Intake only", owner: "A", asset: "X" } },
    { id: "r2", data: { title: "Assessed", inherentLikelihood: 3, inherentImpact: 4 } },
  ];
  const state = splitRiskAssessmentState(rows);
  assert.equal(state.unassessed.length, 1);
  assert.equal(state.assessed.length, 1);
  assert.equal(state.assessed[0].riskScore, 12);
});
