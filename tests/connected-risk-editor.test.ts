import test from "node:test";
import assert from "node:assert/strict";
import { riskRecordOptions, riskAssetCaption, riskTitle } from "../app/risk-record-options";
import { effectiveImpactSources, assessedResidualRiskScore } from "../app/risk-methodology";
import { validate } from "../app/core-record-validation";
import { preserveRiskGovernance } from "../app/risk-governance-write";
import { scopedApiAllowed } from "../app/module-access";

const base={title:"Cloud exposure",owner:"Team",riskScope:"organization"};
const asset={id:"AST-12345678-abcd-4abc-8abc-123456789abc",code:"AST-663",module:"Varlık Envanteri",data:{title:"QA-CLOUD Varlık",assetId:"old-cloud"}};
test("the register resolves saved codes, legacy IDs and aliases without guessing ambiguous targets",()=>{
 const catalog=riskRecordOptions([asset,{...asset,id:"another",code:"AST-664"}],"Varlık Envanteri");
 assert.equal(riskAssetCaption(asset.id,catalog,true),"QA-CLOUD Varlık · AST-663");
 assert.equal(riskAssetCaption(asset.code,catalog,true),"QA-CLOUD Varlık · AST-663");
 assert.equal(catalog.resolve("old-cloud"),null);
 assert.equal(riskTitle({id:"r1",code:"RSK-026",module:"Risk Assessment",data:{title:"RSK-026 · Cloud exposure"}}),"Cloud exposure");
});
test("residual assessment respects incomplete axes, validation and approved decisions",()=>{
 for(const v of [0,6,1.5,true,{}]) assert.ok(validate("Risk Assessment",{...base,residualLikelihood:v}).error);
 assert.equal(assessedResidualRiskScore({residualScore:"18",residualImpact:3}),null);
 assert.equal(validate("Risk Assessment",{...base,residualImpact:"4",residualLikelihood:"3",residualScore:"25"}).data?.residualScore,"12");
 const stored={...base,residualRiskReviewRequired:true,residualLikelihood:"3",residualImpact:"4",residualScore:"12"};
 const protectedData=preserveRiskGovernance({...stored,residualLikelihood:"1"},stored);
 assert.equal(validate("Risk Assessment",protectedData).data?.residualLikelihood,"3");
 assert.deepEqual(effectiveImpactSources({impact:3,inherentImpact:3,integrityImpact:3}),["inherentImpact","integrityImpact"]);
});
test("risk contact search is restricted to risk writers",()=>{
 const endpoint="/api/grc/risk-owners";
 for(const grant of ["read","write"] as const){
   const user={role:"Editor",moduleAccess:{mode:"scoped" as const,modules:{"Risk Assessment":grant}}};
   assert.equal(scopedApiAllowed(user,endpoint,"GET"),grant==="write");
   assert.equal(scopedApiAllowed(user,endpoint,"POST"),false);
 }
});

test("saving a changed directory assignment requires the current active name and email", async()=>{
 const {DatabaseSync}=await import("node:sqlite");
 const {coreWriteGuard}=await import("../app/core-reference-write");
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE local_users(name TEXT,email TEXT,status TEXT); INSERT INTO local_users VALUES('Risk Owner','risk@example.test','Active')");
  const data={ownerSource:"directory",owner:"Risk Owner",ownerEmail:"risk@example.test"};
  const guard=coreWriteGuard("Risk Assessment",[{id:"risk",data}]);
  const current=()=>db.prepare("SELECT 1 WHERE "+guard.sql).get(...guard.values);
  assert.ok(current());db.exec("UPDATE local_users SET status='Inactive'");assert.equal(current(),undefined);
  assert.equal(coreWriteGuard("Risk Assessment",[{id:"risk",data,before:data}]).sql,"1");
 }finally{db.close();}
});
