import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const route=readFileSync("app/api/continuous-assurance/governance/route.ts","utf8");
const panel=readFileSync("app/continuous-assurance-governance.tsx","utf8");
const css=readFileSync("app/continuous-assurance-governance.css","utf8");
const connected=readFileSync("app/connected-grc.tsx","utf8");

test("governance API enforces maker-checker for risk and exceptions",()=>{
 assert.match(route,/continuous_assurance_risk_reviews/);assert.match(route,/continuous_assurance_exceptions/);
 assert.match(route,/Maker-checker: review'u gönderen kişi onaylayamaz/);assert.match(route,/Maker-checker: exception talebini oluşturan kişi onaylayamaz/);
 assert.match(route,/applyApprovedResidualRisk/);assert.match(route,/assuranceExceptionStatus="active"/);
 assert.match(route,/Süresi geçmiş exception onaylanamaz/);
});

test("governance resolves visible risk references without exposing database ids as the workflow contract",()=>{
 assert.match(route,/json_extract\(data_json,'\$\.riskId'\)=\?/);
 assert.match(route,/json_extract\(data_json,'\$\.code'\)=\?/);
 assert.match(route,/ORDER BY CASE WHEN id=\? THEN 0 ELSE 1 END LIMIT 1/);
 assert.match(route,/riskRef=String\(item\.data\.riskId\|\|item\.data\.code\|\|`RSK-\$\{item\.id\.slice\(0,6\)\.toUpperCase\(\)\}`\)/);
 assert.match(route,/bind\(JSON\.stringify\(data\),stamp,risk\.id\)/);
 assert.match(route,/bind\(JSON\.stringify\(updated\),stamp,risk\.id\)/);
});

test("expired and revoked exceptions require re-test and risk-owner reassessment",()=>{
 assert.match(route,/retest_required/);assert.match(route,/queueMandatoryRetest/);assert.match(route,/reconcileExpiredExceptions/);
 assert.match(route,/source:"assurance-exception"/);assert.match(route,/mandatory:true/);assert.match(route,/markRiskForReview/);
 assert.match(route,/residualRiskReviewRequired=true/);assert.match(route,/riskReviewRequestedAt/);assert.match(route,/revoke-exception/);
});

test("executive assurance panel exposes aging escalation exception lifecycle and 30-day trend",()=>{
 assert.match(panel,/EXECUTIVE ASSURANCE · GOVERNANCE/);assert.match(panel,/Risk reviews required/);assert.match(panel,/Overdue risk reviews/);assert.match(panel,/Mandatory re-tests/);assert.match(panel,/30-Day Governance Trend/);assert.match(panel,/RISK OWNER REASSESSMENT/);
 assert.match(panel,/reviewAgeDays/);assert.match(panel,/reviewUrgency/);assert.match(panel,/retestRequired/);assert.match(panel,/revoke-exception/);
 assert.match(panel,/submit-risk-review/);assert.match(panel,/create-exception/);assert.match(panel,/review-risk/);assert.match(panel,/review-exception/);
});

test("assurance governance rows deep-link to the exact governed risk control rule and finding",()=>{
 assert.match(panel,/import \{navigateToFornost\} from "\.\/navigation-focus"/);
 assert.match(panel,/module:"Risk Assessment"/);assert.match(panel,/filter:\{riskRef:value\}/);
 assert.match(panel,/module:"Kontroller"/);assert.match(panel,/filter:\{controlRef:value\}/);
 assert.match(panel,/module:"Kanıt Otomasyonu"/);assert.match(panel,/filter:\{ruleRef:value\}/);assert.match(panel,/filter:\{findingRef:value\}/);
 assert.match(panel,/openRisk\(x\.riskRef\)/);assert.match(panel,/openControl\(x\.controlRef\)/);assert.match(panel,/openRule\(x\.ruleId\)/);assert.match(panel,/openFinding\(x\.findingId\)/);
 assert.match(panel,/Riski Aç/);assert.match(panel,/Open Risk/);
});

test("governance action groups wrap and stack on narrow screens",()=>{
 assert.match(css,/\.ag-row>div\{display:flex;flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end;gap:5px\}/);
 assert.match(css,/@media\(max-width:620px\)[\s\S]*\.ag-row\{align-items:flex-start;flex-direction:column\}/);
 assert.match(css,/\.ag-row>div\{width:100%;justify-content:flex-start\}/);
});

test("Connected GRC mounts executive assurance governance below the work queue",()=>{
 assert.match(connected,/import ContinuousAssuranceGovernance/);assert.match(connected,/<ContinuousAssuranceWorkQueue/);assert.match(connected,/<ContinuousAssuranceGovernance lang=\{lang\}\/>/);
});
