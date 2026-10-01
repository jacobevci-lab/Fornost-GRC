import assert from "node:assert/strict";
import test from "node:test";
import { matchesWorkIdentity, isDueToday, paginateWork, findingWorkRows } from "../app/work-queue.ts";

test("inbox assignments use complete identities, never name or email substrings", () => {
  const user = { name: "Test", email: "test@example.com" };
  for (const value of ["Tester", "test2@example.com", "not-test@example.com", "Test <other@example.com>"]) assert.equal(matchesWorkIdentity([value], user), false);
  for (const value of ["Test", "TEST@EXAMPLE.COM", "Test User <test@example.com>", "Other; test@example.com"]) assert.equal(matchesWorkIdentity([value], user), true);
  assert.equal(matchesWorkIdentity([""], {}), false);
});
test("today includes the whole UTC due day and excludes missing dates", () => {
  const now = Date.parse("2026-10-01T14:00:00Z");
  assert.equal(isDueToday("2026-10-01", now), true);
  for (const value of ["2026-09-30", "2026-10-02", "", "invalid"]) assert.equal(isDueToday(value, now), false);
});
test("pagination reaches every item after 80 and clamps after filtering", () => {
  const items = Array.from({ length: 83 }, (_, i) => i);
  assert.deepEqual(Array.from({ length: 5 }, (_, page) => paginateWork(items, page).items).flat(), items);
  assert.deepEqual(paginateWork(items, 4).items, [80, 81, 82]);
  assert.equal(paginateWork(items.slice(0, 2), 4).page, 0);
  assert.equal(paginateWork([], 100).start, 0);
});
test("CAPA projection retains authoritative navigation identity and reviewer context", () => {
  const [row] = findingWorkRows({ findings: [{ id: "f1", code: "FND-001", title: "Review", owner: "owner@example.com", reviewer: "reviewer@example.com", status: "verification", dueDate: "2026-10-01", updatedAt: "2026-10-01T10:00:00Z" }, null, {}] });
  assert.equal(row.id, "finding:f1"); assert.equal(row.code, "FND-001");
  assert.equal(row.data.status, "verification"); assert.equal(row.data.reviewer, "reviewer@example.com");
  assert.deepEqual(findingWorkRows({ findings: {} }), []);
});
