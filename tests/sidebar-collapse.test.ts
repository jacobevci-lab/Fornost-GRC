import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/fornost-atlas.css", "utf8");

test("desktop sidebar can collapse and persists the operator preference", () => {
  assert.match(page, /sidebarCollapsed, setSidebarCollapsed/);
  assert.match(page, /fornost-grc-sidebar-collapsed/);
  assert.match(page, /sidebarCollapsed \? " sidebar-collapsed" : ""/);
  assert.match(page, /className="sidebar-edge-toggle"/);
  assert.match(page, /aria-controls="fornost-navigation"/);
  assert.match(page, /title=\{sidebarCollapsed \? names\[lang\]\[m\] : undefined\}/);
});

test("collapsed mode becomes an accessible icon rail and leaves mobile unchanged", () => {
  assert.match(css, /\.shell\.sidebar-collapsed\{grid-template-columns:76px minmax\(0,1fr\)!important/);
  assert.match(css, /\.sidebar-collapsed \.nav-group button>span/);
  assert.match(css, /\.sidebar-collapsed \.aside-note\{\s*display:none!important/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.sidebar-edge-toggle\{display:none!important/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("mobile navigation is a dismissible accessible drawer", () => {
  assert.match(page, /mobileNavOpen, setMobileNavOpen/);
  assert.match(page, /className="mobile-nav-toggle"/);
  assert.match(page, /className="mobile-nav-backdrop"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /document\.body\.classList\.add\("mobile-nav-locked"\)/);
  assert.match(css, /\.mobile-nav-open>aside\{transform:translateX\(0\)!important/);
  assert.match(css, /\.mobile-nav-open \.mobile-nav-backdrop/);
});
