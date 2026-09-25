import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/continuous-assurance/timeline/route.ts", "utf8");
const navigation = readFileSync("app/assurance-escalation-navigation.ts", "utf8");
const timeline = readFileSync("app/continuous-assurance-timeline.tsx", "utf8");
const css = readFileSync("app/continuous-assurance-timeline.css", "utf8");

test("timeline API enriches governed records with canonical navigation context", () => {
  assert.match(route, /SELECT id,code FROM enterprise_findings/);
  assert.match(route, /findingCodeById/);
  assert.match(route, /module:"Bulgular ve CAPA",recordRef:resultCode,filterKey:"findingRef"/);
  assert.match(route, /module:"Kanıt Otomasyonu",recordRef:ruleId,filterKey:"ruleRef"/);
  assert.match(route, /module:"Risk Assessment",recordRef:riskRef,filterKey:"riskRef"/);
});

test("timeline reuses the governed escalation destination mapper", () => {
  assert.match(route, /source_json FROM continuous_assurance_escalations/);
  assert.match(route, /assuranceEscalationNavigation\(kind,source\)/);
  assert.match(navigation, /function assuranceEscalationNavigation\(kind:string,source:Record<string,unknown>\)/);
  assert.match(navigation, /kind==="risk-review"&&riskRef/);
  assert.match(navigation, /module:"Kontroller",recordRef:controlRef,filterKey:"controlRef"/);
  assert.match(navigation, /kind==="mandatory-retest"\|\|kind==="retest-failure"/);
  assert.match(navigation, /module:"Kanıt Otomasyonu",recordRef:ruleRef,filterKey:"ruleRef"/);
});

test("timeline UI uses the shared focus bridge instead of generic module navigation", () => {
  assert.match(timeline, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(timeline, /type FilterKey="ruleRef"\|"findingRef"\|"riskRef"\|"controlRef"/);
  assert.match(timeline, /function openTimelineRecord\(event:TimelineEvent\)/);
  assert.match(timeline, /source:"continuous-assurance-timeline"/);
  assert.match(timeline, /filter:\{\[key\]:ref\}/);
  assert.match(timeline, /onClick=\{\(\)=>openTimelineRecord\(event\)\}/);
});

test("timeline exposes explicit bilingual action labels for governed destinations", () => {
  assert.match(timeline, /function recordActionLabel\(event:TimelineEvent,tr:boolean\)/);
  assert.match(timeline, /CAPA'yı Aç/);
  assert.match(timeline, /Open CAPA/);
  assert.match(timeline, /Kuralı Aç/);
  assert.match(timeline, /Open Rule/);
  assert.match(timeline, /Riski Aç/);
  assert.match(timeline, /Open Risk/);
  assert.match(timeline, /Kontrolü Aç/);
  assert.match(timeline, /Open Control/);
  assert.match(timeline, /aria-label=\{actionLabel\}/);
});

test("timeline only renders record actions when the API supplied safe navigation context", () => {
  assert.match(timeline, /event\.module&&event\.recordRef&&event\.filterKey/);
  assert.match(timeline, /if\(!targetModule\|\|!ref\|\|!key\)return false/);
  assert.match(css, /\.assurance-timeline-list footer button/);
  assert.match(css, /:focus-visible/);
});
