import test from "node:test";
import assert from "node:assert/strict";
import {kriFixture} from "./helpers/kri-fixture";
import {validateRiskAppetite} from "../app/risk-appetite/domain";

const draft={action:"save-appetite",autoCode:true,code:"KRI-001",category:"cyber",kriName:"Response time",
  statement:"Material incidents must be handled within our response tolerance.",metricUnit:"hours",direction:"upper",
  appetiteTarget:1,warningThreshold:2,breachThreshold:3,frequencyDays:30,validFrom:"2020-01-01",validUntil:"2099-12-31",
  owner:"owner@example.com",reviewer:"reviewer@example.com",riskRefs:["risk01"]};

test("directory SoD, unique KRI codes, exact risk selection and three-state portfolio roll-up",async()=>{
  const f=kriFixture();
  try{
    await f.post({});
    f.sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,?,?,?,?)").run("risk01","Risk Assessment",JSON.stringify({title:"Availability",inherentImpact:4,inherentLikelihood:3,residualLikelihood:2,residualImpact:3}),"2026","2026");
    f.sqlite.exec("INSERT INTO simple_grc_record_codes VALUES('risk01','Risk Assessment','RSK-041','2026')");
    const options=(await f.get("riskSearch=RSK-041")).body.risks as {id:string}[];assert.equal(options[0].id,"risk01");
    assert.equal((await f.post({...draft,riskRefs:["absent"]})).status,422);
    for (const reviewer of ["owner@example.com","ghost@example.com","maker@example.com"]){
      assert.ok((await f.post({...draft,reviewer})).status>=400);
    }
    const created=await Promise.all([f.post(draft),f.post(draft)]);
    assert.deepEqual(created.map(r=>r.status),[200,200]);
    assert.deepEqual(created.map(r=>r.body.code).sort(),["KRI-001","KRI-002"]);
    assert.equal((await f.get()).body.nextCode,"KRI-003");
    const id=String(created[0].body.id),other=String(created[1].body.id);
    const risk=async()=>((await f.get()).body.linkedRisks as {code:string;score:number;residualScore:number;appetiteStatus:string|null}[])[0];
    assert.deepEqual([(await risk()).score,(await risk()).residualScore,(await risk()).appetiteStatus],[12,6,null]);
    f.sqlite.prepare("UPDATE risk_appetite_statements SET status='approved',next_measurement='2099-01-01' WHERE id=?").run(id);
    assert.equal((await risk()).appetiteStatus,null);
    f.sqlite.prepare("INSERT INTO risk_kri_measurements VALUES('m',?,'2026-01-01','2026-01-01',0,'green','S',?,'note','owner','2026')").run(id,"a".repeat(64));
    assert.equal((await risk()).appetiteStatus,"inside");
    f.sqlite.prepare("UPDATE risk_appetite_statements SET status='approved' WHERE id=?").run(other);
    assert.equal((await risk()).appetiteStatus,null);
    f.sqlite.exec("UPDATE risk_kri_measurements SET band='amber'");
    assert.equal((await risk()).appetiteStatus,"outside");
    f.sqlite.exec("UPDATE risk_appetite_statements SET next_measurement='2000-01-01'");
    assert.equal((await risk()).appetiteStatus,null);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM simple_grc_record_codes WHERE module='Risk İştahı ve KRI'").get()?.n,2);
  }finally{f.sqlite.close()}
});
test("threshold equality and blank values are rejected in either direction",()=>{
  for(const direction of ["upper","lower"]){
    assert.throws(()=>validateRiskAppetite({...draft,direction,warningThreshold:draft.appetiteTarget}));
    assert.throws(()=>validateRiskAppetite({...draft,direction,appetiteTarget:""}));
  }
});
