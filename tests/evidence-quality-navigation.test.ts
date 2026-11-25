import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lens = readFileSync("app/evidence-quality-lens.tsx", "utf8");
const css = readFileSync("app/evidence-quality-lens.css", "utf8");

test("evidence quality signals use stable rendered evidence ids with shared focus navigation", () => {
  assert.match(lens, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(lens, /recordRef: string/);
  assert.match(lens, /const recordRef = text\(row\.data\.evidenceId \|\| row\.id\)/);
  assert.match(lens, /issues\.push\(\{ id: `\$\{row\.id\}:\$\{kind\}`, recordRef, title/);
  assert.match(lens, /module: "Kanıtlar"/);
  assert.match(lens, /source: "evidence-quality"/);
  assert.match(lens, /filter: \{ recordRef: issue\.recordRef \}/);
});

test("evidence quality issues are keyboard-accessible actions", () => {
  assert.match(lens, /<button type="button" key=\{issue\.id\} className=\{`eql-issue \$\{issue\.kind\}`\}/);
  assert.match(css, /\.eql-list \.eql-issue/);
  assert.match(css, /cursor:pointer/);
  assert.match(css, /:focus-visible/);
});
