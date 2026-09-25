import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/dashboard-v9-executive.tsx", "utf8");

test("V9 excludes unassessed quick-intake risks from executive score averages", () => {
  assert.match(source, /import \{ splitRiskAssessmentState \} from "\.\/risk-methodology"/);
  assert.match(source, /const riskAssessment=splitRiskAssessmentState\(risks\)/);
  assert.match(source, /riskScores=riskAssessment\.assessed\.map\(row=>row\.riskScore\)/);
  assert.match(source, /unassessedRisks=riskAssessment\.unassessed\.length/);
  assert.doesNotMatch(source, /risks\.map\(row=>calculatedRiskScore\(row\.data\)\)/);
});

test("V9 exposes pending risk assessments without rewarding them as low risk", () => {
  assert.match(source, /data\.unassessedRisks} değerlendirme bekliyor/);
  assert.match(source, /data\.highRisks\|\|data\.unassessedRisks\?"watch":"healthy"/);
  assert.match(source, /data\.assessedRisks\?`\$\{data\.avgRisk}\/25`:"—"/);
  assert.match(source, /data\.assessedRisks} \{tr\?"değerlendirildi":"assessed"} · \{data\.unassessedRisks} \{tr\?"bekliyor":"pending"}/);
});

test("V9 risk domain is absent from composite health when no risk assessment is complete", () => {
  assert.match(source, /value:riskScores\.length\?clamp\(100-\(avgRisk\/25\)\*100\):null,weight:25/);
});
