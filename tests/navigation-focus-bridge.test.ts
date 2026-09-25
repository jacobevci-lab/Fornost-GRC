import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const producer = readFileSync("app/navigation-focus.ts", "utf8");
const bridge = readFileSync("app/navigation-focus-bridge.tsx", "utf8");
const platformExperience = readFileSync("app/platform-experience.tsx", "utf8");

test("navigation producer persists record context before changing modules", () => {
  assert.match(producer, /rememberFocus\(target\)/);
  assert.match(producer, /button\?\.click\(\)/);
  assert.match(producer, /dispatchFocus\(target\)/);
  assert.match(producer, /window\.setTimeout\(\(\) => dispatchFocus\(target\), 0\)/);
});

test("focus bridge applies pending context to the active register", () => {
  assert.match(bridge, /sameDomainModule/);
  assert.match(bridge, /main \.table-card \.register-search input/);
  assert.match(bridge, /HTMLInputElement\.prototype/);
  assert.match(bridge, /new Event\("input", \{ bubbles: true \}\)/);
  assert.match(bridge, /consumePendingFornostFocus\(current\.module\)/);
  assert.match(bridge, /fornost-focus-row/);
  assert.match(bridge, /scrollIntoView/);
});

test("finding focus resets local filters and opens the native finding detail", () => {
  assert.match(bridge, /sameDomainModule\(request\.module, "Bulgular ve CAPA"\)/);
  assert.match(bridge, /function applyFindingFocus/);
  assert.match(bridge, /\.finding-toolbar input/);
  assert.match(bridge, /\.finding-toolbar select/);
  assert.match(bridge, /setControlledSelectValue\(status, "all"\)/);
  assert.match(bridge, /\.finding-table tbody tr/);
  assert.match(bridge, /match\.click\(\)/);
});

test("finding focus remains pending until the matching row is available", () => {
  const start = bridge.indexOf("function applyFindingFocus");
  const end = bridge.indexOf("function applyFocus");
  const adapter = bridge.slice(start, end);
  assert.match(adapter, /if \(!match\) return false/);
  assert.match(adapter, /return true/);
  assert.match(bridge, /if \(applyFocus\(current\)\) \{/);
});

test("PlatformExperience owns the single navigation focus consumer", () => {
  assert.match(platformExperience, /import NavigationFocusBridge from "\.\/navigation-focus-bridge"/);
  assert.match(platformExperience, /<NavigationFocusBridge \/>/);
});
