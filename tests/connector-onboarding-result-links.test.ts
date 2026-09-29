import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("connector onboarding consumes exact run result IDs", () => {
  const source = read("app/connector-onboarding-wizard-v2.tsx");

  assert.match(source, /setRunEvidenceId\(clean\(run\.evidenceId\)\)/);
  assert.match(source, /setRunFindingId\(clean\(run\.findingId\)\)/);
  assert.doesNotMatch(source, /findings\?\.find/);
  assert.doesNotMatch(source, /generatedFinding/);
  assert.match(source, /\["Bağlan", "Algıla", "Kontroller", "İzlemeyi Aç", "Sonuç"\]/);
  assert.match(source, /CONTROL → CONTINUOUS CONTROL RULE → EVIDENCE → AUTOMATION FINDING/);
});

test("run-rule response exposes the actual finding touched by the run", () => {
  const route = read("app/api/evidence-automation/route.ts");

  assert.match(route, /rule_id=\? AND evidence_id=\?/);
  assert.match(route, /\{ \.\.\.payload, findingId \}/);
  assert.match(route, /failures >= threshold/);
  assert.match(route, /rule\?\.auto_finding/);
});

test("result navigation passes exact IDs into focus filters", () => {
  const source = read("app/connector-onboarding-wizard-v2.tsx");

  assert.match(source, /filter: \{ ruleRef: id \}/);
  assert.match(source, /filter: \{ evidenceRef: id \}/);
  assert.match(source, /filter: \{ findingRef: id \}/);
  assert.match(source, /filter: \{ controlRef \}/);
});
