import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { agentContextQuery, agentSchemaInstruction, parseAgentResponse, validateAgentRequest } from "../app/ai/agents";
import { AI_AGENT_BUDGET, AI_AGENT_TOOL_REGISTRY, decideAgentPolicy } from "../app/ai/orchestration";

const route=fs.readFileSync("app/api/ai/agents/route.ts","utf8"),draftRoute=fs.readFileSync("app/api/ai/agents/draft/route.ts","utf8"),storage=fs.readFileSync("app/ai/storage.ts","utf8"),migration=fs.readFileSync("drizzle/0036_fornost_ai_agents.sql","utf8"),controlMigration=fs.readFileSync("drizzle/0075_ai_agent_control_plane.sql","utf8"),ui=fs.readFileSync("app/fornost-ai-agents.tsx","utf8"),copilot=fs.readFileSync("app/fornost-ai-copilot.tsx","utf8"),page=fs.readFileSync("app/page.tsx","utf8"),vendorUi=fs.readFileSync("app/third-party-risk.tsx","utf8");

const validRiskReport={executiveSummary:"İki kaynakta kritik risk tedavi boşluğu doğrulandı.",findings:[{title:"MFA tedavisi gecikmiş",summary:"Kritik varlığa bağlı riskin aksiyon tarihi geçmiş.",severity:"High",confidence:92,sourceRefs:["RSK-1","INVENTED"],recommendation:"Risk sahibi hedef tarihi ve MFA kapsamını güncellemeli.",draft:{kind:"risk-treatment",title:"MFA risk tedavisi",rationale:"Kaynaklı risk bulgusunu insan incelemesine taşır.",payload:{title:"MFA risk tedavisi",riskStatement:"Yönetici hesaplarında MFA kapsamı yetersiz.",proposedTreatment:"Tüm yönetici hesaplarında MFA zorunlu kılınmalı.",owner:"IAM Ekibi",dueDate:"2026-10-30",priority:"Yüksek"}}}]};

test("agent request and prompt contract are kind-scoped and bounded",()=>{
  assert.deepEqual(validateAgentRequest({kind:"risk",objective:"Kritik riskleri incele"}),{kind:"risk",objective:"Kritik riskleri incele"});
  assert.throws(()=>validateAgentRequest({kind:"unknown",objective:"Kritik riskleri incele"}),/Desteklenmeyen/);
  assert.match(agentContextQuery("evidence","Eski kayıtları bul"),/kanıt evidence/);
  assert.match(agentSchemaInstruction("audit"),/audit-finding/);
  assert.match(agentContextQuery("vendor","Kritik tedarikçileri incele"),/tedarik vendor/);
  assert.match(agentContextQuery("reporting","Yönetim özetini hazırla"),/risk varlık BIA/);
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
  assert.match(route,/RUNS_PER_MINUTE = AI_AGENT_BUDGET\.maxRunsPerMinute/);
  assert.match(route,/parseAgentResponse/);
  assert.match(route,/sourceId values/);
  assert.match(route,/no live record changed/);
  assert.match(route,/registerAgentControl/);
  assert.match(route,/recordAgentTraceEvent/);
  assert.match(route,/policyDecision\.decision === "deny"/);
  assert.match(route,/DELETE FROM ai_agent_trace_events WHERE trace_id=/);
  assert.match(route,/DELETE FROM ai_agent_controls WHERE trace_id=/);
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

test("agent schema self-heals and the UI exposes all six assurance agents",()=>{
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_agent_runs/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_agent_draft_links/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_agent_controls/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS ai_agent_trace_events/);
  assert.match(controlMigration,/trace_id TEXT PRIMARY KEY/);
  assert.match(controlMigration,/run_id TEXT NOT NULL UNIQUE/);
  assert.match(controlMigration,/human_approval_required INTEGER NOT NULL DEFAULT 1/);
  for(const label of ["Risk Agent","Audit Agent","Compliance Agent","Evidence Agent","Vendor Risk Agent","Executive Reporting Agent"])assert.match(ui,new RegExp(label));
  assert.match(ui,/Kontrollü Taslak Oluştur/);
  assert.match(ui,/TASLAK OLUŞTUR/);
});

test("agent control plane is read-only, bounded and human approval gated",()=>{
  assert.equal(AI_AGENT_TOOL_REGISTRY.vendor.mutation,false);
  assert.equal(AI_AGENT_TOOL_REGISTRY.reporting.output,"remediation-task");
  assert.deepEqual(AI_AGENT_TOOL_REGISTRY.audit.readScopes,["Denetim Yönetimi","Kontroller","Kanıtlar"]);
  assert.deepEqual(AI_AGENT_BUDGET,{maxSources:48,maxContextCharacters:16000,maxFindings:8,maxRunsPerMinute:2});
  assert.equal(decideAgentPolicy({role:"Editor",kind:"vendor",sourceCount:3}).decision,"allow-read-only");
  assert.equal(decideAgentPolicy({role:"Viewer",kind:"reporting",sourceCount:3}).code,"AI-AGENT-RBAC");
  assert.equal(decideAgentPolicy({role:"Admin",kind:"reporting",sourceCount:0}).code,"AI-AGENT-NO-SOURCE");
  assert.equal(decideAgentPolicy({role:"Admin",kind:"reporting",sourceCount:49}).code,"AI-AGENT-SOURCE-BUDGET");
});

test("vendor and reporting workspaces launch their scoped assurance agents",()=>{
  assert.match(copilot,/detail\.mode === "agent"/);
  assert.match(copilot,/setAgentKind\(detail\.agentKind\)/);
  assert.match(vendorUi,/agentKind:"vendor"/);
  assert.match(vendorUi,/AI Risk Analizi/);
  assert.match(page,/agentKind: "reporting"/);
  assert.match(page,/AI Yönetim Analizi/);
});
