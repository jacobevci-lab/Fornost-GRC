import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fixture} from "./helpers/enterprise-route-fixture";
import {ensureCoreGrcSchemaCompatibility} from "../app/api/grc/schema-compat";
import {vendorCode} from "../app/third-party-risk/inventory";
import {buildConnectedGrcGraph} from "../app/connected-grc-model";
import {newCoreReferences,coreReferenceGuard} from "../app/core-reference-write";

test("legacy vendors get stable codes above occupied codes, IDs and reserved numbers",async()=>{
 const f=fixture("third-party-risk");try{
  await ensureCoreGrcSchemaCompatibility(f.db);
  const ids=["VEN-005","VEN-21a7277c-4092-4272-b8ca-fbb32c6a0b35","VEN-older","VEN-coded"];
  for(const id of ids)f.sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,'Tedarikçiler','{}','today','today')").run(id);
  f.sqlite.prepare("INSERT INTO simple_grc_record_codes VALUES('VEN-coded','Tedarikçiler','VEN-079','today')").run();
  f.sqlite.prepare("INSERT INTO simple_grc_record_codes VALUES(?,'Tedarikçiler',?,'today')").run(ids[1],ids[1]);
  const sql=readFileSync("drizzle/0106_tprm_vendor_codes.sql","utf8");
  f.sqlite.exec(sql);f.sqlite.exec(sql);
  const codes=f.sqlite.prepare("SELECT code FROM simple_grc_record_codes ORDER BY code").all().map(x=>x.code);
  assert.deepEqual(codes,["VEN-005","VEN-079","VEN-080","VEN-081"]);assert.equal(vendorCode(null,ids[1]),"—");
 }finally{f.sqlite.close()}
});

test("critical inventory starts awaiting onboarding; only a reasoned, revision-checked decision excludes it",async()=>{
 const f=fixture("third-party-risk");try{
  await f.get();const id="VEN-005",stamp="2026-01-02T03:04:05.000Z";
  f.sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,'Tedarikçiler',?,?,?)").run(id,JSON.stringify({title:"Important supplier",criticality:"Kritik"}),stamp,stamp);
  type Row={vendorId:string;updatedAt:string;status:string;scopeReason:string;criticality:string};
  const get=async()=>(await f.get()).body.vendors as Row[];
  const first=(await get())[0];assert.equal(first.status,"unmanaged");assert.equal(first.criticality,"critical");
  const params={action:"exclude-vendor",vendorId:id,expectedRevision:stamp,reason:"Contract outside assessed service perimeter."};
  assert.equal((await f.post({...params,reason:" "})).status,400);
  f.setActor({id:"writer",source:"local",name:"Editor",email:"editor@example.test",role:"Editor"});
  assert.equal((await f.post(params)).status,403);
  f.setActor({id:"admin",source:"local",name:"Admin",email:"admin@example.test",role:"Admin"});
  assert.equal((await f.post(params)).status,200);
  const out=(await get())[0];assert.equal(out.status,"excluded");assert.equal(out.scopeReason,params.reason);
  assert.equal((await f.post({...params,action:"restore-vendor"})).status,409);
  assert.equal((await f.post({...params,action:"restore-vendor",expectedRevision:out.updatedAt})).status,200);
  assert.equal((await get())[0].status,"unmanaged");
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM third_party_events WHERE vendor_id=?").get(id)?.n,2);
 }finally{f.sqlite.close()}
});
test("canonical vendor links accept only existing evidence and resolve the actual asset and process",async()=>{
 const f=fixture("third-party-risk");try{
  await ensureCoreGrcSchemaCompatibility(f.db);
  const vendor={id:"vendor",code:"VEN-045",module:"Tedarikçiler",data:{title:"Cloud"}},asset={id:"asset",code:"AST-543",module:"Varlık Envanteri",data:{vendor:"VEN-045"}},bia={id:"process",code:"BIA-321",module:"BIA",data:{supplierRefs:["vendor"]}};
  const evidence={id:"proof",code:"EVD-034",module:"Kanıtlar",data:{evidenceTitle:"SOC 2"}};
  for(const r of [vendor,asset,bia,evidence])f.sqlite.prepare("INSERT INTO simple_grc_records VALUES(?,?,?,'today','today')").run(r.id,r.module,JSON.stringify(r.data));
  const valid=(ref:string)=>{const g=coreReferenceGuard(newCoreReferences(vendor.id,vendor.module,{vendorEvidenceRefs:[ref]}));return Boolean(f.sqlite.prepare("SELECT 1 WHERE "+g.sql).get(...g.values))};
  assert.ok(valid("proof"));assert.equal(valid("asset"),false);assert.equal(valid("deleted"),false);
  const graph=buildConnectedGrcGraph([{...vendor,data:{...vendor.data,vendorEvidenceRefs:["proof"]}},asset,bia,evidence]);
  assert.deepEqual(graph.links.map(l=>l.relation).sort(),["asset-vendor","bia-supplier","vendor-evidence"]);
 }finally{f.sqlite.close()}
});
