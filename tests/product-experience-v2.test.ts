import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const copilot = readFileSync("app/fornost-ai-copilot.tsx", "utf8");
const aiSettings = readFileSync("app/ai-settings.tsx", "utf8");
const settings = readFileSync("app/settings.tsx", "utf8");
const css = readFileSync("app/product-experience.css", "utf8");

test("information architecture follows the connected GRC product model", () => {
  for (const group of ["GENEL BAKIŞ", "RİSK", "UYUM", "GÜVENCE", "YÖNETİŞİM", "İÇGÖRÜ", "YÖNETİM"]) {
    assert.match(page, new RegExp(group));
  }
  for (const connectedView of ["Benim İşlerim", "AI Yönetişimi", "Ask Fornost", "Bağlantılı GRC", "Bulgular ve CAPA"]) {
    assert.match(page, new RegExp(`"${connectedView}"`));
  }
  assert.match(page, /function MyWork/);
  assert.match(page, /fornost:open-ai/);
});

test("AI configuration has one administrative home and keeps the governed action boundary", () => {
  assert.match(settings, /SettingsPage\s*=\s*"system"\s*\|\s*"ai"/);
  assert.match(settings, /<AiSettings lang=\{lang\}/);
  assert.match(aiSettings, /\/api\/ai\/providers/);
  assert.match(aiSettings, /FornostAiPolicy/);
  assert.match(aiSettings, /Action Gateway/);
  assert.match(aiSettings, /human approval/);
  assert.doesNotMatch(copilot, />AI Ayarları<\/button>/);
});

test("core registers open with decision-oriented readable columns", () => {
  assert.match(page, /BIA:\["process","ownership","criticality","recovery","readiness","test","updatedAt"\]/);
  assert.match(page, /"Varlık Envanteri":\["title","ownership","criticality","dataClassification","coverage","lifecycle","updatedAt"\]/);
  assert.match(page, /Kontroller:\["control","owner","frameworks","implementation","evidence","status","updatedAt"\]/);
  assert.match(page, /fornost-grc-column-layout/);
  assert.match(page, /<CoreModuleOverview/);
});

test("light, dark, desktop, tablet and mobile share the final experience contract", () => {
  for (const selector of [".module-overview", ".my-work-page", ".ai-settings-page", ".table-wrap table", ".dashboard-intelligence"]) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /font-size:12px!important/);
  assert.match(css, /overflow:auto!important/);
});
