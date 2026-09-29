import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overview = readFileSync("app/integrations-overview.tsx", "utf8");
const settings = readFileSync("app/integration-settings.tsx", "utf8");
const healthRoute = readFileSync("app/api/integrations/health/route.ts", "utf8");
const automationRoute = readFileSync("app/api/evidence-automation/route.ts", "utf8");

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
  assert.match(overview, /if \(!configAvailable \|\| !configured\(item\) \|\| !healthAvailable\) return "neutral"/);
  assert.match(overview, /Sağlık verisi alınamadı/);
  assert.match(overview, /Health telemetry unavailable/);
});

test("configuration and assurance API outages render unknown instead of false zero states", () => {
  assert.match(overview, /const \[configAvailable, setConfigAvailable\] = useState\(true\)/);
  assert.match(overview, /const \[automationAvailable, setAutomationAvailable\] = useState\(true\)/);
  assert.match(overview, /setConfigAvailable\(integrationResponse\.ok\)/);
  assert.match(overview, /setAutomationAvailable\(available\)/);
  assert.match(overview, /Yapılandırma verisi alınamadı/);
  assert.match(overview, /Configuration unavailable/);
  assert.match(overview, /Sürekli güvence verisi alınamadı/);
  assert.match(overview, /Continuous assurance data unavailable/);
  assert.match(overview, /metric: !configAvailable \? "—"/);
  assert.match(overview, /metric: automationAvailable \? String\(operationalRules\.length\) : "—"/);
});

