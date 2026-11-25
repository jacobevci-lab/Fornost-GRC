import assert from "node:assert/strict";
import test from "node:test";
import { hasRecoveryTarget } from "../app/bia-recovery.ts";

test("zero-hour BIA objectives are defined for numeric and form values", () => {
  for (const value of [0, "0", 1, "24", 0.5]) assert.equal(hasRecoveryTarget(value), true);
});
test("absent, negative and invalid BIA objectives remain incomplete", () => {
  for (const value of [undefined, null, "", " ", "invalid", -1, "-1", Infinity, NaN, false]) {
    assert.equal(hasRecoveryTarget(value), false);
  }
});
