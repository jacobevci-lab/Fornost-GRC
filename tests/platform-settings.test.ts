import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/settings/route.ts","utf8"),ui=readFileSync("app/settings.tsx","utf8"),migration=readFileSync("drizzle/0076_platform_settings.sql","utf8"),schema=readFileSync("db/schema.ts","utf8");

test("platform settings are organization-wide, admin-only and audited",()=>{
  assert.match(route,/requireRole\(req,\["Admin"\]\)/);
  assert.match(route,/platform_settings/);
  assert.match(route,/platform_setting_events/);
  assert.match(route,/platform-settings-update/);
  assert.match(route,/ORDER BY created_at DESC LIMIT 12/);
  assert.match(route,/changedKeys/);
  assert.match(route,/content-length/);
  assert.match(route,/Geçerli bir FQDN/);
  assert.match(route,/Oturum süresi/);
  assert.match(route,/Audit saklama süresi/);
});

test("system settings use the server contract and never persist secrets locally",()=>{
  assert.match(ui,/withBasePath\("\/api\/settings"\)/);
  assert.match(ui,/method:"PUT"/);
  assert.match(ui,/Kurumsal platform ayarları kaydedildi/);
  assert.doesNotMatch(ui,/localStorage\.setItem\("fornost-grc-settings"/);
  assert.match(ui,/setCertPassword\(""\)/);
  assert.match(ui,/setCertFile\(null\)/);
  assert.match(ui,/GÜVENLİK VE DENETİM DURUŞU/);
  assert.match(ui,/Ayar Değişiklik Geçmişi/);
  assert.match(ui,/setAuditEvents/);
});

test("platform settings schema supports migrations and runtime self-heal",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS platform_settings/);
  assert.match(migration,/platform_setting_events_created_idx/);
  assert.match(schema,/platformSettings/);
  assert.match(schema,/platformSettingEvents/);
  assert.match(route,/CREATE TABLE IF NOT EXISTS platform_settings/);
});
