import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exceptionState, validateAiException, validateAiExceptionDecision } from "../app/ai/exceptions";

const valid = { modelId:"AIM-1",type:"control",reference:"ISO42001-A.6.2",title:"Geçici izleme sapması",justification:"Planlı geçiş sürecinde yeni telemetry henüz tamamlanmadı.",scope:"Yalnız üretim öncesi gölge trafik kapsamındadır.",compensatingControls:"Günlük manuel log incelemesi ve haftalık CISO raporlaması uygulanacaktır.",owner:"security@example.com",riskTier:"Medium",reviewAt:"2027-02-01",expiresAt:"2027-03-01" };

test("AI exception requests require bounded compensating controls and expiry", () => {
  assert.equal(validateAiException(valid,"2027-01-01").type,"control");
  assert.throws(()=>validateAiException({...valid,compensatingControls:"none"},"2027-01-01"),/eksiksiz/);
  assert.throws(()=>validateAiException({...valid,expiresAt:"2028-01-01"},"2027-01-01"),/180 günü/);
  assert.throws(()=>validateAiException({...valid,reviewAt:"2027-04-01"},"2027-01-01"),/inceleme tarihi/);
});

test("AI exception decisions require exact human confirmation", () => {
  assert.equal(validateAiExceptionDecision({status:"approved",note:"Compensating controls independently reviewed",confirmation:"İSTİSNAYI ONAYLA"}).status,"approved");
  assert.throws(()=>validateAiExceptionDecision({status:"approved",note:"Compensating controls independently reviewed",confirmation:"ONAYLA"}),/İSTİSNAYI ONAYLA/);
  assert.equal(exceptionState("approved","2027-01-01","2026-12-01","2027-01-02"),"expired");
  assert.equal(exceptionState("approved","2027-03-01","2027-01-01","2027-01-02"),"review-overdue");
});

test("AI exception lifecycle is maker-checker, audited, export-safe and release-gated", async () => {
  const [route,migration,storage,ui,copilot,layout,gate,dossier,portfolio,navigation]=await Promise.all([
    readFile("app/api/ai/exceptions/route.ts","utf8"),readFile("drizzle/0061_fornost_ai_exceptions.sql","utf8"),readFile("app/ai/storage.ts","utf8"),readFile("app/fornost-ai-exceptions.tsx","utf8"),readFile("app/fornost-ai-copilot.tsx","utf8"),readFile("app/layout.tsx","utf8"),readFile("app/api/ai/release-gate/route.ts","utf8"),readFile("app/api/ai/dossier/route.ts","utf8"),readFile("app/api/ai/portfolio/route.ts","utf8"),readFile("app/fornost-ai-navigation.css","utf8")
  ]);
  assert.match(route,/requireRole\(req, \["Admin"\]\)/);
  assert.match(route,/oluşturan kişi aynı kaydı onaylayamaz/);
  assert.match(route,/Kritik AI riski istisna ile kabul edilemez/);
  assert.match(route,/ai-exception-\$\{decision.status\}/);
  assert.match(route,/\^\[=\+\\-@\]/);
  assert.match(migration,/ai_exceptions_review_idx/);
  assert.match(storage,/aiExceptionsSql/);
  assert.match(ui,/AI İstisna ve Waiver Merkezi/);
  assert.match(copilot,/AI İstisnalar/);
  assert.match(layout,/fornost-ai-exceptions\.css/);
  assert.match(gate,/ai_exceptions/);
  assert.match(dossier,/ai_exceptions/);
  assert.match(portfolio,/unresolvedExceptions/);
  assert.match(navigation,/fornost-ai-tab-group/);
});
