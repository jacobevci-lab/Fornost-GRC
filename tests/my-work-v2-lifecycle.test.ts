import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/my-work-v2.tsx", "utf8");

test("My Work separates attention, waiting, completed and undated lifecycle views", () => {
  assert.match(source, /type QueueFilter = "priority" \| "overdue" \| "soon" \| "waiting" \| "undated" \| "completed" \| "all"/);
  assert.match(source, /Waiting for others/);
  assert.match(source, /Completed in 30 days/);
  assert.match(source, /completedAt >= now - 30 \* DAY/);
  assert.match(source, /isWaitingForOthers/);
});

test("unassessed risks are treated as attention work rather than low-risk work", () => {
  assert.match(source, /assessedRiskScore\(row\.data\)/);
  assert.match(source, /if \(riskScore === null \|\| riskScore >= 17\) return 1/);
  assert.match(source, /Risk assessment pending/);
});

test("My Work opens the selected business record through the shared navigation focus contract", () => {
  assert.match(source, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(source, /source: "my-work"/);
  assert.match(source, /filter: \{ recordRef: recordCode\(row\) \}/);
  assert.match(source, /onClick=\{\(\) => navigateToRecord\(item\.row\)\}/);
  assert.doesNotMatch(source, /const NAV_LABELS/);
});
