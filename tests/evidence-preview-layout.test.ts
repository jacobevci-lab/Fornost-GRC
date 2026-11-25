import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/product-polish.css", "utf8");
const responsive = readFileSync("app/ui-accessibility.css", "utf8");
const base = readFileSync("app/globals.css", "utf8");

test("evidence preview is isolated from the application grid", () => {
  assert.match(page, /import \{ createPortal \} from "react-dom"/);
  assert.match(page, /return createPortal\([\s\S]*document\.body/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"/);
  assert.match(base, /\.overlay\{position:fixed;inset:0;[^}]*z-index:/);
});

test("evidence preview has a bounded viewport, natural header and responsive metadata", () => {
  assert.match(responsive, /width:min\(1120px,calc\(100vw - 32px\)\);max-height:calc\(100vh - 32px\)/);
  assert.match(css, /\.evidence-preview-head\{height:auto;[^}]*display:flex/);
  assert.match(responsive, /\.evidence-meta\{grid-template-columns:1fr\}/);
  assert.match(responsive, /overflow-wrap:anywhere/);
});

test("evidence library table reserves readable title space", () => {
  assert.match(page, /module === "Kanıtlar" && c\.key === "evidenceTitle" \? 320 : 190/);
  assert.match(page, /`evidence-column evidence-column-\$\{c\.key\}`/);
  assert.match(css, /\.evidence-link\{display:flex;[^}]*max-width:360px/);
  assert.match(css, /\.evidence-link>span:last-child\{display:grid/);
});
