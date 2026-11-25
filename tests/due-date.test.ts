import assert from "node:assert/strict";
import test from "node:test";
import { dueTimestamp, isPastDue } from "../app/due-date.ts";

test("a date-only deadline remains current throughout its due day", () => {
  for (const time of ["2026-10-01T00:00:00Z", "2026-10-01T10:29:00Z", "2026-10-01T23:59:59.999Z"]) {
    assert.equal(isPastDue("2026-10-01", Date.parse(time)), false);
  }
  assert.equal(isPastDue("2026-10-01", Date.parse("2026-10-02T00:00:00Z")), true);
});
test("explicit timestamp deadlines preserve their exact offset and time", () => {
  assert.equal(isPastDue("2026-10-01T13:00:00+03:00", Date.parse("2026-10-01T10:00:00.001Z")), true);
  assert.equal(isPastDue("2026-10-01T13:00:00+03:00", Date.parse("2026-10-01T09:59:59Z")), false);
});
test("missing or invalid dates do not become overdue signals", () => {
  for (const value of [undefined, null, "", "invalid", "2026-02-30", "2026-13-01"]) {
    assert.equal(dueTimestamp(value), Infinity);
    assert.equal(isPastDue(value), false);
  }
  assert.equal(dueTimestamp("2028-02-29"), Date.parse("2028-02-29T23:59:59.999Z"));
});
