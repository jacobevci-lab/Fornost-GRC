import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { agentContextQuery, agentSchemaInstruction, parseAgentResponse, validateAgentRequest } from "../app/ai/agents";

const route=fs.readFileSync("app/api/ai/agents/route.ts","utf8"),draftRoute=fs.readFileSync("app/api/ai/agents/draft/route.ts","utf8"),storage=fs.readFileSync("app/ai/storage.ts","utf8"),migration=fs.readFileSync("drizzle/0036_fornost_ai_agents.sql","utf8"),ui=fs.readFileSync("app/fornost-ai-agents.tsx","utf8");

const validRiskReport={executiveSummary:"İki kaynakta kritik risk tedavi boşluğu doğrulandı.",findings:[{title:"MFA tedavisi gecikmiş",summary:"Kritik varlığa bağlı riskin aksiyon tarihi geçmiş.",severity:"High",confidence:92,sourceRefs:["RSK-1","INVENTED"],recommendation:"Risk sahibi hedef tarihi ve MFA kapsamını güncellemeli.",draft:{kind:"risk-treatment",title:"MFA risk tedavisi",rationale:"Kaynaklı risk bulgusunu insan incelemesine taşır.",payload:{title:"MFA risk tedavisi",riskStatement:"Yönetici hesaplarında MFA kapsamı yetersiz.",proposedTreatment:"Tüm yönetici hesaplarında MFA zorunlu kılınmalı.",owner:"IAM Ekibi",dueDate:"2026-10-30",priority:"Yüksek"}}}]};

test("agent request and prompt contract are kind-scoped and bounded",()=>{
  assert.deepEqual(validateAgentRequest({kind:"risk",objective:"Kritik riskleri incele"}),{kind:"risk",objective:"Kritik riskleri incele"});
  assert.throws(()=>validateAgentRequest({kind:"unknown",objective:"Kritik riskleri incele"}),/Desteklenmeyen/);
  assert.match(agentContextQuery("evidence","Eski kayıtları bul"),/kanıt evidence/);
  assert.match(agentSchemaInstruction("audit"),/audit-finding/);
});

test("agent parser accepts only grounded refs and a fixed draft kind",()=>{
  const parsed=parseAgentResponse("risk",JSON.stringify(validRiskReport),["RSK-1"]);
  assert.deepEqual(parsed.findings[0].sourceRefs,["RSK-1"]);
  assert.equal(parsed.findings[0].draft.kind,"risk-treatment");
  assert.equal(parsed.findings[0].id,"F-1");
  assert.throws(()=>parseAgentResponse("risk",JSON.stringify({...validRiskReport,findings:[{...validRiskReport.findings[0],sourceRefs:["INVENTED"]}]}),["RSK-1"]),/kaynak referansı/);
  assert.throws(()=>parseAgentResponse("risk",JSON.stringify({...validRiskReport,findings:[{...validRiskReport.findings[0],draft:{...validRiskReport.findings[0].draft,kind:"audit-finding"}}]}),["RSK-1"]),/taslak türüne/);
});

test("agent runs are human-invoked, rate-limited, grounded and never mutate live records",()=>{
  assert.match(route,/requireRole\(req, \["Admin", "Editor"\]\)/);
  assert.match(route,/RUNS_PER_MINUTE = 2/);
  assert.match(route,/parseAgentResponse/);
  assert.match(route,/sourceId values/);
  assert.match(route,/no live record changed/);
  assert.doesNotMatch(route,/UPDATE simple_grc_records|INSERT INTO simple_grc_records/);
});

test("agent approval and draft conversion require separate Admin confirmations",()=>{
  assert.match(route,/requireRole\(req, \["Admin"\]\)/);
  assert.match(route,/status === "approved" \? "ONAYLA" : "ARŞİVLE"/);
  assert.match(draftRoute,/requireRole\(req, \["Admin"\]\)/);
  assert.match(draftRoute,/body\.confirmation !== "TASLAK OLUŞTUR"/);
  assert.match(draftRoute,/run\.status !== "approved"/);
  assert.match(draftRoute,/env\.DB\.batch/);
  assert.match(migration,/UNIQUE\(run_id,finding_id\)/);
});

test("agent schema self-heals and the UI exposes all four assurance agents",()=>{
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_agent_runs/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_agent_draft_links/);
  for(const label of ["Risk Agent","Audit Agent","Compliance Agent","Evidence Agent"])assert.match(ui,new RegExp(label));
  assert.match(ui,/Kontrollü Taslak Oluştur/);
  assert.match(ui,/TASLAK OLUŞTUR/);
});
