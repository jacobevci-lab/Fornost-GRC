import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/evidence/route.ts","utf8");
test("evidence screenshots work in cloud object storage and on-prem database storage",()=>{
  assert.match(route,/simple_evidence_files/);
  assert.match(route,/if\(env\.BUCKET\).*env\.BUCKET\.put/);
  assert.match(route,/INSERT INTO simple_evidence_files/);
  assert.match(route,/image\/png/);
  assert.match(route,/image\/jpeg/);
  assert.match(route,/image\/webp/);
});
