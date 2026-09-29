import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const attention = readFileSync("app/continuous-assurance-attention.tsx", "utf8");
const settings = readFileSync("app/integration-settings.tsx", "utf8");

test("attention panel consumes the authoritative operational insights and automation APIs", () => {
  assert.match(attention, /fetch\(withBasePath\("\/api\/evidence-automation\/operations-insights"\)/);
  assert.match(attention, /fetch\(withBasePath\("\/api\/evidence-automation"\)/);
  assert.match(attention, /if \(!insightResponse\.ok \|\| !automationResponse\.ok\)/);
  assert.match(attention, /if \(insightPayload\.available === false\)/);
  assert.match(attention, /setAvailable\(false\)/);
  assert.match(attention, /Operasyonel insight verisi alınamadı/);
  assert.match(attention, /Operational insight data unavailable/);
});

test("attention panel builds one record chain only from live active-rule identities", () => {
  assert.match(attention, /const activeRules = source\.enabled[\s\S]*rules\.filter\(\(rule\) => rule\.enabled && clean\(rule\.sourceId\) === sourceId\)/);
  assert.match(attention, /const activeRuleIds = new Set\(activeRules\.map\(\(rule\) => clean\(rule\.id\)\)\.filter\(Boolean\)\)/);
  assert.match(attention, /activeRuleIds\.has\(clean\(finding\.ruleId\)\)/);
  assert.match(attention, /activeRuleIds\.has\(clean\(run\.ruleId\)\)/);
  assert.match(attention, /const ruleId = clean\(latestFinding\?\.ruleId \|\| latestRun\?\.ruleId \|\| latestRule\?\.id\)/);
  assert.match(attention, /const controlRef = splitRefs\(focusRule\?\.controlRefs\)\[0\] \|\| ""/);
  assert.match(attention, /evidenceRef = latestFinding[\s\S]*clean\(latestFinding\.evidenceId\)[\s\S]*clean\(latestRun\?\.evidenceId\)/);
  assert.match(attention, /findingRef: clean\(latestFinding\?\.id\)/);
  assert.doesNotMatch(attention, /`CCM-\$\{/);
  assert.doesNotMatch(attention, /`EVD-AUTO-\$\{/);
});

test("attention actions deep-link with exact source, rule, control, evidence and finding refs", () => {
  assert.match(attention, /\{ sourceRef: ref \}/);
  assert.match(attention, /\{ ruleRef: ref \}/);
  assert.match(attention, /\{ findingRef: ref \}/);
  assert.match(attention, /source: "continuous-assurance-attention"/);
  assert.match(attention, /filter: \{ controlRef \}/);
  assert.match(attention, /filter: \{ evidenceRef \}/);
  assert.match(attention, /Kaynak → Kural → Kontrol → Kanıt → Bulgu/);
  assert.match(attention, /Source → Rule → Control → Evidence → Finding/);
  assert.match(attention, /disabled=\{!chain\.sourceId\}/);
  assert.match(attention, /disabled=\{!chain\.ruleId\}/);
  assert.match(attention, /disabled=\{!chain\.controlRef\}/);
  assert.match(attention, /disabled=\{!chain\.evidenceRef\}/);
  assert.match(attention, /disabled=\{!chain\.findingRef\}/);
});

test("attention queue exposes operational reasons and summary counters without inventing health", () => {
  assert.match(attention, /connector-errors/);
  assert.match(attention, /control-health/);
  assert.match(attention, /evidence-gap/);
  assert.match(attention, /due-backlog/);
  assert.match(attention, /no-active-rules/);
  assert.match(attention, /summary\?\.criticalConnectors/);
  assert.match(attention, /summary\?\.watchConnectors/);
  assert.match(attention, /summary\?\.evidenceGapRules/);
  assert.match(attention, /summary\?\.dueRules/);
  assert.match(attention, /summary\?\.errorRuns24h/);
  assert.match(attention, /Aksiyon gerektiren Continuous Assurance sinyali yok/);
  assert.match(attention, /No Continuous Assurance signal currently requires action/);
});

test("workflow integrations surface the attention panel next to the existing overview", () => {
  assert.match(settings, /import ContinuousAssuranceAttention from "\.\/continuous-assurance-attention"/);
  assert.match(settings, /kind==="ticketing"&&<IntegrationsOverview lang=\{lang\}\/\>/);
  assert.match(settings, /kind==="ticketing"&&<ContinuousAssuranceAttention lang=\{lang\}\/\>/);
});
