import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { chunkKnowledgeContent, normalizeKnowledgeContent, retrieveApprovedKnowledge, validateKnowledgeInput } from "../app/ai/knowledge";

const route=fs.readFileSync("app/api/ai/knowledge/route.ts","utf8"),storage=fs.readFileSync("app/ai/storage.ts","utf8"),migration=fs.readFileSync("drizzle/0037_fornost_ai_knowledge.sql","utf8"),chat=fs.readFileSync("app/api/ai/chat/route.ts","utf8"),ui=fs.readFileSync("app/fornost-ai-knowledge.tsx","utf8");

test("knowledge ingestion normalizes active HTML and enforces types and bounds",()=>{
  const cleaned=normalizeKnowledgeContent(`<style>secret css</style><script>alert(1)</script><h1>Access Policy</h1><p>${"MFA is required. ".repeat(4)}</p>`,"html");
  assert.doesNotMatch(cleaned,/alert|secret css|<h1>/);assert.match(cleaned,/Access Policy/);
  assert.equal(validateKnowledgeInput({name:"IAM Policy",sourceType:"markdown",classification:"Internal",content:"MFA policy and access review requirements. ".repeat(2)}).classification,"Internal");
  assert.throws(()=>validateKnowledgeInput({name:"x",sourceType:"pdf",classification:"Secret",content:"x".repeat(100)}),/Kaynak adı|Desteklenmeyen/);
  assert.throws(()=>normalizeKnowledgeContent("x".repeat(160001),"text"),/160.000/);
});

test("knowledge chunking is bounded and overlaps long policy content",()=>{
  const chunks=chunkKnowledgeContent("Access controls and evidence requirements. ".repeat(120));
  assert.ok(chunks.length>2);assert.ok(chunks.length<=160);assert.ok(chunks.every(chunk=>chunk.length<=2001));
});

test("retrieval accepts only current approved non-Restricted chunks and returns grounded IDs",async()=>{
  let sql="";
  const db={prepare:(query:string)=>{sql=query;return{all:async()=>({results:[{source_id:"abcdef12-0000",name:"IAM Policy",classification:"Internal",version:2,ordinal:0,content_text:"Administrators must use phishing-resistant MFA. token=abcdefghijklmnopqrstuv",updated_at:"2026-09-07T00:00:00Z"}]})};}} as unknown as D1Database;
  const result=await retrieveApprovedKnowledge(db,"administrator MFA policy");
  assert.match(sql,/status='approved'/);assert.match(sql,/classification!='Restricted'/);assert.match(sql,/c\.version=s\.current_version/);
  assert.equal(result.sources[0].id,"KB-ABCDEF12-V2-C1");assert.match(result.contextText,/phishing-resistant MFA/);assert.doesNotMatch(result.contextText,/abcdefghijklmnopqrstuv/);
});

test("knowledge lifecycle is Admin governed, versioned, confirmed and audited",()=>{
  assert.match(route,/requireRole\(req,\["Admin"\]\)/);assert.match(route,/body\.confirmation!=="YENİ SÜRÜM"/);assert.match(route,/"ONAYLA":"ARŞİVLE"/);assert.match(route,/body\.confirmation!=="SİL"/);assert.match(route,/recordAiEvent/);
  assert.match(route,/status='draft'/);assert.match(route,/Onaylı kaynak önce arşivlenmeli/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_knowledge_sources/);assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_knowledge_versions/);assert.match(migration,/UNIQUE\(source_id,version,ordinal\)/);
});

test("knowledge UI and copilot expose the governed citation contract",()=>{
  for(const label of ["Yönetişimli AI Bilgi Tabanı","Taslak Kaynak Oluştur","Yeni Sürüm","Restricted"])assert.match(ui,new RegExp(label));
  assert.match(chat,/knowledge-base chunks/);assert.doesNotMatch(route,/callAiWithFailover|UPDATE simple_grc_records/);
});
