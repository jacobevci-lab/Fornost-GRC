import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { extractProviderModels } from "../app/ai/provider";

const ticketRoute=fs.readFileSync("app/api/ai/drafts/ticket/route.ts","utf8");
const metricsRoute=fs.readFileSync("app/api/ai/metrics/route.ts","utf8");
const storage=fs.readFileSync("app/ai/storage.ts","utf8");
const copilot=fs.readFileSync("app/fornost-ai-copilot.tsx","utf8");
const readability=fs.readFileSync("app/fornost-ai-readability.css","utf8");

test("provider discovery normalizes OpenAI and Ollama model catalogs",()=>{
  assert.deepEqual(extractProviderModels("openai-compatible",{data:[{id:"gpt-local"},{id:"gpt-local"}]}),["gpt-local"]);
  assert.deepEqual(extractProviderModels("ollama",{models:[{name:"qwen3:14b"},{model:"llama3"}]}),["qwen3:14b","llama3"]);
});

test("remediation ticket publication is admin-only, approved-only and replay protected",()=>{
  assert.match(ticketRoute,/requireRole\(req,\["Admin"\]\)/);
  assert.match(ticketRoute,/confirmation!=="OLUŞTUR"/);
  assert.match(ticketRoute,/draft\.kind!=="remediation-task"\|\|draft\.status!=="approved"/);
  assert.match(ticketRoute,/NOT EXISTS\(SELECT 1 FROM ai_draft_tickets WHERE draft_id=\?\)/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_draft_tickets/);
  assert.match(storage,/draft_id TEXT NOT NULL UNIQUE/);
});

test("AI metrics are admin-only and never select prompt or answer bodies",()=>{
  assert.match(metricsRoute,/requireRole\(req,\["Admin"\]\)/);
  assert.doesNotMatch(metricsRoute,/prompt_hash|prompt_json|answer|content_refs_json/);
  assert.match(metricsRoute,/successRate/);
  assert.match(metricsRoute,/approvalRate/);
  assert.match(metricsRoute,/\[7,30,90\]/);assert.match(metricsRoute,/controls=/);assert.match(metricsRoute,/ai_knowledge_governance/);assert.match(metricsRoute,/providerHealth/);
  assert.match(copilot,/7,30,90/);assert.match(copilot,/CSV İndir/);assert.match(copilot,/Kontrol hazırlığı/);assert.match(copilot,/Son hatalar/);
  assert.match(copilot,/\^\[=\+\\-@\]/);
  assert.match(readability,/width:min\(560px/);assert.match(readability,/font-size:13px!important/);
});
