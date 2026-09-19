import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local identity administration supports governed role and status changes",async()=>{
 const [ui,route,css]=await Promise.all([
  readFile("app/settings.tsx","utf8"),
  readFile("app/api/users/route.ts","utf8"),
  readFile("app/enterprise-surface-contract.css","utf8"),
 ]);
 assert.match(ui,/method:"PATCH"/);
 assert.match(ui,/user\.role/);
 assert.match(ui,/user\.status/);
 assert.match(ui,/failed_attempts/);
 assert.match(route,/Son aktif yönetici devre dışı bırakılamaz/);
 assert.match(route,/failed_attempts=CASE WHEN \?='Active' THEN 0/);
 assert.match(route,/locked_until=CASE WHEN \?='Active' THEN NULL/);
 assert.match(css,/\.local-user-list>div\{grid-template-columns:/);
});

test("audit portfolio and requirements use actionable lifecycle states",async()=>{
 const [audits,page,seeds]=await Promise.all([
  readFile("app/api/audits/route.ts","utf8"),
  readFile("app/page.tsx","utf8"),
  readFile("app/api/grc/demo-seeds.ts","utf8"),
 ]);
 assert.doesNotMatch(audits,/\|\| "Planlandı"/);
 assert.match(audits,/\|\| "Başlanmadı"/);
 assert.match(page,/"Denetim Yönetimi": \["Başlanmadı", "Devam Ediyor", "İncelemede", "Kapatıldı"\]/);
 assert.doesNotMatch(seeds,/status:\["Planlandı"/);
});
