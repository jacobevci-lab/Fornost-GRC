import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/my-work-assurance-signals.tsx", "utf8");

test("assurance signals merge evidence integrity before control assurance scoring", () => {
  assert.match(source, /applyEvidenceIntegrity\(rows, history\)/);
  assert.match(source, /evidenceIntegrityCheckedVersions/);
  assert.match(source, /evidenceIntegrityFailedVersion/);
  assert.match(source, /buildControlAssurance\(assuranceRows\)/);
});

test("My Work assurance includes assigned enterprise findings and CAPA decisions", () => {
  assert.match(source, /fetch\(withBasePath\("\/api\/findings"\)/);
  assert.match(source, /module: "Bulgular ve CAPA"/);
  assert.match(source, /Open findings, verification or CAPA decisions are assigned to you/);
  assert.match(source, /identityMatches\(finding\.reviewer, user, scope\)/);
});

test("assurance scope follows Mine versus Organization and uses shared navigation", () => {
  assert.match(source, /function currentScope\(\): Scope/);
  assert.match(source, /scope === "organization" && user\.role === "Admin"/);
  assert.match(source, /navigateToFornost\(\{ module: signal\.module, source: "my-work-assurance" \}\)/);
  assert.doesNotMatch(source, /const labels: Record<string, string\[]>/);
});
