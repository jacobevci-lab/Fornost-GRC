import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/theme-integrity.css", "utf8");

test("the final theme integrity contract is loaded after every historical page skin", () => {
  const experience = page.indexOf('import "./product-experience.css"');
  const integrity = page.indexOf('import "./theme-integrity.css"');
  assert.ok(experience >= 0 && integrity > experience);
});

test("all core text, forms, registers, evidence, audit and reporting use semantic workspace tokens", () => {
  for (const selector of [
    ".form",
    "input:not([type=\"checkbox\"])",
    ".code",
    ".evidence-thumb-mark",
    ".audit-overview",
    ".audit-kpis article b",
    ".report-summary .kpi",
    ".fornost-ai-panel",
  ]) assert.ok(css.includes(selector), selector);
  for (const token of ["--ws-ink", "--ws-muted", "--ws-brand", "--ws-brand-2", "--ws-brand-soft", "--ws-line"]) {
    assert.ok(css.includes(`var(${token})`), token);
  }
});

test("the final authority contains no retired blue, navy or violet literals", () => {
  const retired = /#(?:13213a|3569e8|3766c8|315bc0|395bb0|4f46e5|4338ca|6366f1|6f63f4|635bff|655cff|574fe1|5b5bd6|9d98ff|a79cff|818cf8|8b5cf6|7c3aed|0a1220|111c2d|17243a|151f2f|26344b|314057)\b|rgba?\((?:124\s*,\s*108\s*,\s*255|99\s*,\s*91\s*,\s*255|79\s*,\s*70\s*,\s*229)/i;
  assert.doesNotMatch(css, retired);
});

test("operational text cannot regress to the historical 7–10 px scale", () => {
  assert.match(css, /html\[data-theme\] body \.shell>main :where\(div,p,span,small,b,strong,label,button,a,td,th,dt,dd,li,em,time,code,input,select,textarea,kbd,summary\)\{font-size:max\(12px,\.75rem\)!important/);
  assert.match(css, /html\[data-theme\] body \.shell>main :where\(label,button,input,select,textarea,td,dd\)\{font-size:max\(13px,\.8125rem\)!important/);
  assert.match(css, /\.shell>aside :where\(small,span,b,p,em\)\{font-size:12px!important/);
  assert.match(css, /\.fornost-ai-launcher :where\(span,i\)\{font-size:12px!important/);
});

test("dark modules use the approved amber heading accent without changing body copy", () => {
  assert.match(css, /--ws-heading-accent:#e8782f/);
  assert.match(css, /html\[data-theme="dark"\] body :is\(\.module-kicker,/);
  for (const selector of [
    ".integration-hub>header small",
    ".cockpit-titlebar>div>small",
    ".audit-kpis article b",
    ".evidence-thumb-mark",
    ".settings-card-head>div>small",
  ]) assert.ok(css.includes(selector), selector);
  assert.match(css, /html\[data-theme="dark"\] body :is\(\.code,td>a,/);
  assert.match(css, /html\[data-theme="dark"\] body :is\(\.audit-overview,\.module-overview,\.integration-hub>header,\.settings-card-head,\.soc2-readiness-card\)/);
  assert.match(css, /\.module-head h2\{font-size:26px!important;font-weight:740!important/);
  assert.match(css, /\.smart-table \.evidence-link b,\.audit-requirement-cell b\{font-size:14px!important/);
  assert.match(page, /className="module-kicker"/);
});

test("dark theme quarantines literal legacy violet interaction colours", () => {
  assert.match(css, /Legacy colour quarantine/);
  for (const selector of [
    ".register-view-actions button b",
    ".resizable-column:hover .column-resizer:after",
    ".audit-picker-note",
    ".fornost-ai-draft-editor",
    ".fornost-ai-edit-button",
  ]) assert.ok(css.includes(selector), selector);
});

test("desktop dialogs are centred outside the navigation rail", () => {
  assert.match(css, /\.shell>\.overlay\{z-index:120!important\}/);
  assert.match(css, /\.shell\.sidebar-expanded>\.overlay\{padding-left:316px!important\}/);
  assert.match(css, /@media\(max-width:900px\).*padding-left:20px!important/);
});
