import test from "node:test";
import assert from "node:assert/strict";
import {biaCoreFields,biaSections,biaDate,biaImpact,mtpdWarning,sodWarning,sameBiaPerson} from "../app/bia-assessment";
import {validate} from "../app/core-record-validation";
import {newCoreReferences,coreWriteGuard} from "../app/core-reference-write";
import {fields} from "../app/register-view-schema";
import {DatabaseSync} from "node:sqlite";
const base={process:"Payments",owner:"A",asset:"AST-001",criticality:"High",businessUnit:"Ops",rto:"0.5",rpo:0,mtpd:"0.5"};
test("BIA fields occur once and ratings preserve unassessed dimensions",()=>{
  const keys=[...biaCoreFields,...biaSections.flatMap(g=>g.fields)];
  assert.deepEqual(keys.sort(),[...fields.BIA].sort());
  assert.deepEqual(biaImpact({}),{count:0,highest:null,average:null});
  assert.deepEqual(biaImpact({financial:"5",legal:"2",operational:""}),{count:2,highest:5,average:3.5});
  assert.equal(biaDate("2026-11-22"),"22.11.2026");assert.equal(biaDate("2026-11-22","MM/DD/YYYY"),"11/22/2026");
});
test("BIA enforces recovery hours and independent directory identities on every write",()=>{
  assert.ok(validate("BIA",base).data);
  assert.ok(validate("BIA",{...base,mtpd:null}).data);
  assert.equal(validate("BIA",{...base,rto:"2"}).error,mtpdWarning.tr);
  for(const invalid of [-1,"unknown",false])assert.ok(validate("BIA",{...base,mtpd:invalid}).error);
  assert.equal(validate("BIA",{...base,approver:" a "}).error,sodWarning.tr);
  assert.ok(sameBiaPerson({owner:"Ali",ownerEmail:"Ali@example.com",approver:"ALI@EXAMPLE.COM"}));
  assert.ok(sameBiaPerson({owner:"Before",approver:"After",ownerEmail:"p@x.com",approverEmail:"P@X.COM"}));
  assert.equal(sameBiaPerson({owner:"Lee",approver:"Lee",ownerEmail:"a@b.co",approverEmail:"b@b.co"}),false);
  const db=new DatabaseSync(":memory:");try{
    db.exec("CREATE TABLE local_users(name,email,status); INSERT INTO local_users VALUES ('Reviewer','b@b.co','Active')");
    const guard=(email:string)=>coreWriteGuard("BIA",[{id:"b",data:{owner:base.owner,approver:"Reviewer",approverEmail:email}}]);
    for(const [email,ok] of [["b@b.co",true],["unknown@b.co",false]] as const){const g=guard(email);assert.equal(Boolean(db.prepare("SELECT 1 WHERE "+g.sql).get(...g.values)),ok);}
    const legacy=coreWriteGuard("BIA",[{id:"b",data:{owner:"Reviewer",approver:"b@b.co"}}]);
    assert.equal(db.prepare("SELECT 1 WHERE "+legacy.sql).get(...legacy.values),undefined);
  }finally{db.close();}
  assert.deepEqual(newCoreReferences("b","BIA",{technologyRefs:["AST-003"],supplierRefs:["VEN-001"]}).map(r=>r.modules),[["Varlık Envanteri"],["Tedarikçiler"]]);
});
