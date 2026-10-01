import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { ACCESS_MODULES, canOpenModule, canReadModule, canWriteModule, parseModuleAccess, readableModules, scopedApiAllowed, validateModuleAccess, type AccessSubject } from "../app/module-access";
import { buildGrcContext } from "../app/ai/context";
import { ensureModuleAccessSchema, readModuleAccess } from "../app/api/users/access-storage";

const editor: AccessSubject = {role:"Editor",moduleAccess:{mode:"scoped",modules:{"Risk Assessment":"write",BIA:"read"}}};
test("legacy accounts and administrators retain access; module grants never elevate a Viewer",()=>{
  for(const role of ["Admin","Editor","Viewer"]) assert.deepEqual(readableModules({role}),ACCESS_MODULES);
  assert.equal(canWriteModule({...editor,role:"Viewer"},"Risk Assessment"),false);
  assert.equal(canWriteModule(editor,"Risk Assessment"),true);
  assert.equal(canWriteModule(editor,"BIA"),false);
  assert.equal(canReadModule(editor,"BIA"),true);
  assert.equal(canReadModule(editor,"Kanıtlar"),false);
  assert.deepEqual(readableModules({...editor,role:"Admin"}),ACCESS_MODULES);
  assert.equal(canOpenModule(editor,"Raporlar"),false);
  assert.equal(canOpenModule(editor,"Ana Sayfa"),true);
});
test("unknown grants, unknown modules and malformed persisted policy fail closed",()=>{
  for(const value of [null,[],{mode:"custom"},{mode:"full",modules:{}},{mode:"scoped",modules:{BIA:"admin"}},{mode:"scoped",modules:{future:"read"}}]) assert.equal(validateModuleAccess(value),null);
  for(const raw of ["", "null", "[]", "{invalid", '{"mode":"scoped","modules":{"BIA":"own"}}']) assert.deepEqual(readableModules({role:"Editor",moduleAccess:parseModuleAccess(raw)}),[]);
  assert.equal(parseModuleAccess(undefined).mode,"full");
  assert.equal(validateModuleAccess({mode:"scoped",modules:{}})?.mode,"scoped");
});
test("restricted API access is closed to new endpoints and cross-module datasets",()=>{
  for(const path of ["/api/executive-metrics","/api/findings","/api/ai/knowledge/search","/api/ai/drafts","/api/ai/agents","/api/continuous-assurance/dashboard","/api/evidence-automation","/api/third-party-risk","/api/future-export"]){
    for(const method of ["GET","POST","PATCH","DELETE"]) assert.equal(scopedApiAllowed(editor,path,method),false,`${method} ${path}`);
  }
  assert.equal(scopedApiAllowed(editor,"/api/catalogs","GET"),true);
  assert.equal(scopedApiAllowed(editor,"/api/catalogs","POST"),false);
  assert.equal(scopedApiAllowed(editor,"/api/evidence","GET"),false);
  const evidence:AccessSubject={role:"Editor",moduleAccess:{mode:"scoped",modules:{"Kanıtlar":"read"}}};
  assert.equal(scopedApiAllowed(evidence,"/api/evidence/history/","GET"),true);
  assert.equal(scopedApiAllowed(evidence,"/api/evidence/history","POST"),false);
  assert.equal(scopedApiAllowed(editor,"/api/ai/chat","POST"),true);
});

function database(){
  const sqlite=new DatabaseSync(":memory:");
  const queries:string[]=[];
  function prepare(sql:string,args:(string|number|null)[]=[]){
    return {bind(...values:(string|number|null)[]){return prepare(sql,values)},async first(){queries.push(sql);return sqlite.prepare(sql).get(...args)||null},async all(){queries.push(sql);return {results:sqlite.prepare(sql).all(...args)}},async run(){queries.push(sql);return sqlite.prepare(sql).run(...args)}};
  }
  return {sqlite,queries,db:{prepare,async batch(statements:ReturnType<typeof prepare>[]){for(const statement of statements)await statement.run()}} as unknown as D1Database};
}
test("fresh and upgraded module policy schemas preserve policies across repeated startup",async()=>{
  for(const upgraded of [false,true]){
    const {sqlite,db}=database();try{
      if(upgraded)sqlite.exec(readFileSync("drizzle/0081_user_module_access.sql","utf8"));
      await ensureModuleAccessSchema(db);
      assert.equal((await readModuleAccess(db,"legacy-user")).mode,"full");
      sqlite.prepare("INSERT INTO user_module_access VALUES(?,?,?,?)").run("scoped",JSON.stringify(editor.moduleAccess),"now","admin");
      await ensureModuleAccessSchema(db);
      assert.deepEqual(await readModuleAccess(db,"scoped"),editor.moduleAccess);
      sqlite.prepare("UPDATE user_module_access SET policy_json='broken' WHERE user_id='scoped'").run();
      assert.deepEqual(readableModules({role:"Editor",moduleAccess:await readModuleAccess(db,"scoped")}),[]);
    }finally{sqlite.close()}
  }
});
test("AI filters before LIMIT and never queries shared knowledge, lineage or assurance for scoped users",async()=>{
  const {sqlite,db,queries}=database();try{
    sqlite.exec("CREATE TABLE simple_grc_records(id TEXT,module TEXT,data_json TEXT,updated_at TEXT)");
    const insert=sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,?,?,?)");
    insert.run("allowed-risk","Risk Assessment",JSON.stringify({title:"Allowed risk",classification:"Internal"}),"2020-01-01");
    insert.run("restricted-classification","Risk Assessment",JSON.stringify({title:"CLASSIFIED_SECRET",classification:"Restricted"}),"2026-10-01");
    for(let i=0;i<450;i++)insert.run(`denied-${i}`,"Kanıtlar",JSON.stringify({evidenceTitle:"HIDDEN_EVIDENCE"}),"2026-10-01");
    const result=await buildGrcContext(db,"risk evidence automation finding knowledge", "Internal",editor);
    assert.deepEqual(result.sources.map(source=>source.id),["allowed-risk"]);
    assert.ok(!result.contextText.includes("HIDDEN_EVIDENCE"));assert.ok(!result.contextText.includes("CLASSIFIED_SECRET"));
    assert.equal(queries.length,1);assert.match(queries[0],/WHERE module IN .* LIMIT 400/);
    const none=await buildGrcContext(db,"summary","Confidential",{role:"Viewer",moduleAccess:{mode:"scoped",modules:{}}});
    assert.deepEqual(none.sources,[]);
    const forbidden=await buildGrcContext(db,"evidence","Confidential",editor);assert.deepEqual(forbidden.sources,[]);
  }finally{sqlite.close()}
});
