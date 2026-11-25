import assert from "node:assert/strict";
import test from "node:test";
import { assetCoreFields, assetFieldGroups, assetLinkedRecords, assetCoverage } from "../app/asset-inventory-model";
import { fields } from "../app/register-view-schema";
import { normalizeRecordData, validate } from "../app/core-record-validation";
import { newCoreReferences, coreReferenceGuard } from "../app/core-reference-write";
import { DatabaseSync } from "node:sqlite";

test("asset editor renders each stored field once, retaining legacy lifecycle semantics",()=>{
  const keys=[...assetCoreFields,...assetFieldGroups.flatMap(g=>g.fields)];
  assert.equal(keys.length,new Set(keys).size);
  assert.deepEqual(keys.sort(),[...fields["Varlık Envanteri"]].sort());
  for(const [status,stage,expected] of [["Aktif","Planlama","Planlanan"],["Bakımda","Aktif","Bakımda"],["Arşivlendi","Aktif","Emekli / EOL"],["Aktif","Arşiv","Emekli / EOL"]]){
    const data=normalizeRecordData("Varlık Envanteri",{status,lifecycleStage:stage});
    assert.equal(data.status,expected);assert.equal(data.lifecycleStage,undefined);
    assert.deepEqual(normalizeRecordData("Varlık Envanteri",data),data);
  }
  assert.deepEqual(["Kapsamda","Kapsam Dışı","Kısmi","Uygulanamaz","Bilinmiyor",""].map(assetCoverage),["covered","gap","partial","na","unknown","unknown"]);
});
test("filtered risk and BIA lists deduplicate reverse and forward links by asset identity",()=>{
  const rows=[
    {id:"a",module:"Varlık Envanteri",code:"AST-001",data:{title:"Cloud",processLink:"BIA-123",dependencyRefs:["b"]}},
    {id:"a2",module:"Varlık Envanteri",code:"AST-002",data:{title:"Cloud"}},
    {id:"b",module:"BIA",code:"BIA-123",data:{asset:"AST-001",process:"Recovery"}},
    {id:"r",module:"Risk Assessment",data:{asset:"AST-001, AST-002"}},
    {id:"other",module:"Risk Assessment",data:{asset:"Cloud"}},
  ];
  const links=assetLinkedRecords(rows);
  assert.deepEqual([...links.get("a")!.BIA],["b"]);assert.deepEqual([...links.get("a")!["Risk Assessment"]],["r"]);
});
test("asset dependency selection rejects self links and wrong modules within the write",()=>{
  const db=new DatabaseSync(":memory:");try{
    db.exec("CREATE TABLE simple_grc_records(id TEXT,module TEXT); CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT); INSERT INTO simple_grc_records VALUES ('this','Varlık Envanteri'),('other','BIA'),('vendor','Tedarikçiler')");
    for(const [ref,ok] of [["other",true],["this",false],["vendor",false],["missing",false]] as const){
      const guard=coreReferenceGuard(newCoreReferences("this","Varlık Envanteri",{dependencyRefs:[ref]}));
      assert.equal(Boolean(db.prepare("SELECT 1 WHERE "+guard.sql).get(...guard.values)),ok);
    }
    const data={title:"Cloud",assetType:"SaaS",businessUnit:"Ops",owner:"Jane",criticality:"High",status:"Planlanan"};
    assert.deepEqual(validate("Varlık Envanteri",{...data,dependencyRefs:"AST-101; BIA-101"}).data?.dependencyRefs,["AST-101","BIA-101"]);
  }finally{db.close();}
});
