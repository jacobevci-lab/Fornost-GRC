import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const route=readFileSync("app/api/continuous-assurance/governance/route.ts","utf8");
const panel=readFileSync("app/continuous-assurance-governance.tsx","utf8");
const connected=readFileSync("app/connected-grc.tsx","utf8");

test("governance API enforces maker-checker for risk and exceptions",()=>{
 assert.match(route,/continuous_assurance_risk_reviews/);assert.match(route,/continuous_assurance_exceptions/);
 assert.match(route,/Maker-checker: review'u gönderen kişi onaylayamaz/);assert.match(route,/Maker-checker: exception talebini oluşturan kişi onaylayamaz/);
 assert.match(route,/applyApprovedResidualRisk/);assert.match(route,/assuranceExceptionStatus="active"/);
});

test("executive assurance panel exposes risk decisions exceptions and posture",()=>{
 assert.match(panel,/EXECUTIVE ASSURANCE · GOVERNANCE/);assert.match(panel,/Risk reviews required/);assert.match(panel,/Active exceptions/);assert.match(panel,/Risk Owner Reassessment/);
 assert.match(panel,/submit-risk-review/);assert.match(panel,/create-exception/);assert.match(panel,/review-risk/);assert.match(panel,/review-exception/);
});

test("Connected GRC mounts executive assurance governance below the work queue",()=>{
 assert.match(connected,/import ContinuousAssuranceGovernance/);assert.match(connected,/<ContinuousAssuranceWorkQueue/);assert.match(connected,/<ContinuousAssuranceGovernance lang=\{lang\}\/>/);
});
