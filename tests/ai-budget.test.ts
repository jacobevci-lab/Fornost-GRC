import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { enforceAiBudget,estimatedCostMicrounits,normalizeAiUsage,validateAiBudgetPolicy } from "../app/ai/budget";

const provider=fs.readFileSync("app/ai/provider.ts","utf8"),runtime=fs.readFileSync("app/ai/runtime-provider.ts","utf8"),route=fs.readFileSync("app/api/ai/budget/route.ts","utf8"),storage=fs.readFileSync("app/ai/storage.ts","utf8"),schema=fs.readFileSync("db/schema.ts","utf8"),migration=fs.readFileSync("drizzle/0040_fornost_ai_budget.sql","utf8"),ui=fs.readFileSync("app/fornost-ai-budget.tsx","utf8"),metrics=fs.readFileSync("app/api/ai/metrics/route.ts","utf8");

test("provider token usage is normalized without retaining model content",()=>{
  assert.deepEqual(normalizeAiUsage(120,30),{promptTokens:120,completionTokens:30,metered:true});
  assert.deepEqual(normalizeAiUsage(undefined,-4),{promptTokens:0,completionTokens:0,metered:false});
  assert.match(provider,/prompt_eval_count/);assert.match(provider,/prompt_tokens/);assert.match(provider,/completion_tokens/);
  assert.doesNotMatch(storage,/prompt_text|response_text|model_answer/);
});

test("budget policy validation bounds limits, prices and currency",()=>{
  const value=validateAiBudgetPolicy({profile:"primary",monthlyTokenLimit:1_000_000,warnPercent:85,hardLimit:true,promptCostPerMillion:2.5,completionCostPerMillion:10,currency:"usd"});
  assert.equal(value.currency,"USD");assert.equal(value.hardLimit,true);assert.equal(estimatedCostMicrounits(normalizeAiUsage(1000,500),2.5,10),7500);
  assert.throws(()=>validateAiBudgetPolicy({...value,profile:"unknown"}),/profili/);
  assert.throws(()=>validateAiBudgetPolicy({...value,currency:"US"}),/Para birimi/);
});

test("hard budget guard is checked before every primary or fallback provider call",()=>{
  assert.match(runtime,/await enforceAiBudget\(db,item\.profile\)/);
  assert.match(runtime,/await recordAiUsage/);
  assert.match(runtime,/usage ledger write failed/);
  assert.match(runtime,/budgetExceeded\?"denied":"error"/);
  assert.match(runtime,/budgetFailures===chain\.length/);
  assert.match(runtime,/for\(const item of chain\)/);
});

test("hard budget rejects a profile only when its configured monthly allowance is consumed",async()=>{
  const db={prepare:(sql:string)=>({bind:()=>({first:async()=>sql.includes("ai_budget_policies")?{monthly_token_limit:100,hard_limit:1}:{tokens:100}})})} as unknown as D1Database;
  await assert.rejects(()=>enforceAiBudget(db,"primary"),/aylık token bütçesi doldu/);
});

test("budget API is Admin-only, bounded, audited and formula-safe",()=>{
  assert.match(route,/requireRole\(req,\["Admin"\]\)/);
  assert.match(route,/content-length/);assert.match(route,/ON CONFLICT\(profile\) DO UPDATE/);
  assert.match(route,/budget-policy-save/);assert.match(route,/date\('now','start of month'\)/);
  assert.match(ui,/\^\[=\+\\-@\]/);assert.match(ui,/Kanıt CSV/);assert.match(ui,/Limit dolunca çağrıları durdur/);
});

test("usage schema is indexed and available to on-prem self-heal",()=>{
  for(const text of [storage,schema,migration]){assert.match(text,/ai_budget_policies/);assert.match(text,/ai_usage_ledger/);assert.match(text,/ai_usage_ledger_profile_created_idx/);}
  assert.match(migration,/PRAGMA optimize/);assert.match(metrics,/AI kullanım bütçesi/);assert.match(metrics,/unmetered/);
});
