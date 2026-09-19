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
  assert.doesNotMatch(copilot, /fornost-ai-settings/);
  assert.doesNotMatch(copilot, /ProviderForm/);
  assert.doesNotMatch(copilot, /saveProvider/);
  assert.match(aiSettings, /ai-control-summary/);
  assert.match(aiSettings, /\/api\/ai\/metrics\?days=7/);
  assert.match(aiSettings, /AI Güvence Kontrolleri/);
  assert.match(aiSettings, /FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS/);
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
  assert.match(css, /\.ai-control-summary/);
  assert.match(css, /\.ai-readiness-list/);
  assert.match(css, /\.fornost-ai-panel :where\(p,dd,li,label,input,select,textarea,button\)/);
});

test("dark mode keeps the approved green graphite palette instead of navy", () => {
  assert.match(css, /--ws-bg:#0f1516;--ws-surface:#172021;--ws-surface-2:#1d292a/);
  assert.match(css, /html\[data-theme="dark"\] \.shell>aside\{background:#121b1c!important\}/);
  assert.match(css, /linear-gradient\(135deg,#0c3433,#123f3d 58%,#102a29\)/);
  for (const rejected of ["#0a1220", "#111c2d", "#17243a", "#0d1827", "#12243b", "#18223a"]) {
    assert.ok(!css.includes(rejected), `navy palette token leaked: ${rejected}`);
  }
});
