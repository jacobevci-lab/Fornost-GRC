import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/sidebar-collapse.css", "utf8");

test("desktop sidebar can collapse and persists the operator preference", () => {
  assert.match(page, /sidebarCollapsed, setSidebarCollapsed/);
  assert.match(page, /fornost-grc-sidebar-collapsed/);
  assert.match(page, /sidebarCollapsed \? " sidebar-collapsed" : ""/);
  assert.match(page, /className="sidebar-toggle"/);
  assert.match(page, /aria-controls="fornost-navigation"/);
  assert.match(page, /title=\{sidebarCollapsed \? names\[lang\]\[m\] : undefined\}/);
});

test("collapsed mode becomes an accessible icon rail and leaves mobile unchanged", () => {
  assert.match(css, /\.shell\.sidebar-collapsed\{\s*grid-template-columns:68px minmax\(0,1fr\)!important/);
  assert.match(css, /\.sidebar-collapsed \.nav-group button>span/);
  assert.match(css, /\.sidebar-collapsed \.aside-note\{\s*display:none!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.sidebar-toggle\{\s*display:none!important/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
