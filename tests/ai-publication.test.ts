import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { applyAiDraftToRecord, publicationModule } from "../app/ai/publication";

const publishRoute = fs.readFileSync("app/api/ai/drafts/publish/route.ts", "utf8");
const targetsRoute = fs.readFileSync("app/api/ai/drafts/targets/route.ts", "utf8");
const storage = fs.readFileSync("app/ai/storage.ts", "utf8");

test("AI publication maps only supported draft kinds to fixed GRC modules", () => {
  assert.equal(publicationModule("risk-treatment"), "Risk Assessment");
  assert.equal(publicationModule("audit-finding"), "Denetim Yönetimi");
  assert.equal(publicationModule("remediation-task"), null);
  assert.match(targetsRoute, /WHERE module=\?/);
});

test("risk treatment publication preserves the target and adds controlled action fields", () => {
  const result = applyAiDraftToRecord("risk-treatment", { proposedTreatment:"MFA zorunlu kılınacak",owner:"IAM",dueDate:"2026-12-01",priority:"Yüksek" }, { title:"Yetkili hesap riski",optional:"" }, "AID-1", "Kurul kararı");
  assert.equal(result.title, "Yetkili hesap riski");
  assert.equal(result.optional, "");
  assert.equal(result.plannedAction, "MFA zorunlu kılınacak");
  assert.equal(result.aiDraftRef, "AID-1");
});

test("audit finding publication maps structured fields without changing audit identity", () => {
  const result = applyAiDraftToRecord("audit-finding", { condition:"Kanıt eksik",criteria:"A.5.1",impact:"Güvence zayıf",recommendation:"Kanıt yükle",severity:"Orta" }, { auditName:"ISO 27001",requirementRef:"A.5.1" }, "AID-2", "Denetçi doğruladı");
  assert.equal(result.auditName, "ISO 27001");
  assert.equal(result.finding, "Kanıt eksik");
  assert.equal(result.recommendation, "Kanıt yükle");
});

test("publication endpoint requires Admin, approval, explicit confirmation and replay protection", () => {
  assert.match(publishRoute, /requireRole\(req, \["Admin"\]\)/);
  assert.match(publishRoute, /confirmation !== "YAYINLA"/);
  assert.match(publishRoute, /draft\.status !== "approved"/);
  assert.match(publishRoute, /ai_draft_publications WHERE draft_id=\?/);
  assert.match(publishRoute, /updated_at=\?/);
  assert.match(publishRoute, /NOT EXISTS\(SELECT 1 FROM ai_draft_publications/);
});

test("publication schema self-heals during on-prem upgrades", () => {
  assert.match(storage, /CREATE TABLE IF NOT EXISTS ai_draft_publications/);
  assert.match(storage, /draft_id TEXT NOT NULL UNIQUE/);
});
