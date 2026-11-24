import assert from "node:assert/strict";
import test from "node:test";
import { dashboardCode, frameworkPortfolio, priorityActions } from "../app/dashboard-actions";
import { riskMatrixEntries } from "../app/executive-report-data";
import type { AssuranceRow } from "../app/control-assurance";
import type { Overview } from "../app/framework-posture/types";

const now = Date.parse("2026-11-21T12:00:00Z");
const row = (id: string, module: string, data: AssuranceRow["data"], code = id): AssuranceRow => ({id, module, code, data});
const coverage = (scope: number, compliant: number, assessed = scope) => ({scope, compliant, assessed, evidenced: compliant});
function overview(values: Overview["coverage"]): Overview {
  return {enrolled: Object.keys(values), coverage: values, comparison: {}, controlFrameworkCounts: {}, controlFrameworks: {}, catalog: []};
}

test("compliance weights only enrolled frameworks by scope and distinguishes enrollment from assessment", () => {
  const sample = overview({ISO: coverage(10, 5), SOC: coverage(2, 2)});
  sample.coverage.inactive = coverage(100, 0);
  const result = frameworkPortfolio(sample)!;
  assert.equal(result.count, 2);
  assert.equal(result.score, 7 / 12 * 100);
  assert.deepEqual(result.lowest, {name: "ISO", rate: 0.5});
  assert.equal(frameworkPortfolio(overview({ISO: coverage(10, 0, 0)}))?.score, null);
  assert.equal(frameworkPortfolio(overview({ISO: coverage(10, 0, 2)}))?.score, 0);
  assert.equal(frameworkPortfolio(overview({}))?.score, null);
  delete sample.coverage.SOC;
  assert.deepEqual(frameworkPortfolio(sample), {count: 2, scope:null, compliant:null, score:null, lowest:null});
  assert.equal(frameworkPortfolio(undefined), null);
});

test("queue merges review and renewal on one record and preserves direct references and missing dates", () => {
  const records = [
    row("e", "Kanıtlar", {title:"Access review",expiresAt:"2026-11-22",status:"İncelemede",owner:"Security"}, "EVD-011"),
    row("u", "Kanıtlar", {expiresAt:"invalid"}),
    row("a", "Denetim Yönetimi", {dueDate:"2026-11-19", status:"Open"}, "AUD-046"),
    row("closed", "Denetim Yönetimi", {dueDate:"2026-11-12", status:"Completed"}),
  ];
  const findings = [row("f", "Bulgular ve CAPA", {title:"Access drift",status:"verification", reviewer:"Reviewer",dueDate:"2026-11-20"},"FND-12")];
  const {actions,undated} = priorityActions(records, findings, [], now);
  assert.equal(undated,1);
  assert.deepEqual(actions.map(action=>action.id),["a","f","e"]);
  assert.deepEqual(actions[1].groups,["findings","approvals"]);
  assert.equal(actions[1].owner,"Reviewer");
  assert.equal(actions[0].owner,"—");
  assert.equal(actions[2].code,"EVD-011");
  assert.equal(actions[2].target.ref,"e");
  assert.deepEqual(actions[2].groups,["approvals","renewals"]);
});

test("colliding assessed risks keep separate public codes and stable deep links", () => {
  const id = "RSK-2aa81772-ba66-4202-868b-8213da92fc85";
  const risks = [row(id,"Risk Assessment",{likelihood:5,impact:5},"RSK-004"),
    row("r2","Risk Assessment",{likelihood:5,impact:5},"RSK-005"), row("u","Risk Assessment",{likelihood:5})];
  const entries = riskMatrixEntries(risks);
  assert.deepEqual(entries.map(r=>[r.likelihood,r.impact]),[[5,5],[5,5]]);
  assert.deepEqual(entries.map(r=>dashboardCode(r.row)).sort(),["RSK-004","RSK-005"]);
  assert.equal(dashboardCode({...risks[0],code:undefined}),"—");
});
