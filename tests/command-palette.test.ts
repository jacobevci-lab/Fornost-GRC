import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const css = readFileSync("app/fornost-atlas.css", "utf8");

test("global command palette provides keyboard and pointer navigation", () => {
  assert.match(page, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(page, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(page, /event\.key === "ArrowDown"/);
  assert.match(page, /event\.key === "ArrowUp"/);
  assert.match(page, /event\.key === "Enter"/);
  assert.match(page, /role="listbox"/);
  assert.match(page, /role="option"/);
});

test("command palette respects roles and persists bounded recent modules", () => {
  assert.match(
    page,
    /currentUser\.role === "Admin" \|\| !adminModules\.has\(module\)/,
  );
  assert.match(page, /fornost-grc-recent-modules/);
  assert.match(page, /slice\(0, 5\)/);
  assert.match(page, /navigateToModule/);
});

test("command palette has responsive theme-owned presentation", () => {
  for (const selector of [
    ".command-trigger",
    ".command-overlay",
    ".command-palette",
    ".command-results",
  ])
    assert.ok(css.includes(selector), selector);
  assert.match(css, /@media\(max-width:620px\)[\s\S]*\.command-overlay/);
});