test("aggregate connector readiness only counts enabled sources with active rules", () => {
  assert.match(overview, /const enabledSources = sources\.filter\(\(item\) => item\.enabled\)/);
  assert.match(overview, /const enabledSourceIds = new Set\(enabledSources\.map\(\(item\) => clean\(item\.id\)\)\.filter\(Boolean\)\)/);
  assert.match(overview, /const operationalRules = rules\.filter\(\(item\) => item\.enabled && enabledSourceIds\.has\(clean\(item\.sourceId\)\)\)/);
  assert.match(overview, /const operationalUnhealthy = operationalRules\.filter\(\(item\) => \["failing", "stale", "missing"\]\.includes\(clean\(item\.health\)\)\)\.length/);
  assert.match(overview, /const pendingRuleRuns = operationalRules\.filter\(\(item\) => !clean\(item\.lastRunAt\)\)\.length/);
  assert.match(overview, /const sourcesWithoutActiveRules = enabledSources\.filter/);
  assert.match(overview, /Etkin güvenlik kaynağı yok/);
  assert.match(overview, /No enabled security sources/);
  assert.match(overview, /kontrol ilk çalıştırmayı bekliyor/);
  assert.match(overview, /controls await first run/);
  assert.match(overview, /kaynakta aktif kural yok/);
  assert.match(overview, /sources have no active rule/);
  assert.match(overview, /metric: automationAvailable \? String\(operationalRules\.length\) : "—"/);
  assert.doesNotMatch(overview, /const enabledRules = rules\.filter/);
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

test("new security connector action opens the guided wizard after module navigation", () => {
  assert.match(overview, /function openConnectorWizard\(\)/);
  assert.match(overview, /navigateToFornost\("Kanıt Otomasyonu"\)/);
  assert.match(overview, /querySelector<HTMLButtonElement>\("main \.cow-launch"\)/);
  assert.match(overview, /launch\.click\(\)/);
  assert.match(overview, /attempts < 24/);
  assert.match(overview, /window\.setTimeout\(open, 90\)/);
  assert.match(overview, /onClick=\{openConnectorWizard\}/);
});

test("automation GET exposes authoritative rule identity for recent runs", () => {
  assert.match(automationRoute, /SELECT id,rule_id FROM evidence_automation_runs ORDER BY created_at DESC LIMIT 100/);
  assert.match(automationRoute, /new Map\(rows\.results\.map\(\(row\) => \[text\(row\.id\), text\(row\.rule_id\)\]\)\)/);
  assert.match(automationRoute, /ruleId: ruleIds\.get\(text\(run\.id\)\) \|\| ""/);
});

test("connector operations handoff is built from live source, rule, run and finding records", () => {
  assert.match(overview, /runs\?: Run\[\]/);
  assert.match(overview, /findings\?: Finding\[\]/);
  assert.match(overview, /rules\.filter\(\(item\) => clean\(item\.sourceId\) === sourceId\)/);
  assert.match(overview, /ruleIds\.has\(clean\(item\.ruleId\)\)/);
  assert.match(overview, /clean\(item\.ruleId\) && activeRuleIds\.has\(clean\(item\.ruleId\)\)/);
  assert.match(overview, /Kaynak → Kural → Kontrol → Kanıt → Bulgu/);
  assert.match(overview, /Source → Rule → Control → Evidence → Finding/);
});

test("connector readiness is based on active-rule execution rather than disabled-rule history", () => {
  assert.match(overview, /const activeRules = source\.enabled \? linkedRules\.filter\(\(item\) => item\.enabled\) : \[\]/);
  assert.match(overview, /const activeRuleIds = new Set\(activeRules\.map\(\(item\) => clean\(item\.id\)\)\.filter\(Boolean\)\)/);
  assert.match(overview, /const latestActiveRule = \[\.\.\.activeRules\][\s\S]*timestamp\(b\.lastRunAt\) - timestamp\(a\.lastRunAt\)/);
  assert.match(overview, /const hasActiveRunHistory = activeRules\.some\(\(item\) => Boolean\(clean\(item\.lastRunAt\)\)\)/);
  assert.match(overview, /const activeRuns = runs[\s\S]*activeRuleIds\.has\(clean\(item\.ruleId\)\)/);
  assert.match(overview, /activeRules\.length && !hasActiveRunHistory/);
  assert.match(overview, /İlk kontrol çalıştırması bekliyor/);
  assert.match(overview, /First control run pending/);
  assert.doesNotMatch(overview, /const sourceRuns = runs/);
});

test("connector rows expose runtime telemetry without treating due schedules as health failures", () => {
  assert.match(overview, /schedule\?: string/);
  assert.match(overview, /nextRunAt\?: string/);
  assert.match(overview, /freshness\?: string/);
  assert.match(overview, /function relativeAutomationTime/);
  assert.match(overview, /const snapshotNow = updatedAt\?\.getTime\(\) \|\| 0/);
  assert.match(overview, /const evidenceReadyCount = activeRules\.filter\(\(item\) => Boolean\(clean\(item\.lastEvidenceAt\)\)\)\.length/);
  assert.match(overview, /const scheduledRules = activeRules[\s\S]*clean\(item\.nextRunAt\)/);
  assert.match(overview, /const dueRuleCount = snapshotNow[\s\S]*next > 0 && next <= snapshotNow/);
  assert.match(overview, /const nextActiveRule = snapshotNow[\s\S]*timestamp\(item\.nextRunAt\) > snapshotNow/);
  assert.match(overview, /Son çalışma/);
  assert.match(overview, /Last run/);
  assert.match(overview, /çalışma zamanı geldi/);
  assert.match(overview, /due now/);
  assert.match(overview, /Kanıt kapsamı/);
  assert.match(overview, /Evidence coverage/);
  const toneBlock = overview.match(/const sourceTone: Tone =[\s\S]*?;\n    const status/)?.[0] || "";
  assert.doesNotMatch(toneBlock, /dueRuleCount/);
  assert.doesNotMatch(overview, /operationalUnhealthy[^;]*dueRuleCount/);
});

test("connector operational links stay on one authoritative assurance chain", () => {
  assert.match(overview, /const focusRuleId = clean\(latestFinding\?\.ruleId \|\| latestActiveRun\?\.ruleId \|\| latestActiveRule\?\.id\)/);
  assert.match(overview, /linkedRules\.find\(\(item\) => clean\(item\.id\) === focusRuleId\) \|\| latestActiveRule \|\| linkedRules\[0\]/);
  assert.match(overview, /const focusControl = splitRefs\(focusRule\?\.controlRefs\)\[0\] \|\| ""/);
  assert.match(overview, /const focusEvidenceId = latestFinding[\s\S]*clean\(latestFinding\.evidenceId\)[\s\S]*clean\(latestActiveRun\?\.ruleId\) === clean\(focusRule\?\.id\)[\s\S]*clean\(latestActiveRun\?\.evidenceId\)/);
  assert.match(overview, /const focusFindingId = clean\(latestFinding\?\.id\)/);
  assert.match(overview, /disabled=\{!focusRuleId\}/);
  assert.match(overview, /disabled=\{!row\.focusControl\}/);
  assert.match(overview, /disabled=\{!row\.focusEvidenceId\}/);
  assert.match(overview, /disabled=\{!row\.focusFindingId\}/);
  assert.doesNotMatch(overview, /const primaryRule = row\.activeRules\[0\]/);
  assert.doesNotMatch(overview, /const primaryControl = row\.controlRefs\[0\]/);
});

test("connector operations deep links use authoritative record IDs without deriving fake evidence or finding refs", () => {
  assert.match(overview, /const filter: Record<string, string>/);
  assert.match(overview, /\{ sourceRef: ref \}/);
  assert.match(overview, /\{ ruleRef: ref \}/);
  assert.match(overview, /\{ findingRef: ref \}/);
  assert.match(overview, /source: "integrations-overview", filter/);
  assert.match(overview, /filter: \{ controlRef \}/);
  assert.match(overview, /filter: \{ evidenceRef \}/);
  assert.doesNotMatch(overview, /`CCM-\$\{/);
  assert.doesNotMatch(overview, /`EVD-AUTO-\$\{/);
});

test("workflow integration settings owns the single overview surface", () => {
  assert.match(settings, /import IntegrationsOverview from "\.\/integrations-overview"/);
  assert.match(settings, /kind==="ticketing"&&<IntegrationsOverview lang=\{lang\}\/>/);
});
