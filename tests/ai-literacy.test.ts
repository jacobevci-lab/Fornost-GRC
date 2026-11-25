import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  literacyAttention,
  requiredTraining,
  validateLiteracy,
} from "../app/ai/literacy";
const base = {
  modelId: "AIM-1",
  principal: "reviewer@example.com",
  displayName: "Model Reviewer",
  role: "reviewer",
  manager: "manager@example.com",
  completedModules: [
    "ai-basics",
    "acceptable-use",
    "security-privacy",
    "human-oversight",
    "incident-reporting",
    "high-risk-controls",
  ],
  score: 90,
  attested: true,
  limitationsAcknowledged: true,
  incidentDutyAcknowledged: true,
  trainedAt: "2027-01-01",
  validUntil: "2028-01-01",
};
test("AI literacy requirements vary by operator role and model risk", () => {
  assert.ok(
    requiredTraining("reviewer", "Critical").includes("high-risk-controls"),
  );
  assert.ok(
    requiredTraining("developer", "Medium").includes("secure-ai-lifecycle"),
  );
  assert.ok(!requiredTraining("user", "Low").includes("human-oversight"));
});
test("literacy validation fails closed on low score or missing attestations", () => {
  assert.deepEqual(validateLiteracy(base, "Critical").missing, []);
  assert.ok(
    validateLiteracy({ ...base, score: 79 }, "Critical").missing.includes(
      "minimum-score",
    ),
  );
  assert.ok(
    validateLiteracy({ ...base, attested: false }, "Critical").missing.includes(
      "attestation",
    ),
  );
  assert.equal(
    literacyAttention("approved", "2027-01-01", "2027-02-01"),
    "expired",
  );
});
test("literacy API is maker-checker, gap-gated, audited and export-safe", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/literacy/route.ts", "utf8"),
      readFile("drizzle/0056_fornost_ai_literacy.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-literacy.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı yetkinliği onaylayamaz/);
  assert.match(route, /Eksik eğitim veya attestation/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /UNIQUE\(model_id,principal,operator_role\)/);
  assert.match(storage, /aiLiteracyRecordsSql/);
  assert.match(ui, /AI Yetkinlik ve Operatör Yetkilendirme/);
  assert.match(copilot, /AI Yetkinlik/);
  assert.match(layout, /fornost-ai-literacy\.css/);
  assert.match(gate, /operator_role IN/);
});
