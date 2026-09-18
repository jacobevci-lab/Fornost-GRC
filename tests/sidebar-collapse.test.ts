import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/workspace-system.css", "utf8");

test("desktop sidebar has persistent expanded compact and hidden modes", () => {
  assert.match(page, /sidebarMode, setSidebarMode/);
  assert.match(page, /fornost-grc-sidebar-mode/);
  assert.match(page, /"expanded" \| "compact" \| "hidden"/);
  assert.match(page, /sidebar-\$\{sidebarMode\}/);
  assert.match(page, /className="sidebar-view-controls"/);
  assert.match(page, /className="sidebar-restore"/);
  assert.match(page, /aria-controls="fornost-navigation"/);
  assert.match(page, /title=\{sidebarMode !== "expanded" \? names\[lang\]\[m\] : undefined\}/);
});

test("desktop navigation cycles from full width to icon rail to zero width", () => {
  assert.match(css, /\.shell\.sidebar-compact\{grid-template-columns:88px minmax\(0,1fr\)!important/);
  assert.match(css, /\.shell\.sidebar-hidden\{grid-template-columns:0 minmax\(0,1fr\)!important/);
  assert.match(css, /\.sidebar-restore\{position:fixed!important/);
  assert.match(css, /\.sidebar-hidden>aside\{opacity:0!important/);
  assert.match(css, /\.shell>aside nav\{[\s\S]*overflow-y:auto!important/);
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
