import test from "node:test";
import assert from "node:assert/strict";
import { buildConnectedGrcGraph, type ConnectedGrcRow as Row } from "../app/connected-grc-model";
import { businessContext } from "../app/business-context";
import { riskMatrixEntries, evidenceRenewals } from "../app/executive-report-data";
import { validate } from "../app/core-record-validation";

const row=(id:string,module:string,data:Row["data"]):Row=>({id,module,data});
test("an asset, optional risk, BIA and plan are connected only by recorded references",()=>{
  const asset=row("AST-1","Varlık Envanteri",{title:"Cortex XDR",assetId:"INV-1234"});
  const risk=row("RSK-1","Risk Assessment",{asset:"INV-1234"}),extra=row("RSK-2","Risk Assessment",{});
  const bia=row("BIA-1","BIA",{asset:"Cortex XDR",process:"Endpoint response"});
  const plan=row("BCP-1","İş Sürekliliği",{kind:"continuity-plan",continuityBiaRef:"BIA-1"});
  const otherBia=row("BIA-2","BIA",{process:"Payment"}),otherPlan=row("BCP-2","İş Sürekliliği",{kind:"continuity-plan",continuityBiaRef:"BIA-2"});
  const rows=[asset,risk,extra,bia,plan,otherBia,otherPlan];
  const groups=(anchor:Row)=>businessContext(anchor,buildConnectedGrcGraph(rows).links).map(s=>s.nodes.map(n=>[n.row.id,...n.via.map(v=>v.id)]));
  assert.deepEqual(groups(risk),[[["AST-1"]],[["RSK-1"]],[["BIA-1","AST-1"]],[["BCP-1","AST-1","BIA-1"]]]);
  assert.deepEqual(groups(plan)[1],[["RSK-1","BIA-1","AST-1"]]);
  assert.deepEqual(groups(extra),[[],[["RSK-2"]],[],[]]);
  risk.data.processLink="BIA-1"; assert.deepEqual(groups(risk)[3],[["BCP-1","BIA-1"]]);
  rows.splice(rows.indexOf(risk),1);assert.deepEqual(groups(asset)[3],[["BCP-1","BIA-1"]]);
  rows.push(row("BIA-3","BIA",{process:"Endpoint response"}));plan.data.continuityBiaRef="Endpoint response";
  assert.deepEqual(groups(asset)[3],[]);
});
test("standalone assets are optional only by explicit risk scope",()=>{
  assert.ok(validate("Risk Assessment",{title:"Supplier concentration",owner:"Risk",riskScope:"organization"}).data);
  assert.ok(validate("Risk Assessment",{title:"Supplier concentration",owner:"Risk"}).error);
  assert.ok(validate("Risk Assessment",{title:"Supplier concentration",owner:"Risk",asset:"AST-001",riskScope:"organization"}).error);
});
test("renewals use the earliest expiry, UTC date inclusivity, unknown dates and actual records",()=>{
  const evidence=(id:string,data:Row["data"])=>row(id,"Kanıtlar",data);
  const days=evidenceRenewals([evidence("p",{expiresAt:"2026-11-08"}),evidence("t",{expiresAt:"2026-11-09"}),evidence("u",{freshUntil:"2026-11-09T08:00:00Z"}),evidence("f",{freshUntil:"2026-12-20",expiresAt:"2026-11-16"}),evidence("g",{expiresAt:"2026-11-16"}),evidence("l",{expiresAt:"2026-12-10"}),evidence("n",{}),evidence("bad",{expiresAt:"bad"})],Date.parse("2026-11-09T12:00:00Z"));
  assert.deepEqual([days.total,days.overdue,days.upcoming,days.later,days.undated],[8,2,3,1,2]);
  assert.equal(days.all.find(d=>d.day==="2026-11-16")?.rows.length,2);
  assert.equal(days.markers.length,3);
});
test("matrix counts use the effective impact, exclude unassessed risks and keep collisions",()=>{
  const risks=[row("a","Risk Assessment",{likelihood:3,impact:1,availabilityImpact:5}),row("b","Risk Assessment",{inherentLikelihood:3,inherentImpact:5}),row("c","Risk Assessment",{}),row("d","Risk Assessment",{likelihood:6,impact:4})];
  assert.deepEqual(riskMatrixEntries(risks).map(i=>[i.likelihood,i.impact,i.score]),[[3,5,15],[3,5,15]]);
});
