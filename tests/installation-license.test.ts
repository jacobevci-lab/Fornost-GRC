import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { generateKeyPairSync, sign } from "node:crypto";
import { activateLicense, readLicense } from "../app/licensing/store";
import { apiLicensed, type Edition } from "../app/licensing/editions";
import { canOpenModule, canWriteModule } from "../app/module-access";

const keys=generateKeyPairSync("ed25519");
const pub=keys.publicKey.export({type:"spki",format:"der"}).toString("base64url");
const now=Date.parse("2030-01-01T00:00:00Z");
function database() {
  const sql=new DatabaseSync(":memory:");
  function prepare(query:string,args:SQLInputValue[]=[]) {
    return {
      bind:(...values:SQLInputValue[])=>prepare(query,values),
      first:async()=>sql.prepare(query).get(...args)||null,
      run:async()=>({meta:{changes:sql.prepare(query).run(...args).changes}}),
    };
  }
  return {prepare,batch:async (statements:ReturnType<typeof prepare>[])=>{ for(const statement of statements) await statement.run(); }} as unknown as D1Database;
}
function license(installation:string,edition:Edition,revision:number) {
  const claims={product:"Fornost GRC",installation,customer:"Fixture",edition,revision,expires:"2031-01-01T00:00:00.000Z"};
  const payload="FGR1."+Buffer.from(JSON.stringify(claims)).toString("base64url");
  return payload+"."+sign(null,Buffer.from(payload),keys.privateKey).toString("base64url");
}
test("offline upgrades and downgrade are bound to the installation and monotonic",async()=>{
  const db=database(), empty=await readLicense(db,pub,now), id=empty.installation;
  assert.equal(empty.status,"pending");
  assert.equal(apiLicensed(empty.access,"/api/evidence","POST"),false);
  const essential=license(id,"Essentials",1);
  const first=await activateLicense(db,essential,"admin",pub,now);
  assert.equal(apiLicensed(first.access,"/api/evidence","POST"),true);
  assert.equal(apiLicensed(first.access,"/api/audits/requests","POST"),false);
  assert.equal(canWriteModule({role:"Admin",licenseAccess:first.access},"Denetim Yönetimi"),false);
  assert.equal(canOpenModule({role:"Admin",licenseAccess:first.access},"Bağlantılı GRC"),false);
  const pro=await activateLicense(db,license(id,"Professional",2),"admin",pub,now);
  assert.equal(apiLicensed(pro.access,"/api/audits/requests","POST"),true);
  assert.equal(apiLicensed(pro.access,"/api/evidence-automation","POST"),false);
  const full=license(id,"Enterprise",3);
  const enterprise=await activateLicense(db,full,"admin",pub,now);
  assert.equal(apiLicensed(enterprise.access,"/api/evidence-automation","POST"),true);
  assert.equal(canWriteModule({role:"Viewer",licenseAccess:enterprise.access},"Kanıtlar"),false);
  assert.deepEqual(await activateLicense(db,full,"admin",pub,now),enterprise);
  const expired=await readLicense(db,pub,Date.parse("2031-01-01T00:00:00Z"));
  assert.equal(expired.status,"expired");
  assert.equal(apiLicensed(expired.access,"/api/evidence","POST"),false);
  assert.equal(apiLicensed(expired.access,"/api/evidence","GET"),true);
  await assert.rejects(activateLicense(db,license(crypto.randomUUID(),"Enterprise",4),"admin",pub,now),{message:"installation"});
  await assert.rejects(activateLicense(db,full.slice(0,-8)+"ABCD","admin",pub,now),{message:"invalid"});
  const downgrade=await activateLicense(db,license(id,"Essentials",4),"admin",pub,now);
  assert.equal(downgrade.access.archive,"Enterprise");
  assert.equal(apiLicensed(downgrade.access,"/api/audits/requests","GET"),true);
  assert.equal(apiLicensed(downgrade.access,"/api/audits/requests","POST"),false);
  assert.equal(apiLicensed(downgrade.access,"/api/connected-grc/links","GET"),false);
  await assert.rejects(activateLicense(db,full,"admin",pub,now),{message:"revision"});
  assert.equal((await readLicense(db,pub,now)).revision,4);
});
