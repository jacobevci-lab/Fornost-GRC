import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const route = readFileSync("app/api/audits/route.ts", "utf8");
const css = readFileSync("app/layout-guardrails.css", "utf8");
const catalogs = readFileSync("app/api/grc/framework-catalogs.ts", "utf8");

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
  assert.match(catalogs, /pciDssRequirements/);
  assert.match(route, /frameworkTemplateCatalogs/);
  assert.match(route, /ensureTemplateRows/);
  assert.match(route, /insertedRequirements/);
  assert.match(route, /const missing = rows\.filter/);
  assert.match(route, /DELETE FROM simple_grc_records WHERE id='AUD-006'/);
  assert.match(page, /standart maddeleri çalışma tablosuna otomatik yüklenir/);
});

test("all advertised standards and regulations have automatic requirement catalogs", () => {
  for (const template of ["NIST Cybersecurity Framework", "CIS Controls v8.1", "ISO 22301:2019", "ISO\/IEC 27701:2019", "ISO\/IEC 27017:2015", "ISO\/IEC 27018:2019", "COBIT 2019", "DORA", "NIS2", "KVKK", "GDPR"])
    assert.match(catalogs, new RegExp(template));
  assert.match(catalogs, /pciDssRequirements/);
  assert.match(page, /automaticAuditTemplates/);
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
  assert.match(css, /\.shell\{min-width:0;width:100%;max-width:100%\}/);
  assert.match(css, /\.shell>main\{min-width:0;width:auto;max-width:100%\}/);
  assert.doesNotMatch(css, /\.shell,\.shell>main\{[^}]*width:100%/);
  assert.match(css, /\.integration-grid\{width:100%;grid-template-columns:minmax\(0,1fr\)!important\}/);
  assert.match(css, /\.catalog-grid\{width:100%;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
  assert.match(css, /\.catalog-grid article>header.*position:static!important/);
  assert.match(css, /overflow-wrap:anywhere/);
});
