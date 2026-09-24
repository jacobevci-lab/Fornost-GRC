import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync("app/continuous-assurance-runtime.ts", "utf8");
const gate = readFileSync("scripts/full-product-qa-gate.mjs", "utf8");

test("continuous assurance initializes legacy D1 schema in a race-safe order", () => {
  assert.match(runtime, /const createWorkTable = `CREATE TABLE IF NOT EXISTS continuous_assurance_work_items/);
  assert.match(runtime, /async function tableHasColumn\([\s\S]*PRAGMA table_info/);
  assert.match(runtime, /ALTER TABLE \$\{table\} ADD COLUMN \$\{name\}[\s\S]*catch \(error\)[\s\S]*tableHasColumn\(db, table, name\)/);

  const ensureStart = runtime.indexOf("export async function ensureAssuranceWorkSchema");
  const createTable = runtime.indexOf("db.prepare(createWorkTable).run()", ensureStart);
  const addColumns = runtime.indexOf('addMissingColumns(db, "continuous_assurance_work_items", workColumns)', ensureStart);
  const createIndexes = runtime.indexOf("for (const sql of workIndexes)", ensureStart);
  assert.ok(ensureStart >= 0 && createTable > ensureStart && addColumns > createTable && createIndexes > addColumns);
});

test("production QA selects the visible responsive language switch", () => {
  assert.match(gate, /async function visibleLanguageControl\(page, label\)/);
  assert.match(gate, /page\.locator\("\.language-switch button"\)/);
  assert.match(gate, /const control = await visibleLanguageControl\(page, targetLabel\)/);
});

test("production QA restores the sidebar using current accessible labels", () => {
  assert.match(gate, /Ana menüyü aç\|Open main navigation/);
  assert.match(gate, /Hidden sidebar cannot be restored/);
});

test("production QA normalizes locale-switch findings only after the targeted contract passes", () => {
  assert.match(gate, /function isLocaleSwitchFinding\(item\)/);
  assert.ok(gate.includes('return /^Locale switch failed(?::\\s*(?:tr|en))?$/i.test(String(item?.title || "").trim());'));
  assert.match(gate, /const combined = `\$\{String\(item\?\.title \|\| ""\)\} \$\{String\(item\?\.detail \|\| ""\)\}`\.trim\(\)/);
  assert.match(gate, /targetedResponsivePasses\(item\) && isLocaleSwitchFinding\(item\)/);
  assert.match(gate, /superseded-by-visible-responsive-locale-contract/);
});
