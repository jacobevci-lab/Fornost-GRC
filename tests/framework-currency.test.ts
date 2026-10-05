import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { automaticAuditTemplates, frameworkTemplateCatalogs, pciDssRequirements } from "../app/api/grc/framework-catalogs";
import { getCatalogStatus } from "../app/framework-catalog-status";

test("CSF 2.0 includes the published 106 subcategories with intentional numbering gaps", () => {
  const rows = frameworkTemplateCatalogs["NIST Cybersecurity Framework (CSF) 2.0"];
  assert.equal(rows.length, 106);
  assert.equal(new Set(rows.map(r => r.ref)).size, 106);
  assert.deepEqual(Object.fromEntries(["GV","ID","PR","DE","RS","RC"].map(fn => [fn, rows.filter(r => r.ref.startsWith(fn)).length])), {GV:31,ID:21,PR:22,DE:11,RS:13,RC:8});
  for (const id of ["ID.AM-07","PR.DS-10","DE.CM-09","RS.AN-08","RC.CO-04"]) assert.ok(rows.some(r => r.ref === id));
  for (const id of ["ID.AM-06","PR.DS-03","DE.AE-01"]) assert.ok(!rows.some(r => r.ref === id));
});
test("new editions do not reuse obsolete ISO clause numbers", () => {
  for (const name of ["ISO/IEC 27701:2025","ISO/IEC 27017:2026","ISO/IEC 27018:2025"]) {
    assert.ok((automaticAuditTemplates as readonly string[]).includes(name));
    assert.ok(frameworkTemplateCatalogs[name].every(r => r.ref.startsWith("LOCAL-")));
    assert.ok(getCatalogStatus(name).source?.startsWith("https://www.iso.org/"));
  }
  for (const old of ["ISO/IEC 27701:2019","ISO/IEC 27017:2015","ISO/IEC 27018:2019"]) {
    assert.ok(!(automaticAuditTemplates as readonly string[]).includes(old));
    assert.match(getCatalogStatus(old).en,/Legacy catalog/);
  }
});
test("PCI uses only genuine top-level references and KVKK includes updated contract notification", () => {
  assert.deepEqual(pciDssRequirements.map(r => r.ref), Array.from({length:12},(_,i)=>String(i+1)));
  assert.ok(frameworkTemplateCatalogs["KVKK (6698)"].some(r => r.ref === "Md.9/5" && r.title.includes("beş iş günü")));
});
test("catalog reads never mutate historical audits and unknown scopes are explicitly unverified", () => {
  const source = readFileSync("app/api/audits/route.ts","utf8");
  const get = source.split("export async function GET")[1].split("export async function POST")[0];
  assert.doesNotMatch(get,/ensureTemplateRows|INSERT|UPDATE|DELETE/);
  assert.match(source,/catalogRevision: "2026-10-05"/);
  assert.match(getCatalogStatus("Unknown").en,/not been fully verified/);
});
