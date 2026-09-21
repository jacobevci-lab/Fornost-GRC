import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/evidence-automation/route.ts","utf8");

test("manual control runs reconcile approved assurance re-tests before responding",()=>{
  assert.match(route,/import \{ reconcileApprovedRetests \} from "\.\.\/\.\.\/continuous-assurance-runtime"/);
  assert.match(route,/action==="run-rule"[\s\S]*reconcileApprovedRetests\(env\.DB\)/);
  assert.match(route,/reconciledAssuranceWork:reconciled/);
});

test("scheduled due runs reconcile the assurance queue after the batch",()=>{
  assert.match(route,/action==="run-due"[\s\S]*for\(const item of due\.results\)[\s\S]*reconcileApprovedRetests\(env\.DB\)/);
  const runDue=route.indexOf('if(action==="run-due")');
  const reconcile=route.indexOf("reconcileApprovedRetests(env.DB)",runDue);
  const loop=route.indexOf("for(const item of due.results)",runDue);
  assert.ok(runDue>=0&&loop>runDue&&reconcile>loop);
});
