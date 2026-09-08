import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { AI_EVALUATION_BASELINE,scoreEvaluation,validateEvalCase,validateUseCase } from "../app/ai/governance";
import { callAiWithFailover,type AiRuntimeProfile } from "../app/ai/runtime-provider";

const governanceRoute=fs.readFileSync("app/api/ai/governance/route.ts","utf8"),evaluationRoute=fs.readFileSync("app/api/ai/evaluations/route.ts","utf8"),runtimeProvider=fs.readFileSync("app/ai/runtime-provider.ts","utf8"),storage=fs.readFileSync("app/ai/storage.ts","utf8"),chat=fs.readFileSync("app/api/ai/chat/route.ts","utf8"),drafts=fs.readFileSync("app/api/ai/drafts/route.ts","utf8");

test("AI use-case inventory validates risk classification, controls and real review dates",()=>{
  const value=validateUseCase({name:"Risk Copilot",purpose:"Risk owners receive human-reviewed recommendations",owner:"BGYS",dataClassification:"Confidential",impactLevel:"High",decisionRole:"Human-approved",controls:["RBAC","Audit"],reviewDate:"2026-12-01"});
  assert.equal(value.controls.length,2);
  assert.throws(()=>validateUseCase({...value,reviewDate:"2026-02-30"}),/gözden geçirme/);
  assert.throws(()=>validateUseCase({...value,dataClassification:"Top Secret"}),/sınıflandırması/);
});

test("evaluation scoring rewards expected coverage and rejects forbidden output",()=>{
  assert.deepEqual(scoreEvaluation("Risk owner review required",["risk","review"],["password"],1000,3000),{score:100,status:"passed",failureReason:""});
  const failed=scoreEvaluation("password is visible",["risk"],["password"],4000,3000);assert.equal(failed.status,"failed");assert.equal(failed.score,0);
  assert.throws(()=>validateEvalCase({name:"No checks",input:"test",expectedTerms:[],forbiddenTerms:[]}),/En az bir/);
});

test("built-in AI safety baseline is bounded, unique and idempotently installable",()=>{
  assert.equal(AI_EVALUATION_BASELINE.length,5);assert.equal(new Set(AI_EVALUATION_BASELINE.map(item=>item.id)).size,5);
  for(const item of AI_EVALUATION_BASELINE){assert.match(item.id,/^AIEV-BASELINE-/);assert.ok(item.expectedTerms.length||item.forbiddenTerms.length);}
  assert.match(evaluationRoute,/action==="seed-baseline"/);assert.match(evaluationRoute,/INSERT OR IGNORE INTO ai_eval_cases/);assert.match(evaluationRoute,/eval-baseline-install/);
});

test("governance and evaluation mutation endpoints are Admin-only and audited",()=>{
  assert.match(governanceRoute,/requireRole\(req,\["Admin"\]\)/);assert.match(governanceRoute,/recordAiEvent/);assert.match(governanceRoute,/confirmation!=="SİL"/);
  assert.match(evaluationRoute,/requireRole\(req,\["Admin"\]\)/);assert.match(evaluationRoute,/output_hash/);assert.doesNotMatch(evaluationRoute,/output_text|response_text/);
});

test("chat and draft generation use a bounded primary/fallback chain with health events",()=>{
  assert.match(runtimeProvider,/for\(const item of chain\)/);assert.match(runtimeProvider,/ai_provider_health/);assert.match(runtimeProvider,/profile:"primary"\|"fallback"/);
  assert.match(chat,/callAiWithFailover/);assert.match(drafts,/callAiWithFailover/);assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_provider_fallbacks/);
});

test("provider chain fails over once and records both health outcomes",async()=>{
  const originalFetch=globalThis.fetch,calls:string[]=[],events:unknown[][]=[];
  globalThis.fetch=async(input)=>{calls.push(String(input));return calls.length===1?new Response("{}",{status:503,headers:{"content-type":"application/json"}}):new Response(JSON.stringify({choices:[{message:{content:"safe fallback answer"}}]}),{status:200,headers:{"content-type":"application/json"}});};
  const db={prepare:()=>({bind:(...args:unknown[])=>({run:async()=>{events.push(args);}})})} as unknown as D1Database;
  const base={provider:"openai-compatible" as const,model:"model",apiKey:"",temperature:0.2,timeoutMs:5000,maxTokens:128,trustZone:"external" as const,maxDataClassification:"Internal" as const};
  const chain:AiRuntimeProfile[]=[{...base,profile:"primary",baseUrl:"https://primary.example"},{...base,profile:"fallback",baseUrl:"https://fallback.example"}];
  try{const result=await callAiWithFailover(db,chain,[{role:"user",content:"test"}],"unit-test");assert.equal(result.profile,"fallback");assert.equal(result.content,"safe fallback answer");assert.equal(calls.length,2);assert.equal(events.length,2);}finally{globalThis.fetch=originalFetch;}
});
