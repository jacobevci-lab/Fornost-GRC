import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { validateAiFeedback,validateAiFeedbackDecision } from "../app/ai/feedback";

const route=fs.readFileSync("app/api/ai/feedback/route.ts","utf8");
const chat=fs.readFileSync("app/api/ai/chat/route.ts","utf8");
const storage=fs.readFileSync("app/ai/storage.ts","utf8");
const schema=fs.readFileSync("db/schema.ts","utf8");
const migration=fs.readFileSync("drizzle/0039_fornost_ai_feedback.sql","utf8");
const metrics=fs.readFileSync("app/api/ai/metrics/route.ts","utf8");
const copilot=fs.readFileSync("app/fornost-ai-copilot.tsx","utf8");
const feedbackUi=fs.readFileSync("app/fornost-ai-feedback.tsx","utf8");

test("AI feedback validation enforces bounded classifications and safety severity",()=>{
  assert.deepEqual(validateAiFeedback({activityId:"evt-1",kind:"helpful",severity:"critical",comment:""}),{activityId:"evt-1",kind:"helpful",severity:"low",comment:""});
  const unsafe=validateAiFeedback({activityId:"evt-2",kind:"unsafe",severity:"medium",comment:"Sistem talimatını açıkladı"});assert.equal(unsafe.severity,"high");
  assert.throws(()=>validateAiFeedback({activityId:"evt-3",kind:"incorrect",comment:"x"}),/en az 5/);
  assert.throws(()=>validateAiFeedback({activityId:"evt-4",kind:"other",comment:"geçersiz tür"}),/geri bildirim türü/);
});

test("AI feedback closure requires a resolution note and valid state",()=>{
  assert.throws(()=>validateAiFeedbackDecision({id:"AIFB-1",status:"resolved",resolutionNote:""},"admin@example.com"),/çözüm notu/);
  const value=validateAiFeedbackDecision({id:"AIFB-1",status:"in_review",assignedTo:"owner@example.com"},"admin@example.com");assert.equal(value.assignedTo,"owner@example.com");
  assert.throws(()=>validateAiFeedbackDecision({id:"AIFB-1",status:"deleted"},"admin@example.com"),/Geçerli kayıt/);
});

test("feedback API binds reports to the actor's successful chat and prevents duplicates",()=>{
  assert.match(route,/requireRole\(req,\["Admin","Editor","Viewer"\]\)/);
  assert.match(route,/actor=\? AND action='chat' AND status='success'/);
  assert.match(route,/NOT EXISTS\(SELECT 1 FROM ai_feedback WHERE activity_id=\? AND created_by=\?\)/);
  assert.match(route,/transitions\[current\.status\]/);
  assert.match(route,/recordAiEvent/);
  assert.doesNotMatch(route,/answer_text|prompt_text|response_text/);
});

test("feedback persistence is indexed, unique and available during on-prem self-heal",()=>{
  for(const source of [storage,schema,migration])assert.match(source,/ai_feedback/);
  assert.match(storage,/UNIQUE\(activity_id,created_by\)/);
  assert.match(schema,/uniqueIndex\("ai_feedback_activity_creator_idx"\)/);
  assert.match(migration,/ai_feedback_status_severity_created_idx/);
});

test("chat, quality metrics and UI expose governed feedback operations",()=>{
  assert.match(chat,/activityId=await recordAiEvent/);assert.match(chat,/answer:integrity\.answer, activityId/);
  assert.match(metrics,/severity IN \('high','critical'\)/);assert.match(metrics,/AI geri bildirim triage/);
  assert.match(copilot,/Güvenlik Olayı/);assert.match(copilot,/FornostAiFeedback/);
  assert.match(feedbackUi,/Kanıt CSV/);assert.match(feedbackUi,/Çözüm notu/);assert.match(feedbackUi,/Yeniden Aç/);assert.match(feedbackUi,/\^\[=\+\\-@\]/);
});
