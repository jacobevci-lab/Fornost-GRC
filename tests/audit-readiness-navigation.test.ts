import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync("app/audit-readiness-gate.tsx", "utf8");
const css = readFileSync("app/audit-readiness-gate.css", "utf8");

test("audit readiness uses the shared navigation focus contract", () => {
  assert.match(gate, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.doesNotMatch(gate, /function navigateTo\(/);
});

test("missing audit evidence routes to the exact control reference", () => {
  assert.match(gate, /status === "missing"/);
  assert.match(gate, /module:\s*"Kontroller"\s*,\s*ref:\s*reference\s*,\s*kind:\s*"control"\s*,\s*source:\s*"audit-readiness"/);
});

test("stale audit evidence filters the evidence library by linked control", () => {
  assert.match(gate, /module:\s*"Kanıtlar"/);
  assert.match(gate, /filter:\s*\{\s*controlRef:\s*reference\s*\}/);
  assert.match(gate, /className=\{`audit-readiness-gap \$\{gap\.status\}`\}/);
  assert.match(css, /\.audit-readiness-list \.audit-readiness-gap/);
  assert.match(css, /cursor:pointer/);
});
