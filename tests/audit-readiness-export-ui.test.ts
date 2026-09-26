import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const gate=readFileSync("app/audit-readiness-gate.tsx","utf8");

test("audit readiness gate exports scoped evidence and Continuous Assurance context",()=>{
  assert.match(gate,/downloadAuditReadinessReport/);
  assert.match(gate,/requirements:assurance\.requirements/);
  assert.match(gate,/assuranceSignals:scopedPriorities\.map/);
  assert.match(gate,/blocking:priorityBlocksAudit\(item\)/);
  assert.match(gate,/exportSnapshot\("html"\)/);
  assert.match(gate,/exportSnapshot\("csv"\)/);
  assert.match(gate,/HTML Özeti/);
});
