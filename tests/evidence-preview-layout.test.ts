import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/final-polish.css", "utf8");

test("evidence preview is isolated from the application grid", () => {
  assert.match(page, /import \{ createPortal \} from "react-dom"/);
  assert.match(page, /return createPortal\([\s\S]*document\.body/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"/);
  assert.match(css, /\.evidence-overlay\{[^}]*position:fixed!important[^}]*width:100vw!important[^}]*height:100dvh!important[^}]*z-index:1000!important/);
});

test("evidence preview header and metadata cannot be clipped", () => {
  assert.match(css, /\.evidence-preview-head\{[^}]*padding:18px 22px!important[^}]*transform:none!important[^}]*overflow:visible!important/);
  assert.match(css, /\.evidence-preview-head>div\{[^}]*min-width:0[^}]*text-indent:0!important[^}]*transform:none!important/);
  assert.match(css, /\.evidence-preview-head button\{[^}]*flex:0 0 34px/);
  assert.match(css, /\.evidence-meta>div\{min-width:0\}/);
});

test("evidence library table reserves readable title space", () => {
  assert.match(page, /module === "Kanıtlar" && c\.key === "evidenceTitle" \? 320 : 190/);
  assert.match(page, /`evidence-column evidence-column-\$\{c\.key\}`/);
  assert.match(css, /\.smart-table \.evidence-column-evidenceTitle\{min-width:320px/);
  assert.match(css, /\.smart-table \.evidence-link b,\.smart-table \.evidence-link small\{[^}]*overflow-wrap:break-word[^}]*word-break:normal/);
});
