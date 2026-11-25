import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/evidence-automation/core.ts","utf8");

test("manual control runs reconcile approved assurance re-tests before responding",()=>{
  assert.match(route,/import \{ reconcileApprovedRetests \} from "\.\.\/\.\.\/continuous-assurance-runtime"/);
  assert.match(route,/action==="run-rule"[\s\S]*reconcileApprovedRetests\(env\.DB\)/);
  assert.match(route,/reconciledAssuranceWork:reconciled/);
});

test("scheduled due runs reconcile the assurance queue after the batch",()=>{
  assert.match(route,/action==="run-due"[\s\S]*await executeDueRules\(env,actorEmail\),reconciled=await reconcileApprovedRetests\(env\.DB\)/);
});
