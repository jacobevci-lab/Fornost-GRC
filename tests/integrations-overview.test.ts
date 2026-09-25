import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync("app/integrations-overview.tsx", "utf8");
const settings = readFileSync("app/integration-settings.tsx", "utf8");
const healthRoute = readFileSync("app/api/integrations/health/route.ts", "utf8");

test("integration overview reads configuration and continuous assurance from their real backends", () => {
  assert.match(overview, /fetch\(withBasePath\("\/api\/integrations"\)/);
  assert.match(overview, /fetch\(withBasePath\("\/api\/integrations\/health"\)/);
  assert.match(overview, /fetch\(withBasePath\("\/api\/evidence-automation"\)/);
  assert.match(overview, /workflow = integrations\.find\(\(item\) => item\.kind === "ticketing"\)/);
  assert.match(overview, /identity = integrations\.find\(\(item\) => item\.kind === "identity"\)/);
  assert.match(overview, /email = integrations\.find\(\(item\) => item\.kind === "email"\)/);
});

test("verified integration health expires instead of remaining green forever", () => {
  assert.match(overview, /VERIFICATION_FRESHNESS_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(overview, /function verificationAgeMs/);
  assert.match(overview, /age > VERIFICATION_FRESHNESS_MS \? "watch" : "healthy"/);
  assert.match(overview, /Doğrulama yenilenmeli/);
  assert.match(overview, /Verification is stale/);
  assert.match(overview, /Son doğrulama:/);
  assert.match(overview, /Last verified:/);
});

test("health telemetry outages are not misrepresented as pending connection tests", () => {
  assert.match(overview, /const \[healthAvailable, setHealthAvailable\] = useState\(true\)/);
  assert.match(overview, /if \(!response\.ok\) return \{ health: \{\}, available: false \}/);
  assert.match(overview, /setHealthAvailable\(healthPayload\.available !== false\)/);
  assert.match(overview, /if \(!configured\(item\) \|\| !healthAvailable\) return "neutral"/);
  assert.match(overview, /Sağlık verisi alınamadı/);
  assert.match(overview, /Health telemetry unavailable/);
});

test("integration health returns the latest test for every integration kind", () => {
  assert.match(healthRoute, /ROW_NUMBER\(\) OVER \(PARTITION BY kind ORDER BY created_at DESC, id DESC\)/);
  assert.match(healthRoute, /WHERE action='test'/);
  assert.match(healthRoute, /WHERE row_rank=1/);
  assert.doesNotMatch(healthRoute, /LIMIT 100/);
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
