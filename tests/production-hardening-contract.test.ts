import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("production hardening styles load statically from RootLayout", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const css = readFileSync("app/production-hardening.css", "utf8");
  assert.match(layout, /import "\.\/production-hardening\.css"/);
  assert.match(css, /Transitional static guardrails/);
  assert.match(css, /--fornost-on-brand/);
});

test("ProductionHardening no longer injects a runtime style element", () => {
  const source = readFileSync("app/production-hardening.tsx", "utf8");
  assert.doesNotMatch(source, /document\.createElement\("style"\)/);
  assert.doesNotMatch(source, /fornost-production-hardening/);
  assert.doesNotMatch(source, /hardeningCss/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /hardenDom/);
});
