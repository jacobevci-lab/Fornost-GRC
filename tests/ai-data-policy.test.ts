import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { dataClassificationAllowed, inferProviderTrustZone, parseProviderDataPolicy, resolveProviderDataPolicy, strictestDataClassification } from "../app/ai/data-policy";
import { getEffectiveAiDataPolicy, type AiRuntimeProfile } from "../app/ai/runtime-provider";
import { searchApprovedKnowledge } from "../app/ai/knowledge";

const providers=fs.readFileSync("app/api/ai/providers/route.ts","utf8"),chat=fs.readFileSync("app/api/ai/chat/route.ts","utf8"),drafts=fs.readFileSync("app/api/ai/drafts/route.ts","utf8"),agents=fs.readFileSync("app/api/ai/agents/route.ts","utf8"),search=fs.readFileSync("app/api/ai/knowledge/search/route.ts","utf8"),ui=fs.readFileSync("app/fornost-ai-copilot.tsx","utf8");

test("provider trust zone is derived from the real endpoint and cannot be mislabeled",()=>{
  assert.equal(inferProviderTrustZone("https://ai.example.com/v1"),"external");
  assert.equal(inferProviderTrustZone("http://10.20.30.40:11434"),"private");
  assert.equal(inferProviderTrustZone("http://127.0.0.1:11434"),"local");
  assert.throws(()=>parseProviderDataPolicy("https://ai.example.com","private","Internal"),/uyuşmuyor/);
  assert.throws(()=>resolveProviderDataPolicy("https://ai.example.com",{trustZone:"external",maxDataClassification:"Confidential"}),/Confidential/);
});

test("fallback chain always applies the strictest maximum data classification",()=>{
  assert.equal(strictestDataClassification([{maxDataClassification:"Confidential"},{maxDataClassification:"Public"}]),"Public");
  const base={provider:"openai-compatible" as const,model:"model",apiKey:"",temperature:0.2,timeoutMs:5000,maxTokens:128,baseUrl:"https://ai.example.com",trustZone:"external" as const};
  const chain:AiRuntimeProfile[]=[{...base,profile:"primary",maxDataClassification:"Internal"},{...base,profile:"fallback",maxDataClassification:"Public"}];
  assert.equal(getEffectiveAiDataPolicy(chain).maxDataClassification,"Public");
});

test("Restricted is never allowed and unknown record classifications fail closed to Internal",()=>{
  assert.equal(dataClassificationAllowed("Restricted","Confidential"),false);
  assert.equal(dataClassificationAllowed("Confidential","Internal"),false);
  assert.equal(dataClassificationAllowed("Internal","Internal"),true);
  assert.equal(dataClassificationAllowed("Unexpected","Public"),false);
});

test("knowledge retrieval filters approved chunks to the effective provider policy",async()=>{
  const rows=[{source_id:"public001",name:"Policy",classification:"Public",version:1,ordinal:0,content_text:"administrator access policy",updated_at:"2026-09-08"},{source_id:"internal1",name:"Policy",classification:"Internal",version:1,ordinal:0,content_text:"administrator access policy",updated_at:"2026-09-08"},{source_id:"secret001",name:"Policy",classification:"Restricted",version:1,ordinal:0,content_text:"administrator access policy",updated_at:"2026-09-08"}];
  const db={prepare:()=>({all:async()=>({results:rows})})} as unknown as D1Database;
  const publicOnly=await searchApprovedKnowledge(db,"administrator policy","Public");
  assert.deepEqual(publicOnly.map(item=>item.classification),["Public"]);
  const internal=await searchApprovedKnowledge(db,"administrator policy","Internal");
  assert.deepEqual(new Set(internal.map(item=>item.classification)),new Set(["Public","Internal"]));
});

test("all context-bearing AI operations use and audit the effective policy",()=>{
  for(const route of [chat,drafts,agents]){assert.match(route,/getEffectiveAiDataPolicy/);assert.match(route,/dataPolicy\.maxDataClassification/);assert.match(route,/max \$\{dataPolicy\.maxDataClassification\}/);}
  assert.match(search,/getEffectiveAiDataPolicy/);
  assert.match(providers,/parseProviderDataPolicy/);assert.match(providers,/trustZone/);assert.match(providers,/maxDataClassification/);
  assert.match(ui,/Provider güven bölgesi/);assert.match(ui,/Fallback veri-egress kilidi/);assert.match(ui,/Restricted hiçbir sağlayıcıya gönderilmez/);
});
