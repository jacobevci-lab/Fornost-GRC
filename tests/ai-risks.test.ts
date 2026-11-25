import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aiRiskAttention,
  calculateAiRisk,
  validateAiRisk,
  validateRiskDecision,
} from "../app/ai/risks";

test("AI residual risk scoring is deterministic and control-aware", () => {
  assert.deepEqual(calculateAiRisk(5, 5, 1), {
    inherent: 25,
    residual: 21,
    tier: "Critical",
  });
  assert.deepEqual(calculateAiRisk(3, 4, 3), {
    inherent: 12,
    residual: 6,
    tier: "Medium",
  });
  assert.deepEqual(calculateAiRisk(1, 1, 5), {
    inherent: 1,
    residual: 1,
    tier: "Low",
  });
});

test("AI risk input is bounded and requires a complete treatment plan", () => {
  const input = {
    modelId: "AIM-1",
    category: "privacy",
    title: "Personal data exposure",
    description: "Model may expose personal data",
    cause: "Unsafe retrieval scope",
    consequence: "Regulatory notification",
    owner: "ciso@example.com",
    likelihood: 3,
    impact: 5,
    controlEffectiveness: 2,
    treatment: "mitigate",
    treatmentPlan: "Apply deterministic DLP before inference",
    treatmentOwner: "security@example.com",
    dueDate: "2027-03-01",
  };
  assert.equal(validateAiRisk(input).tier, "High");
  assert.throws(() => validateAiRisk({ ...input, likelihood: 6 }), /1–5/);
  assert.throws(
    () => validateAiRisk({ ...input, dueDate: "2027-02-30" }),
    /tarihi/,
  );
  assert.throws(
    () => validateAiRisk({ ...input, treatmentPlan: "short" }),
    /eksiksiz/,
  );
});

test("risk acceptance is explicitly confirmed, time-bound and capped", () => {
  const base = {
    status: "accepted",
    note: "CISO approved temporary exception",
    confirmation: "RİSKİ KABUL ET",
    acceptanceExpiry: "2027-06-01",
  };
  assert.equal(validateRiskDecision(base, "2027-01-01").status, "accepted");
  assert.throws(
    () =>
      validateRiskDecision({ ...base, confirmation: "ONAYLA" }, "2027-01-01"),
    /RİSKİ KABUL ET/,
  );
  assert.throws(
    () =>
      validateRiskDecision(
        { ...base, acceptanceExpiry: "2029-01-01" },
        "2027-01-01",
      ),
    /365/,
  );
});

test("risk attention detects overdue actions and expired acceptances", () => {
  assert.equal(
    aiRiskAttention("open", "2027-01-01", null, "2027-02-01"),
    "overdue",
  );
  assert.equal(
    aiRiskAttention("accepted", "2027-01-01", "2027-01-31", "2027-02-01"),
    "acceptance-expired",
  );
  assert.equal(
    aiRiskAttention("closed", "2027-01-01", null, "2027-02-01"),
    "current",
  );
});

test("AI risk center enforces model links, maker-checker approval and safe evidence export", async () => {
  const [route, migration, storage, ui, copilot, layout] = await Promise.all([
    readFile("app/api/ai/risks/route.ts", "utf8"),
    readFile("drizzle/0048_fornost_ai_risks.sql", "utf8"),
    readFile("app/ai/storage.ts", "utf8"),
    readFile("app/fornost-ai-risks.tsx", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(route, /Olay bu AI modeline ait değil/);
  assert.match(route, /oluşturan kişi aynı riski kabul edemez/);
  assert.match(route, /Yüksek veya kritik artık risk kapatılamaz/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(migration, /ai_risks_model_status_idx/);
  assert.match(storage, /aiRisksSql/);
  assert.match(ui, /AI Risk ve İstisna Merkezi/);
  assert.match(ui, /role !== "Viewer"/);
  assert.match(copilot, /AI Riskler/);
  assert.match(layout, /fornost-ai-risks\.css/);
});
