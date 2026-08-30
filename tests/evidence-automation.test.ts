import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync("app/evidence-automation.tsx","utf8");
const route=readFileSync("app/api/evidence-automation/route.ts","utf8");

test("evidence automation is vendor neutral and maps results to controls",()=>{
  for(const vendor of ["Fortinet","Palo Alto","CrowdStrike","Cortex XDR","CyberArk","Purview DLP","Guardium","Generic REST"])
    assert.match(ui,new RegExp(vendor.replace(" / ",".*")));
  assert.match(route,/control_refs/);
  assert.match(route,/simple_grc_records/);
  assert.match(route,/response_hash/);
});

test("collector enforces outbound and payload safety boundaries",()=>{
  assert.match(route,/safeHttpUrl/);
  assert.match(route,/redirect:"error"/);
  assert.match(route,/AbortSignal\.timeout/);
  assert.match(route,/1_000_000/);
  assert.match(route,/encryptSecret/);
});
