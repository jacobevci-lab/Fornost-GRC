import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/fornost-aegis.css", "utf8");

test("desktop sidebar can collapse and persists the operator preference", () => {
  assert.match(page, /sidebarCollapsed, setSidebarCollapsed/);
  assert.match(page, /fornost-grc-sidebar-collapsed/);
  assert.match(page, /sidebarCollapsed \? " sidebar-collapsed" : ""/);
  assert.match(page, /className="sidebar-edge-toggle"/);
  assert.match(page, /aria-controls="fornost-navigation"/);
  assert.match(page, /title=\{sidebarCollapsed \? names\[lang\]\[m\] : undefined\}/);
});

test("collapsed mode fully dismisses desktop navigation and leaves a visible edge control", () => {
  assert.match(css, /\.shell\.sidebar-collapsed\{grid-template-columns:0 minmax\(0,1fr\)!important/);
  assert.match(css, /\.sidebar-collapsed \.sidebar-edge-toggle\{left:14px!important/);
  assert.match(css, /\.sidebar-collapsed>aside\{padding:0!important;opacity:0!important/);
  assert.match(css, /\.sidebar-collapsed \.brand,\.sidebar-collapsed>aside nav,\.sidebar-collapsed \.aside-note/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.sidebar-collapsed>aside/);
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
