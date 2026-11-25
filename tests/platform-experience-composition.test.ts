import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("RootLayout delegates product augmenters to the platform experience boundary", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /import PlatformExperience from "\.\/platform-experience"/);
  assert.match(layout, /<BootstrapSecurityGate \/>/);
  assert.match(layout, /<PlatformExperience \/>/);
  assert.doesNotMatch(layout, /<DashboardV9Executive \/>/);
  assert.doesNotMatch(layout, /<ProductionHardening \/>/);
  assert.doesNotMatch(layout, /<FornostAiCopilot \/>/);
});

test("compatibility safety nets remain explicit and centralized", () => {
  const platform = readFileSync("app/platform-experience.tsx", "utf8");
  assert.match(platform, /Compatibility safety nets/);
  assert.match(platform, /<ProductionHardening \/>/);
  assert.match(platform, /<NavigationIntegrity \/>/);
  assert.match(platform, /One visible AI surface/);
  assert.match(platform, /<FornostAiCopilot \/>/);
});
