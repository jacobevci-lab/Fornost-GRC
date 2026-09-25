import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const gate=readFileSync("app/audit-readiness-gate.tsx","utf8");
const css=readFileSync("app/audit-readiness-gate.css","utf8");

test("audit readiness loads live Continuous Assurance beside GRC evidence",()=>{
 assert.match(gate,/\/api\/continuous-assurance\/dashboard/);
 assert.match(gate,/Promise\.allSettled/);
 assert.match(gate,/setAssuranceDashboard/);
 assert.match(gate,/scopedPriorities/);
 assert.match(gate,/targetControlRef/);
});

test("only Continuous Assurance signals mapped to in-scope audit controls affect the gate",()=>{
 assert.match(gate,/new Set\(assurance\.requirements\.map\(item=>normalized\(item\.reference\)\)/);
 assert.match(gate,/refs\.has\(normalized\(item\.targetControlRef\)\)/);
 assert.match(gate,/blockingStates=new Set\(\["integrity-failed","failing","failed-retest","retest-error","overdue-remediation"\]\)/);
 assert.match(gate,/assuranceBlockers\.length\?"not-ready"/);
 assert.match(gate,/assurance\.gate==="ready"&&scopedPriorities\.length\?"attention"/);
});

test("audit blockers drill into the exact live control rule or automation finding",()=>{
 assert.match(gate,/function priorityBlocksAudit/);
 assert.match(gate,/priority\.kind==="finding"&&priority\.findingId/);
 assert.match(gate,/filter:\{findingRef:priority\.findingId\}/);
 assert.match(gate,/filter:\{ruleRef:priority\.ruleId\}/);
 assert.match(gate,/filter:\{controlRef:priority\.targetControlRef\}/);
 assert.match(gate,/source:"audit-readiness-assurance"/);
});

test("audit readiness UI distinguishes evidence readiness from live assurance blockers",()=>{
 assert.match(gate,/kanıt hazırlığı/);
 assert.match(gate,/Continuous Assurance engeli çözülmeli/);
 assert.match(gate,/Live assurance signals for in-scope controls/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/\.audit-readiness-assurance/);
 assert.match(css,/\.assurance-blocker>i/);
});
