import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const connected = readFileSync("app/connected-grc.tsx", "utf8");
const css = readFileSync("app/connected-assurance-posture.css", "utf8");

test("Connected GRC surfaces operational continuous assurance posture", () => {
  assert.match(connected, /buildContinuousAssuranceChains/);
  assert.match(connected, /summarizeContinuousAssurance/);
  assert.match(connected, /className="connected-lifecycle-posture"/);
  assert.match(connected, /averageAssuranceScore/);
  assert.match(connected, /brokenChains/);
  assert.match(connected, /overdueRemediations/);
  assert.match(connected, /riskLinked/);
});

test("continuous assurance posture has responsive healthy attention and critical states", () => {
  assert.match(css, /\.connected-lifecycle-posture\{/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /article\.healthy/);
  assert.match(css, /article\.attention/);
  assert.match(css, /article\.critical/);
  assert.match(css, /var\(--ws-positive\)/);
  assert.match(css, /var\(--ws-warning\)/);
  assert.match(css, /var\(--ws-danger\)/);
  assert.match(css, /@media\(max-width:620px\)/);
});
