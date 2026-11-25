import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {fixture} from "./helpers/enterprise-route-fixture";

const input={action:"create-plan",biaMode:"record",name:"Customer recovery",process:"Customer services",biaRef:"BIA-004",criticality:"critical",
  owner:"owner@example.test",reviewer:"checker@example.test",crisisLead:"lead@example.test",rpoHours:0,rtoHours:2,mtpdHours:8,
  communicationPlan:"Notify operators and service owners.",recoveryStrategy:"Restore the service in the standby region.",minimumStaff:2,reviewDate:"2028-05-10",
  assetRefs:["asset-id"],supplierRefs:["vendor-id"],exerciseFrequency:"semiannual",nextExerciseDate:"2027-01-01"};
function setup(){
  const f=fixture("continuity",true);
  f.sqlite.exec(`CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT);
    CREATE TABLE simple_grc_record_codes(record_id TEXT PRIMARY KEY,code TEXT UNIQUE);
    INSERT INTO simple_grc_records VALUES('bia-id','BIA'),('asset-id','Varlık Envanteri'),('vendor-id','Tedarikçiler');
    INSERT INTO simple_grc_record_codes VALUES('bia-id','BIA-004');`);
  return f;
}
test("plan creation commits typed dependencies and cadence with the draft and rejects incorrect target modules",async()=>{
  const f=setup();
  try{
    for(const patch of [{assetRefs:["vendor-id"]},{supplierRefs:["missing"]},{rtoHours:9},{rpoHours:3},{nextExerciseDate:"2027-02-30"}])
      assert.ok((await f.post({...input,...patch})).status>=400);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM enterprise_continuity_events").get()!.n,0);
    assert.equal((await f.post(input)).status,201);
    const result=await f.get(),p=(result.body.plans as (typeof input & {code:string})[])[0];
    assert.equal(p.code,"BCP-001");assert.equal(p.rpoHours,0);assert.deepEqual(p.assetRefs,input.assetRefs);assert.deepEqual(p.supplierRefs,input.supplierRefs);
    assert.equal(p.nextExerciseDate,input.nextExerciseDate);assert.equal(p.exerciseFrequency,input.exerciseFrequency);
    assert.equal((result.body.summary as {totalPlans:number}).totalPlans,1);
  }finally{f.sqlite.close()}
});
test("manual improvements require a completed exercise belonging to the active plan and retain a single audited record on retry",async()=>{
  const f=setup();
  try{
    const {body}=await f.post(input),planId=body.id;
    f.sqlite.prepare("UPDATE enterprise_continuity_plans SET status='active' WHERE id=?").run(String(planId));
    const gap={action:"create-gap",requestId:"BCG-00000000-0000-4000-8000-000000000001",planId,exerciseId:"exercise",title:"Improve failover instructions",dueDate:"2027-04-12",severity:"high"};
    f.sqlite.prepare("INSERT INTO enterprise_continuity_exercises(id,code,plan_id,type,scheduled_date,scenario,facilitator,status,created_by,created_at) VALUES('exercise','EX-1',?,'technical','2026-01-01','Recover service','owner','planned','owner','2026-01-01')").run(String(planId));
    assert.equal((await f.post(gap)).status,409);
    f.sqlite.exec("UPDATE enterprise_continuity_exercises SET status='completed'");
    assert.equal((await f.post(gap)).status,201);assert.equal((await f.post(gap)).status,200);assert.equal((await f.post({...gap,title:"Different remediation"})).status,409);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM enterprise_continuity_events WHERE entity_type='gap'").get()!.n,1);
    const row=f.sqlite.prepare("SELECT * FROM enterprise_continuity_gaps").get()!;
    assert.deepEqual([row.status,row.owner,row.reviewer,row.exercise_id],["open",input.owner,input.reviewer,"exercise"]);
  }finally{f.sqlite.close()}
});
test("legacy short codes and historical identifiers survive repeated migration and new plan allocation",()=>{
  const db=new DatabaseSync(":memory:"),migration=readFileSync("drizzle/0109_continuity_plan_settings.sql","utf8");
  try{
    db.exec("CREATE TABLE enterprise_continuity_plans(id TEXT PRIMARY KEY,code TEXT UNIQUE,created_at TEXT); INSERT INTO enterprise_continuity_plans VALUES('old','BCP-2025-ABCD','2025'),('known','BCP-009','2026')");
    db.exec(migration);db.exec(migration);
    db.exec("INSERT INTO enterprise_continuity_plans VALUES('new','BCP-2026-ABCD','2026')");
    const codes=db.prepare("SELECT plan_id,sequence FROM enterprise_continuity_plan_settings ORDER BY sequence").all();
    assert.deepEqual(codes.map(c=>[c.plan_id,c.sequence]),[["known",9],["old",10],["new",11]]);
    assert.equal(db.prepare("SELECT code FROM enterprise_continuity_plans WHERE id='old'").get()!.code,"BCP-2025-ABCD");
  }finally{db.close()}
});
