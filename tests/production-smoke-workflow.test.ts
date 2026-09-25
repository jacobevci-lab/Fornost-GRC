import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const workflow=readFileSync(".github/workflows/production-smoke-test.yml","utf8");
const smoke=readFileSync("scripts/production-smoke-test.mjs","utf8");

test("production smoke isolates push concurrency from schedule and manual runs",()=>{
 assert.match(workflow,/group: fornost-production-smoke-test-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}/);
 assert.match(workflow,/cancel-in-progress: \$\{\{ github\.event_name == 'push' \}\}/);
});

test("production smoke retries transient deployment overlap without hiding a persistent failure",()=>{
 assert.match(workflow,/for attempt in 1 2 3/);
 assert.match(workflow,/node scripts\/production-smoke-test\.mjs/);
 assert.match(workflow,/sleep 30/);
 assert.match(workflow,/exit "\$status"/);
});

test("smoke script performs authenticated relational CRUD and guaranteed cleanup",()=>{
 assert.match(smoke,/Dedicated smoke-test login/);
 assert.match(smoke,/D1 persistence \+ Asset\/Risk relationship/);
 assert.match(smoke,/Risk update persistence/);
 assert.match(smoke,/Synthetic record cleanup/);
 assert.match(smoke,/finally \{\s*await cleanup\(\);\s*\}/);
});
