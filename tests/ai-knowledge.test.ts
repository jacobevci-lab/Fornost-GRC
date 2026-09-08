import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { chunkKnowledgeContent, enforceGroundedCitations, normalizeKnowledgeContent, retrieveApprovedKnowledge, searchApprovedKnowledge, validateKnowledgeInput } from "../app/ai/knowledge";
import { knowledgeFileType, normalizeExtractedDocumentText, validateKnowledgeFile } from "../app/ai/document-extraction";

const route=fs.readFileSync("app/api/ai/knowledge/route.ts","utf8"),searchRoute=fs.readFileSync("app/api/ai/knowledge/search/route.ts","utf8"),storage=fs.readFileSync("app/ai/storage.ts","utf8"),migration=fs.readFileSync("drizzle/0037_fornost_ai_knowledge.sql","utf8"),chat=fs.readFileSync("app/api/ai/chat/route.ts","utf8"),ui=fs.readFileSync("app/fornost-ai-knowledge.tsx","utf8");

test("knowledge ingestion normalizes active HTML and enforces types and bounds",()=>{
  const cleaned=normalizeKnowledgeContent(`<style>secret css</style><script>alert(1)</script><h1>Access Policy</h1><p>${"MFA is required. ".repeat(4)}</p>`,"html");
  assert.doesNotMatch(cleaned,/alert|secret css|<h1>/);assert.match(cleaned,/Access Policy/);
  assert.equal(validateKnowledgeInput({name:"IAM Policy",sourceType:"markdown",classification:"Internal",content:"MFA policy and access review requirements. ".repeat(2)}).classification,"Internal");
  assert.throws(()=>validateKnowledgeInput({name:"x",sourceType:"pdf",classification:"Secret",content:"x".repeat(100)}),/Kaynak adı|Desteklenmeyen/);
  assert.throws(()=>normalizeKnowledgeContent("x".repeat(160001),"text"),/160.000/);
});

test("PDF and DOCX knowledge ingestion is bounded before browser-side extraction",()=>{
  assert.equal(knowledgeFileType("Bilgi Güvenliği Politikası.PDF"),"pdf");
  assert.equal(knowledgeFileType("Olay Yönetimi.docx"),"docx");
  assert.equal(validateKnowledgeFile("policy.pdf",12*1024*1024),"pdf");
  assert.throws(()=>validateKnowledgeFile("archive.zip",100),/Desteklenmeyen/);
  assert.throws(()=>validateKnowledgeFile("oversized.docx",8*1024*1024+1),/8 MB/);
  assert.equal(normalizeExtractedDocumentText(`Başlık\r\n\r\n${"Kontrol gereksinimi ".repeat(4)}`).includes("\r"),false);
  assert.equal(validateKnowledgeInput({name:"Policy PDF",sourceType:"pdf",classification:"Internal",content:"Access control requirement. ".repeat(3)}).sourceType,"pdf");
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

test("retrieval ranking ignores common filler terms and citation enforcement removes invented IDs",async()=>{
  const db={prepare:()=>({all:async()=>({results:[{source_id:"abcdef12-0000",name:"IAM Policy",classification:"Internal",version:2,ordinal:0,content_text:"Administrators must use phishing-resistant MFA.",updated_at:"2026-09-07T00:00:00Z"},{source_id:"11111111-0000",name:"Backup Policy",classification:"Internal",version:1,ordinal:0,content_text:"Backups are retained for thirty days.",updated_at:"2026-09-08T00:00:00Z"}]})})} as unknown as D1Database;
  const matches=await searchApprovedKnowledge(db,"what is the administrator MFA policy");assert.equal(matches[0].ref,"KB-ABCDEF12-V2-C1");
  const grounded=enforceGroundedCitations("MFA zorunludur [KB-ABCDEF12-V2-C1, RSK-999]. [Öneri]",["KB-ABCDEF12-V2-C1"]);
  assert.equal(grounded.grounded,true);assert.deepEqual(grounded.citedRefs,["KB-ABCDEF12-V2-C1"]);assert.deepEqual(grounded.invalidRefs,["RSK-999"]);assert.doesNotMatch(grounded.answer,/RSK-999/);assert.match(grounded.answer,/\[Öneri\]/);
  const ungrounded=enforceGroundedCitations("Genel cevap",["KB-ABCDEF12-V2-C1"]);assert.equal(ungrounded.grounded,false);assert.match(ungrounded.answer,/Kaynak doğrulaması/);
});

test("knowledge lifecycle is Admin governed, versioned, confirmed and audited",()=>{
  assert.match(route,/requireRole\(req,\["Admin"\]\)/);assert.match(route,/body\.confirmation!=="YENİ SÜRÜM"/);assert.match(route,/"ONAYLA":"ARŞİVLE"/);assert.match(route,/body\.confirmation!=="SİL"/);assert.match(route,/recordAiEvent/);
  assert.match(route,/status='draft'/);assert.match(route,/Onaylı kaynak önce arşivlenmeli/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_knowledge_sources/);assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_knowledge_versions/);assert.match(migration,/UNIQUE\(source_id,version,ordinal\)/);
});

test("knowledge UI and copilot expose the governed citation contract",()=>{
  for(const label of ["Yönetişimli AI Bilgi Tabanı","Taslak Kaynak Oluştur","Yeni Sürüm","Restricted","Retrieval Laboratuvarı","İçerik & Geçmiş","PDF, DOCX","ham dosya sunucuya veya AI sağlayıcısına yüklenmez"])assert.match(ui,new RegExp(label));
  assert.match(ui,/type="file"/);assert.match(route,/normalized_content/);assert.match(searchRoute,/raw query not stored/);assert.match(searchRoute,/requireRole\(req,\["Admin","Editor"\]\)/);
  assert.match(chat,/knowledge-base chunks/);assert.match(chat,/enforceGroundedCitations/);assert.doesNotMatch(route,/callAiWithFailover|UPDATE simple_grc_records/);
});
