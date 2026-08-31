import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/module-registers.css", "utf8");
const finalCss = readFileSync("app/final-polish.css", "utf8");

test("module registers expose persistent column selection and module filters", () => {
  assert.match(page, /fornost-grc-columns/);
  assert.match(page, /function RegisterToolbar/);
  assert.match(page, /registerFilterKeys/);
  assert.match(page, /Görüntülenecek sütunlar/);
  assert.match(page, /Filtreleri Temizle/);
});

test("all operational and reporting tables persist user-adjusted column widths", () => {
  assert.match(page, /fornost-grc-column-widths:/);
  assert.match(page, /function ResizableTh/);
  assert.match(page, /role="separator"/);
  assert.match(page, /useColumnWidths\("Raporlar"\)/);
  assert.match(css, /\.column-resizer/);
});

test("management reporting omits opaque internal record identifiers", () => {
  const reports = page.slice(page.indexOf("function Reports"), page.indexOf("function ModuleFilter"));
  assert.doesNotMatch(reports, /r\.id,<\/b>/);
  assert.doesNotMatch(reports, /\[tr \? "Kod" : "Code"\]/);
});

test("management reporting offers separate exports for every operational module", () => {
  const reports = page.slice(page.indexOf("function Reports"), page.indexOf("function ModuleFilter"));
  assert.match(page, /const reportModules = \[/);
  assert.match(page, /"Risk Assessment",\s*"BIA",\s*"Varlık Envanteri",\s*"Uyum"/);
  assert.match(page, /"Tedarikçiler",\s*"Kontroller",\s*"Kanıtlar",\s*"Denetim Yönetimi"/);
  assert.match(reports, /className="report-module-picker"/);
  assert.match(reports, /module === all \|\| r\.module === module/);
  assert.match(reports, /csvDownload\(`Fornost-GRC-\$\{exportSlug\}\.csv`, filtered, lang\)/);
});

test("record timestamps are mapped from the API and visible in every register", () => {
  assert.match(page, /updatedAt: x\.updatedAt \|\| x\.updated_at/);
  assert.match(page, /createdAt: x\.createdAt \|\| x\.created_at/);
  assert.match(page, /Son Güncelleme/);
  assert.match(page, /function DateTimeCell/);
});

test("register layout contains readable and overflow-safe desktop and mobile rules", () => {
  assert.match(css, /\.smart-table td,.risk-table td\{max-width:320px;font-size:11\.5px!important/);
  assert.match(css, /@media\(max-width:1500px\)\{\.risk-overview\{grid-template-columns:1fr!important/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.column-picker\{position:fixed/);
  assert.match(page, /getBoundingClientRect/);
  assert.match(page, /window\.addEventListener\("scroll", placePicker, true\)/);
});

test("record actions remain readable in every shared register", () => {
  assert.equal((page.match(/className="row-actions-column" style=\{\{ width: 180 \}\}/g) || []).length, 2);
  assert.equal((page.match(/className="row-actions-cell"/g) || []).length, 2);
  assert.match(finalCss, /\.row-actions\{[^}]*min-width:max-content[^}]*flex-wrap:nowrap[^}]*opacity:1!important/);
  assert.match(finalCss, /\.row-actions button\{[^}]*min-width:66px[^}]*white-space:nowrap[^}]*word-break:keep-all/);
  assert.match(finalCss, /\.row-actions button:last-child\{[^}]*#d92d20/);
  assert.doesNotMatch(page, /<col style=\{\{ width: 120 \}\} \/>/);
});

test("percent values follow the selected interface language", () => {
  assert.match(page, /function formatPercent\(value: number, lang: Lang\)/);
  assert.match(page, /lang === "tr" \? `%\$\{value\}` : `\$\{value\}%`/);
  assert.doesNotMatch(page, /<b>%\{(?:progress|avg|Number\(d\.progress)/);
});

test("shared record and import dialogs expose accessible names", () => {
  assert.match(page, /aria-label=\{names\[lang\]\[active\]\}/);
  assert.match(
    page,
    /aria-label=\{lang === "tr" \? "Excel içe aktar" : "Import Excel"\}/,
  );
  assert.ok((page.match(/aria-modal="true"/g) || []).length >= 5);
  assert.ok(
    (page.match(/"Pencereyi kapat" : "Close dialog"/g) || []).length >= 2,
  );
});

test("module catalogs expose operational tracking fields beyond the default view", () => {
  assert.match(page, /followUpOwner: "Takip Eden \/ Koordinatör"/);
  assert.match(page, /"Risk Assessment": \[\s*"category",\s*"businessUnit",\s*"owner",\s*"asset",\s*"actionOwner"/);
  assert.match(page, /"Varlık Envanteri": \[\s*"assetType",\s*"businessUnit",\s*"owner",\s*"technicalOwner",\s*"custodian"/);
  assert.match(page, /"Denetim Yönetimi": \[\s*"auditType",\s*"businessUnit",\s*"owner",\s*"followUpOwner"/);
  assert.match(page, /tr: "Atanan Kişi \/ İş Birimi"/);
});
