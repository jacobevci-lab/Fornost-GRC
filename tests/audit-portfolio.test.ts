import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const route = readFileSync("app/api/audits/route.ts", "utf8");
const css = readFileSync("app/layout-guardrails.css", "utf8");

test("audit templates are choices instead of automatically rendered portfolio cards", () => {
  assert.doesNotMatch(page, /audits\s*=\s*\[\.\.\.new Set\(\[\.\.\.auditCatalog/);
  assert.match(page, /Hazır kartlar otomatik eklenmez/);
  assert.match(page, /Denetim seç ve ekle/);
  assert.match(page, /createAudit=\{createAudit\}/);
  assert.match(page, /"PCI DSS 4\.0\.1"/);
  assert.match(page, /templateOptions = auditCatalog/);
  assert.doesNotMatch(page, /templateOptions = \[\.\.\.new Set\(\[\.\.\.auditCatalog, \.\.\.actual\]\)\]/);
});

test("portfolio audits and their requirements support controlled deletion", () => {
  assert.match(route, /CREATE TABLE IF NOT EXISTS simple_audits/);
  assert.match(route, /requireRole\(req, \["Admin"\]\)/);
  assert.match(route, /audit_archive_/);
  assert.match(route, /DELETE FROM simple_grc_records WHERE module='Denetim Yönetimi'/);
  assert.match(page, /Denetimi Sil/);
  assert.match(page, /\+ Özel Madde/);
  assert.match(page, /STANDART MADDELERİ/);
  assert.doesNotMatch(page, /<AuditWorkspaceTabs/);
});

test("standard audit cards automatically receive their control requirements", () => {
  assert.match(route, /soc2TemplateControls/);
  assert.match(route, /iso27001Refs/);
  assert.match(route, /pciDssTemplateRequirements/);
  assert.match(route, /template\.startsWith\("PCI DSS"\)/);
  assert.match(route, /ensureTemplateRows/);
  assert.match(route, /insertedRequirements/);
  assert.match(route, /const missing = rows\.filter/);
  assert.match(route, /DELETE FROM simple_grc_records WHERE id='AUD-006'/);
  assert.match(page, /standart maddeleri çalışma tablosuna otomatik yüklenir/);
});

test("audit requirements show framework references without internal record codes or repeated audit names", () => {
  assert.match(page, /key: "audit", tr: "Madde", en: "Requirement"/);
  assert.match(page, /showRecordCode = module !== "Denetim Yönetimi"/);
  assert.match(page, /<b>{reference}<\/b>/);
  assert.doesNotMatch(page, /<b>{d\.auditName \|\| "—"}<\/b>/);
  assert.match(route, /requirementTitle: iso27001Titles\[ref\]/);
  assert.match(route, /Bilgi güvenliği politikaları/);
  assert.match(route, /UPDATE simple_grc_records SET data_json/);
});

test("layout guardrails prevent settings cards from widening the page", () => {
  assert.match(css, /html,body\{max-width:100%;overflow-x:hidden\}/);
  assert.match(css, /\.integration-grid\{width:100%;grid-template-columns:minmax\(0,1fr\)!important\}/);
  assert.match(css, /\.catalog-grid\{width:100%;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
  assert.match(css, /\.catalog-grid article>header.*position:static!important/);
  assert.match(css, /overflow-wrap:anywhere/);
});
