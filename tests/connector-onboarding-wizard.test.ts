import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiRoute = readFileSync("app/api/evidence-automation/route.ts", "utf8");
const apiCore = readFileSync("app/api/evidence-automation/core.ts", "utf8");
const wizard = readFileSync("app/connector-onboarding-wizard-v2.tsx", "utf8");
const css = `${readFileSync("app/connector-onboarding-wizard.css", "utf8")}\n${readFileSync("app/connector-onboarding-wizard-v2.css", "utf8")}`;
const platform = readFileSync("app/platform-experience.tsx", "utf8");

test("connector discovery exposes structure without returning raw API values", () => {
  assert.match(apiCore, /if\(action==="discover-source"\)/);
  assert.match(apiCore, /discoverJsonPaths\(payload\)/);
  assert.match(apiCore, /suggestControls\(env\.DB,source,detected\.paths\)/);
  assert.match(apiCore, /paths,totalPaths:paths\.length,truncated/);
  assert.doesNotMatch(apiCore, /discover-source[^\n]+payload[,}]/);
});

test("source onboarding supports safe retry and returns stable IDs", () => {
  assert.match(apiCore, /requestedId=clean\(body\.sourceId,80\)/);
  assert.match(apiCore, /secret_ciphertext\|\|null/);
  assert.match(apiCore, /sourceId:id/);
  assert.match(apiCore, /ruleId:id/);
});

test("guided wizard follows authenticate detect map monitor and result stages", () => {
  assert.match(wizard, /Authenticate/);
  assert.match(wizard, /Detect/);
  assert.match(wizard, /Map Controls/);
  assert.match(wizard, /Enable Monitoring/);
  assert.match(wizard, /Result/);
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

test("completed onboarding keeps the first run connected with API-returned record IDs", () => {
  assert.match(wizard, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(wizard, /setRunEvidenceId\(clean\(run\.evidenceId\)\)/);
  assert.match(wizard, /setRunFindingId\(clean\(run\.findingId\)\)/);
  assert.doesNotMatch(wizard, /context\?\.findings\?\.find/);
  assert.doesNotMatch(wizard, /generatedFinding/);
  assert.match(apiRoute, /rule_id=\? AND evidence_id=\?/);
  assert.match(apiRoute, /\{ \.\.\.payload, findingId \}/);

  assert.match(wizard, /function openSource\(\)/);
  assert.match(wizard, /filter:\s*\{\s*sourceRef:\s*id\s*\}/);
  assert.match(wizard, /function openRule\(\)/);
  assert.match(wizard, /filter:\s*\{\s*ruleRef:\s*id\s*\}/);
  assert.match(wizard, /function openControl\(ref: string\)/);
  assert.match(wizard, /module:\s*"Kontroller"/);
  assert.match(wizard, /filter:\s*\{\s*controlRef\s*\}/);
  assert.match(wizard, /module:\s*"Kanıtlar"/);
  assert.match(wizard, /filter:\s*\{\s*evidenceRef:\s*id\s*\}/);
  assert.match(wizard, /filter:\s*\{\s*findingRef:\s*id\s*\}/);
  assert.match(wizard, /Kaynağı Aç/);
  assert.match(wizard, /Sürekli Kontrol Kuralı/);
  assert.match(wizard, /Kanıtı Aç/);
  assert.match(wizard, /Otomasyon Bulgusu/);
  assert.match(wizard, /selectedControlRows\.map\(\(item\) => <button/);
  assert.match(css, /\.cow-linked-controls button/);
  assert.match(css, /:focus-visible/);
});

test("wizard is mounted once through PlatformExperience", () => {
  assert.match(platform, /import ConnectorOnboardingWizard from "\.\/connector-onboarding-wizard"/);
  assert.match(platform, /<ConnectorOnboardingWizard \/>/);
});
