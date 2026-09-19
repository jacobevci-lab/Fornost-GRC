import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { demoSeeds } from "../app/api/grc/demo-seeds";
import { normalizeRecordData, validate } from "../app/api/grc/route";

const coreModules=["Risk Assessment","BIA","Varlık Envanteri","Uyum","Tedarikçiler","Kontroller","Kanıtlar","Denetim Yönetimi"] as const;

test("every core register is reachable and participates in CRUD, reports and demo coverage",async()=>{
 const [page,route]=await Promise.all([readFile("app/page.tsx","utf8"),readFile("app/api/grc/route.ts","utf8")]);
 const moduleList=page.slice(page.indexOf("const modules = ["),page.indexOf("const adminModules"));
 const reportList=page.slice(page.indexOf("const reportModules = ["),page.indexOf("const fields:"));
 const fieldMap=page.slice(page.indexOf("const fields:"),page.indexOf("const examples:"));
 for(const moduleName of coreModules){
  assert.match(moduleList,new RegExp(`"${moduleName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}"`),`${moduleName} is missing from navigation`);
  assert.match(reportList,new RegExp(`"${moduleName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}"`),`${moduleName} is missing from reporting`);
  assert.match(fieldMap,new RegExp(moduleName.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")),`${moduleName} has no form schema`);
  assert.equal(demoSeeds.filter(([,name])=>name===moduleName).length,4,`${moduleName} needs four removable samples`);
 }
 for(const method of ["GET","POST","PATCH","DELETE"])assert.match(route,new RegExp(`export async function ${method}`));
});

test("control library separates lifecycle from implementation and upgrades legacy records",()=>{
 const legacy={controlRef:"CTL-900",controlTitle:"Legacy control",owner:"Security",frequency:"Aylık",status:"Uygulanıyor"};
 const normalized=normalizeRecordData("Kontroller",legacy);
 assert.equal(normalized.implementation,"Uygulanıyor");
 assert.equal(normalized.status,"Aktif");
 assert.equal("error" in validate("Kontroller",legacy),false);
 const current={...legacy,implementation:"Kısmi",status:"İyileştirme Gerekli"};
 assert.deepEqual(validate("Kontroller",current),{module:"Kontroller",data:current});
});

test("all fictional examples use the current operational state vocabulary",()=>{
 const allowed:Record<string,Set<unknown>>={
  "Risk Assessment":new Set(["Açık","Değerlendiriliyor","Aksiyon Devam Ediyor","Kabul Edildi","Kapalı"]),
  "Denetim Yönetimi":new Set(["Başlanmadı","Devam Ediyor","İncelemede","Kapatıldı"]),
  Kontroller:new Set(["Taslak","Aktif","İyileştirme Gerekli","Devre Dışı"]),
 };
 for(const [id,moduleName,data] of demoSeeds)if(allowed[moduleName])assert.ok(allowed[moduleName].has(data.status),`${id} has obsolete state ${data.status}`);
});

test("server validation rejects invented states while normalizing known legacy labels",()=>{
 const audit=demoSeeds.find(([,moduleName])=>moduleName==="Denetim Yönetimi")!;
 assert.equal("error" in validate(audit[1],{...audit[2],status:"Aksiyon alındı bekliyor"}),true);
 const legacy=normalizeRecordData("Denetim Yönetimi",{...audit[2],status:"Planlandı"});
 assert.equal(legacy.status,"Başlanmadı");
 const compliance=normalizeRecordData("Uyum",{status:"Uyumsuz"});
 assert.equal(compliance.status,"Uyumlu Değil");
});
