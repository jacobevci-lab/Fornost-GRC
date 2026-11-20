import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { parseRecordTask, recordContext, type RecordTask } from "../app/ai/record-assistance";
import { apiLicensed } from "../app/licensing/editions";
import { type AccessSubject } from "../app/module-access";

const pro:AccessSubject={role:"Admin",licenseAccess:{active:"Professional",archive:"Enterprise"}};
const enterprise:AccessSubject={role:"Admin",licenseAccess:{active:"Enterprise",archive:"Enterprise"}};
const task:RecordTask={recordId:"EVD-1",intent:"summary",locale:"en"};

test("a commercial edition determines AI capability before provider access",()=>{
  for (const path of ["/api/ai/status","/api/ai/chat","/api/ai/providers"]) {
    assert.equal(apiLicensed({active:"Essentials",archive:"Enterprise"},path,"POST"),false);
    assert.equal(apiLicensed(pro.licenseAccess!,path,"POST"),true);
  }
  for (const path of ["/api/ai/agents","/api/ai/governance","/api/ai/drafts","/api/ai/providers/other"])
    assert.equal(apiLicensed(pro.licenseAccess!,path,"POST"),false);
  assert.throws(()=>parseRecordTask(undefined,pro),{code:"RECORD_REQUIRED"});
  assert.throws(()=>parseRecordTask({...task,intent:"connections"},pro),{code:"LICENSE_REQUIRED"});
  assert.throws(()=>parseRecordTask({...task,intent:"request"},{...pro,role:"Viewer"}),{code:"AUDIT_WRITE_REQUIRED"});
  assert.equal(parseRecordTask(undefined,enterprise),null);
});

test("record assistance respects module boundaries, provider classification and human review",async()=>{
  const sqlite=new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE simple_grc_records(id TEXT PRIMARY KEY,module TEXT,data_json TEXT); CREATE TABLE simple_grc_record_codes(record_id TEXT,code TEXT)");
    const insert=sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,?,?)");
    insert.run("EVD-1","Kanıtlar",JSON.stringify({evidenceTitle:"Quarterly access review",controlRef:"CTRL-1",secret:"Never-share-token",rawSnapshot:"Never-share-payload"}));
    insert.run("CTRL-1","Kontroller",JSON.stringify({controlTitle:"Verified access control",riskRefs:"RSK-1"}));
    insert.run("CTRL-2","Kontroller",JSON.stringify({controlTitle:"Quarterly access certification"}));
    insert.run("CTRL-3","Kontroller",JSON.stringify({controlTitle:"Quarterly access HIDDEN",classification:"Restricted"}));
    insert.run("EVD-HIDDEN","Kanıtlar",JSON.stringify({classification:"Confidential"}));
    function prepare(sql:string, args:string[]=[]) {
      return {bind:(...values:string[])=>prepare(sql,values),first:async()=>sqlite.prepare(sql).get(...args),all:async()=>({results:sqlite.prepare(sql).all(...args)})};
    }
    const db={prepare} as unknown as D1Database;
    const summary=await recordContext(db,task,pro,"Internal");
    assert.deepEqual(summary.sources.map(s=>s.id),["EVD-1"]); assert.doesNotMatch(summary.contextText,/CTRL-|Never-share/);
    await assert.rejects(recordContext(db,{...task,recordId:"EVD-HIDDEN"},pro,"Internal"),{code:"RECORD_UNAVAILABLE"});
    const connected=await recordContext(db,{...task,intent:"connections"},enterprise,"Internal");
    assert.deepEqual(connected.sources.map(s=>s.id),["EVD-1","CTRL-1","CTRL-2"]);
    assert.match(connected.contextText,/control-evidence/); assert.match(connected.contextText,/possible control mapping/);
    assert.doesNotMatch(connected.contextText,/HIDDEN|Never-share/);
    const scoped:AccessSubject={...enterprise,role:"Editor",moduleAccess:{mode:"scoped",modules:{"Kanıtlar":"read"}}};
    assert.deepEqual((await recordContext(db,{...task,intent:"connections"},scoped,"Internal")).sources.map(s=>s.id),["EVD-1"]);
    await assert.rejects(recordContext(db,task,{...scoped,moduleAccess:{mode:"scoped",modules:{}}},"Internal"),{code:"RECORD_UNAVAILABLE"});
  } finally {sqlite.close();}
});
