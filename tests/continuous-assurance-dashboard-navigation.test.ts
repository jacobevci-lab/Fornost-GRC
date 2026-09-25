import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync("app/continuous-assurance-dashboard.ts", "utf8");
const panel = readFileSync("app/continuous-assurance-dashboard-panel.tsx", "utf8");

test("dashboard priorities preserve assurance work action context", () => {
  assert.match(builder, /kind: "control" \| "finding" \| "work-item";\n  action: string;/);
  assert.match(builder, /kind: "control",\n      action: ""/);
  assert.match(builder, /kind: "finding",\n      action: ""/);
  assert.match(builder, /kind: "work-item",\n      action: work\.action/);
});

test("dashboard deep-links control and automation finding priorities to their exact records", () => {
  assert.match(panel, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(panel, /source: "continuous-assurance-dashboard"/);
  assert.match(panel, /filter: \{ ruleRef: item\.ruleId \}/);
  assert.match(panel, /filter: \{ findingRef: item\.findingId \}/);
  assert.match(panel, /item\.action === "control-retest"/);
});

test("dashboard record navigation remains available without a host module callback", () => {
  assert.match(panel, /<button type="button" className="ca-open" onClick=\{\(\) => open\(item\)\}/);
  assert.doesNotMatch(panel, /\{onOpenModule && <button type="button" className="ca-open"/);
});

test("approved CAPA work opens the canonical enterprise finding after maker-checker success", () => {
  assert.match(panel, /code\?: string/);
  assert.match(panel, /reviewed\.decision === "approve" && reviewed\.item\.action === "capa-promotion" && body\.code/);
  assert.match(panel, /module: "Bulgular ve CAPA"/);
  assert.match(panel, /filter: \{ findingRef: body\.code \}/);
});

test("automation findings are not mislabeled as canonical CAPA records", () => {
  assert.match(panel, /item\.kind === "finding" \? \(tr \? "Bulgu" : "Finding"\)/);
});
