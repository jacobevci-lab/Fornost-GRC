import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync("app/integrations-overview.tsx", "utf8");
const settings = readFileSync("app/integration-settings.tsx", "utf8");

test("integration overview reads configuration and continuous assurance from their real backends", () => {
  assert.match(overview, /fetch\(withBasePath\("\/api\/integrations"\)/);
  assert.match(overview, /fetch\(withBasePath\("\/api\/evidence-automation"\)/);
  assert.match(overview, /workflow = integrations\.find\(\(item\) => item\.kind === "ticketing"\)/);
  assert.match(overview, /identity = integrations\.find\(\(item\) => item\.kind === "identity"\)/);
  assert.match(overview, /email = integrations\.find\(\(item\) => item\.kind === "email"\)/);
});

test("integration overview routes users to specialist workspaces instead of duplicating configuration", () => {
  assert.match(overview, /navigateToFornost\(card\.module\)/);
  assert.match(overview, /module: "Kanıt Otomasyonu"/);
  assert.match(overview, /module: "Kimlik ve Erişim"/);
  assert.match(overview, /module: "E-posta ve Bildirimler"/);
});

test("workflow integration settings owns the single overview surface", () => {
  assert.match(settings, /import IntegrationsOverview from "\.\/integrations-overview"/);
  assert.match(settings, /kind==="ticketing"&&<IntegrationsOverview lang=\{lang\}\/>/);
});
