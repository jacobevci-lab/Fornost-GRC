import assert from "node:assert/strict";
import test from "node:test";
import { access,readFile } from "node:fs/promises";
import { demoSeeds } from "../app/api/grc/demo-seeds";
import { shouldInsertDemoSeeds,validate } from "../app/api/grc/route";

test("demo portfolio keeps exactly four neutral samples per module",()=>{
 assert.equal(demoSeeds.length,32);
 const counts=new Map<string,number>();
 for(const [,module] of demoSeeds)counts.set(module,(counts.get(module)||0)+1);
 assert.equal(counts.size,8);
 for(const [,count] of counts)assert.equal(count,4);
});

test("demo identifiers are unique and every row passes API validation",()=>{
 const ids=demoSeeds.map(([id])=>id);
 assert.equal(new Set(ids).size,ids.length);
 for(const [id,module,data] of demoSeeds)assert.equal("error" in validate(module,data),false,`${id} failed validation`);
});

test("risk, compliance, vendor and audit relationships resolve",()=>{
 const ids=new Set(demoSeeds.map(([id])=>id));
 for(const [id,module,data] of demoSeeds){
  const refs=module==="Risk Assessment"?[data.processLink,data.existingControls]
   :module==="Uyum"?[data.controlLink,data.evidenceRef]
   :module==="Tedarikçiler"?[data.riskRef,data.controlRef]
   :module==="Denetim Yönetimi"?[data.riskRef,data.controlRef,data.evidenceRef]:[];
  for(const ref of refs)assert.ok(ids.has(String(ref)),`${id} has unresolved reference ${ref}`);
 }
});

test("demo values cover the principal choice states used by dashboards",()=>{
 const values=(module:string,key:string)=>new Set(demoSeeds.filter(([,m])=>m===module).map(([, ,d])=>d[key]));
 assert.ok(values("Risk Assessment","treatment").size>=4);
 assert.ok(values("Risk Assessment","status").size>=4);
 assert.ok(values("Varlık Envanteri","assetType").size>=4);
 assert.ok(values("Uyum","status").size>=4);
 assert.ok(values("Tedarikçiler","riskLevel").size>=3);
 assert.ok(values("Kontroller","frequency").size>=4);
 assert.ok(values("Kanıtlar","status").size>=3);
 assert.ok(values("Denetim Yönetimi","status").size>=4);
});

test("every demo evidence record has a displayable sample screenshot",async()=>{
 const evidence=demoSeeds.filter(([,module])=>module==="Kanıtlar");
 for(const [id,,data] of evidence){
  assert.match(String(data.demoImage),/^\/demo-evidence\/[a-z-]+\.svg$/,`${id} has no safe demo image path`);
  await access(`public${data.demoImage}`);
  assert.equal(data.fileType,"image/svg+xml");
 }
});

test("demo records are inserted only for a previously uninitialized empty installation",()=>{
 assert.equal(shouldInsertDemoSeeds(null,0),true);
 assert.equal(shouldInsertDemoSeeds(null,12),false);
 assert.equal(shouldInsertDemoSeeds({value:"1"},0),false);
 assert.equal(shouldInsertDemoSeeds({value:"1"},96),false);
});

test("listing records does not restore or overwrite deleted and edited demo rows",async()=>{
 const source=await readFile("app/api/grc/route.ts","utf8");
 assert.doesNotMatch(source,/seeds\.length\s*===/);
 assert.doesNotMatch(source,/UPDATE simple_grc_records SET data_json=.*Kanıtlar/);
});
