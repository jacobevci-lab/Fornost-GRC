import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectedGrcGraph, type ConnectedGrcRow } from "../app/connected-grc-model";
import { buildConnectedGrcEnterpriseRows } from "../app/connected-grc-sources";
import { buildContinuousAssuranceChains } from "../app/continuous-assurance-chain";
import { connectedGrcAssuranceExport } from "../app/connected-grc-export";

const scope = {ready:8,total:8,loading:false,generatedAt:"2026-10-12T06:00:00Z"};
function fixture() {
  const rows: ConnectedGrcRow[] = [{id:"CONTROL-1",code:"CTL-1",module:"Kontroller",data:{title:"Access control"}}, ...buildConnectedGrcEnterpriseRows({evidenceAutomation:{
    rules:Array.from({length:25},(_,i)=>({id:`RULE-${i}`,name:`Rule ${i}`,controlRefs:i===0?"CONTROL-1;MISSING-CONTROL":"CONTROL-1",health:"healthy",freshness:"fresh"})),
  }})];
  const graph=buildConnectedGrcGraph(rows);
  return buildContinuousAssuranceChains(rows,graph.links,undefined,graph.unresolved);
}
test("assurance exports all rules including healthy rows beyond the follow-up preview limit",()=>{
  const report=connectedGrcAssuranceExport(fixture(),scope,"en")!;
  assert.equal(report.filename,"fornost-connected-grc-assurance.csv");
  assert.equal(report.content.split("\n").length,26);
  assert.ok(report.content.includes('"Rule 24"'));
  assert.ok(report.content.includes('"loaded";"8";"8";"25";"2026-10-12T06:00:00Z";"en"'));
  assert.ok(report.content.includes('"effective";"100";"broken"'));
  assert.ok(report.content.includes('"effective";"100";"complete"'));
  assert.ok(report.content.includes('""id"":""CONTROL-1""'));
});
test("assurance export blocks pending, partial and invalid source scopes",()=>{
  for(const overrides of [{loading:true},{ready:7},{ready:9},{total:0,ready:0},{total:1.5,ready:1.5},{total:NaN,ready:NaN}]) {
    assert.equal(connectedGrcAssuranceExport(fixture(),{...scope,...overrides},"en"),null);
  }
});
test("empty assurance export retains source context without claiming effectiveness",()=>{
  const report=connectedGrcAssuranceExport([],scope,"tr")!;
  assert.ok(report.content.includes('"no-rules"'));
  assert.ok(report.content.includes('"loaded";"8";"8";"0"'));
  assert.ok(!report.content.includes('"effective"'));
  assert.equal(report.content.split("\n").length,2);
  assert.equal(report.content.split("\n")[0].split(";").length,report.content.split("\n")[1].split(";").length);
});
test("assurance export preserves translated explanations and neutralizes spreadsheet formulas",()=>{
  const chains=fixture();
  chains[0].rule.data.title='  =SUM(1;2)\n"quoted"';
  const tr=connectedGrcAssuranceExport(chains,scope,"tr")!.content;
  const en=connectedGrcAssuranceExport(chains,scope,"en")!.content;
  assert.ok(tr.includes("Kontrol referansı bulunamadı veya birden fazla kayıtla eşleşiyor"));
  assert.ok(en.includes("Control reference is missing or ambiguous"));
  assert.ok(tr.includes("control-reference-unresolved"));
  assert.ok(tr.includes('"\'  =SUM(1;2)\n""quoted"""'));
});
