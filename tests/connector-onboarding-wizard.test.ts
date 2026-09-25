import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("app/api/evidence-automation/route.ts", "utf8");
const wizard = readFileSync("app/connector-onboarding-wizard.tsx", "utf8");
const platform = readFileSync("app/platform-experience.tsx", "utf8");

test("connector discovery exposes structure without returning raw API values", () => {
  assert.match(api, /if\(action==="discover-source"\)/);
  assert.match(api, /discoverJsonPaths\(payload\)/);
  assert.match(api, /suggestControls\(env\.DB,source,detected\.paths\)/);
  assert.match(api, /paths,totalPaths:paths\.length,truncated/);
  assert.doesNotMatch(api, /discover-source[^\n]+payload[,}]/);
});

test("source onboarding supports safe retry and returns stable IDs", () => {
  assert.match(api, /requestedId=clean\(body\.sourceId,80\)/);
  assert.match(api, /secret_ciphertext\|\|null/);
  assert.match(api, /sourceId:id/);
  assert.match(api, /ruleId:id/);
});

test("guided wizard follows authenticate detect map and monitor stages", () => {
  assert.match(wizard, /Authenticate/);
  assert.match(wizard, /Detect/);
  assert.match(wizard, /Map Controls/);
  assert.match(wizard, /Enable Monitoring/);
  assert.match(wizard, /action\s*:\s*"discover-source"/);
  assert.match(wizard, /action\s*:\s*"save-rule"/);
  assert.match(wizard, /action\s*:\s*"run-rule"/);
});

test("control suggestions require explicit human approval before monitoring", () => {
  assert.match(wizard, /selectedControls/);
  assert.match(wizard, /type="checkbox"/);
  assert.match(wizard, /disabled=\{!selectedControls\.length\}/);
  assert.match(wizard, /controlRefs\s*:\s*selectedControls\.join/);
});

test("completed onboarding keeps the first run connected to evidence and generated findings", () => {
  assert.match(wizard, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(wizard, /setRunEvidenceId\(clean\(run\.evidenceId\)\)/);
  assert.match(wizard, /context\?\.findings\?\.find\(\(item\) => item\.ruleId === id && item\.status !== "closed"\)/);
  assert.match(wizard, /module: "Kanıtlar"/);
  assert.match(wizard, /filter: \{ evidenceRef: runEvidenceId \}/);
  assert.match(wizard, /module: "Kanıt Otomasyonu"/);
  assert.match(wizard, /filter: \{ findingRef: runFindingId \}/);
  assert.match(wizard, /Kanıtı Aç/);
  assert.match(wizard, /Bulguyu Aç/);
});

test("wizard is mounted once through PlatformExperience", () => {
  assert.match(platform, /import ConnectorOnboardingWizard from "\.\/connector-onboarding-wizard"/);
  assert.match(platform, /<ConnectorOnboardingWizard \/>/);
});
