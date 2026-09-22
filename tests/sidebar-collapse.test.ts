import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/workspace-system.css", "utf8");
const productCss = readFileSync("app/product-experience.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const tooltip = readFileSync("app/sidebar-icon-tooltip.tsx", "utf8");
const tooltipCss = readFileSync("app/sidebar-icon-tooltip.css", "utf8");

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

test("compact sidebar exposes immediate branded module tooltips without rail clipping", () => {
  assert.match(layout, /import SidebarIconTooltip from "\.\/sidebar-icon-tooltip"/);
  assert.match(layout, /<SidebarIconTooltip \/>/);
  assert.match(tooltip, /\.sidebar-compact #fornost-navigation button\[aria-label\]/);
  assert.match(tooltip, /getAttribute\("aria-label"\)/);
  assert.match(tooltip, /removeAttribute\("title"\)/);
  assert.match(tooltip, /setAttribute\("aria-describedby", tooltipId\)/);
  assert.match(tooltip, /createPortal\(/);
  assert.match(tooltip, /role="tooltip"/);
  assert.match(tooltip, /pointerover/);
  assert.match(tooltip, /focusin/);
  assert.match(tooltip, /event\.key === "Escape"/);
  assert.match(tooltipCss, /\.sidebar-icon-tooltip\{[\s\S]*position:fixed/);
  assert.match(tooltipCss, /z-index:160/);
  assert.match(tooltipCss, /var\(--ws-brand\)/);
  assert.match(tooltipCss, /@media\(max-width:620px\)\{[\s\S]*\.sidebar-icon-tooltip\{display:none!important\}/);
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

test("full navigation is a persisted single-section accordion", () => {
  assert.match(page, /openNavGroup, setOpenNavGroup/);
  assert.match(page, /fornost-grc-open-nav-group/);
  assert.match(page, /className="nav-group-trigger"/);
  assert.match(page, /aria-expanded=\{sidebarMode !== "expanded" \|\| openNavGroup === group\.id\}/);
  assert.match(page, /aria-controls=\{`nav-group-\$\{group\.id\}`\}/);
  assert.match(page, /hidden=\{sidebarMode === "expanded" && openNavGroup !== group\.id\}/);
  assert.match(productCss, /\.nav-group-items\[hidden\]\{display:none!important\}/);
  assert.match(productCss, /\.sidebar-compact \.nav-group-items/);
});
