import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { workRoles } from "../app/work-roles";
import { projectEnterpriseWork } from "../app/enterprise-work";
import { withWorkRecordCodes } from "../app/work-record-codes";

const owner = { email:"owner@test.org" }, reviewer = { email:"peer@test.org", role:"Admin" };
const item = (status:string, extra:Record<string,unknown> = {}) => ({
  module:"Bulgular ve CAPA", data:{ status, owner:owner.email, reviewer:reviewer.email,...extra },
});
test("owner waits on a submitted decision, reviewer alone sees an approval", () => {
  const row = item("verification");
  assert.equal(workRoles(row,owner).waiting,true);
  assert.equal(workRoles(row,owner).awaitingReview,false);
  assert.equal(workRoles(row,reviewer).awaitingReview,true);
  assert.equal(workRoles(row,reviewer).owner,false);
  assert.equal(workRoles(row,{...reviewer,role:"Viewer"}).awaitingReview,false);
  for (const status of ["draft","changes_requested","closed"]) {
    assert.equal(workRoles(item(status,{submittedAt:"2026-01-01"}),owner).waiting,false);
    assert.equal(workRoles(item(status),reviewer).awaitingReview,false);
  }
  assert.equal(workRoles(item("submitted",{reviewer:owner.email}),owner).reviewer,false);
  assert.equal(workRoles(item("submitted",{submittedBy:reviewer.email}),reviewer).awaitingReview,false);
});
test("unassigned requests include drafts and do not invalidate the active projection", () => {
  const request = {id:"id",auditId:"audit",title:"Evidence review",status:"draft",owner:owner.email,reviewer:""};
  const result = projectEnterpriseWork("audit",{requests:[],complete:true,assignments:{rows:[request],complete:true},workCodes:{"work:audit-request:id":"ARQ-008"}});
  assert.equal(result.complete,true); assert.equal(result.rows[0].code,"ARQ-008");
  assert.equal(result.rows[0].data.assignmentOnly,true);
  assert.equal(workRoles(result.rows[0],owner).missingReviewer,true);
  assert.equal(workRoles(item("open",{owner:""}),reviewer).missingOwner,true);
  assert.equal(workRoles({module:"Kontroller",data:{}},reviewer).unassigned,false);
});
test("short codes backfill existing tasks, stay stable across updates and deletion, and preserve core numbering", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("drizzle").filter(x=>x.endsWith(".sql")).sort()) {
      if (file.startsWith("0105_")) {
        db.exec("INSERT INTO audit_requests VALUES('old','audit','{}','r','t','t');");
        db.exec("INSERT INTO simple_grc_records VALUES('RSK-099','Risk Assessment','{}','t','t'),('legacy-uuid','Risk Assessment','{}','t','t');");
      }
      db.exec(readFileSync("drizzle/"+file,"utf8"));
    }
    assert.equal(db.prepare("SELECT code FROM simple_grc_record_codes WHERE record_id='legacy-uuid'").get()?.code,"RSK-100");
    db.exec("UPDATE audit_requests SET revision='r2' WHERE id='old'; DELETE FROM audit_requests WHERE id='old'; INSERT INTO audit_requests VALUES('new','audit','{}','r','t','t');");
    const q = db.prepare("SELECT code FROM simple_grc_record_codes WHERE record_id=?");
    assert.equal(q.get("work:audit-request:old")?.code,"ARQ-001");
    assert.equal(q.get("work:audit-request:new")?.code,"ARQ-002");
    const adapter = {prepare:(sql:string)=>({bind:(...args:string[])=>({all:async()=>({results:db.prepare(sql).all(...args)})})})} as unknown as D1Database;
    const result=await withWorkRecordCodes(new Request("https://test.invalid",{headers:{"x-fornost-work-queue":"1"}}),adapter,"audit",{requests:[{id:"new"}]});
    assert.deepEqual((result as {workCodes?:unknown}).workCodes,{"work:audit-request:new":"ARQ-002"});
  } finally {db.close();}
});

test("task code allocation does not turn a committed source creation into an apparent conflict", async () => {
  const {fixture} = await import("./helpers/enterprise-route-fixture");
  const {commitLifecycle,LifecycleConflict} = await import("../app/enterprise-lifecycle-write");
  const f = fixture("findings",true);
  try {
    f.sqlite.exec("CREATE TABLE source_task(id TEXT PRIMARY KEY); CREATE TABLE assigned_code(id TEXT PRIMARY KEY); CREATE TRIGGER assign_code AFTER INSERT ON source_task BEGIN INSERT INTO assigned_code VALUES(NEW.id); END;");
    await commitLifecycle(f.db,f.db.prepare("INSERT INTO source_task VALUES('task')"),[]);
    assert.ok(f.sqlite.prepare("SELECT id FROM assigned_code WHERE id='task'").get());
    await assert.rejects(commitLifecycle(f.db,f.db.prepare("UPDATE source_task SET id='other' WHERE id='gone'"),[]),LifecycleConflict);
  } finally { f.sqlite.close(); }
});
