import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reporting = readFileSync("app/reporting.css", "utf8");
const product = readFileSync("app/product-experience.css", "utf8");
const surface = readFileSync("app/enterprise-surface-contract.css", "utf8");
const premium = readFileSync("app/fornost-premium.css", "utf8");
const finalPolish = readFileSync("app/final-polish.css", "utf8");
const register = readFileSync("app/module-registers.css", "utf8");

test("reporting cannot inherit the retired multicolour KPI skin", () => {
  assert.match(reporting, /\.report-summary \.kpi::before,\.report-summary \.kpi::after\{content:none!important;display:none!important\}/);
  assert.match(product, /\.report-summary \.kpi::before,\.report-summary \.kpi::after\{content:none!important;display:none!important\}/);
  assert.doesNotMatch(premium, /\.kpi:nth-child\(/);
  assert.doesNotMatch(premium, /#9d98ff/i);
});

test("Ask Fornost keeps one stable desktop geometry across every tab", () => {
  assert.match(surface, /\.fornost-ai-panel\.is-compact,\.fornost-ai-panel\.is-workspace\{width:min\(450px,calc\(100vw - 32px\)\)!important;height:min\(720px,calc\(100dvh - 104px\)\)!important\}/);
  assert.doesNotMatch(surface, /\.fornost-ai-panel\.is-workspace\{width:min\(980px/);
});

test("reporting and register affordances use the graphite teal token contract", () => {
  for (const source of [reporting, product, finalPolish, register]) {
    for (const retired of ["#635bff", "#9d98ff", "#151f2f", "#314057", "#26344b"]) {
      assert.ok(!source.toLowerCase().includes(retired), `retired theme token leaked: ${retired}`);
    }
  }
  assert.match(finalPolish, /color:var\(--ws-brand-2\)/);
  assert.match(register, /accent-color:var\(--ws-brand\)/);
});

test("core module heroes and actions cannot fall back to the retired navy violet skin", () => {
  assert.match(product, /\.risk-summary,\.soc2-readiness-card\{[^}]*linear-gradient\(135deg,#0c4745,#123f3d 58%,#143331\)!important/);
  assert.match(product, /\.quick-actions button\{[^}]*background:var\(--ws-surface\)!important/);
  assert.match(product, /\.audit-scope-grid article\.phase-two>span,\.audit-count-chip\{background:var\(--ws-brand-soft\)!important;color:var\(--ws-brand-2\)!important\}/);
});
