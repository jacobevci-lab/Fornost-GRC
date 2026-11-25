import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  regulatoryAttention,
  regulatoryObligations,
  validateRegulatoryProfile,
} from "../app/ai/regulatory";
const base = {
  modelId: "AIM-1",
  classification: "high-risk",
  jurisdictions: "TR, EU",
  providerRole: false,
  deployerRole: true,
  importerRole: false,
  distributorRole: false,
  personalData: true,
  automatedDecision: true,
  publicInteraction: true,
  highImpact: true,
  owner: "risk@example.com",
  legalReviewer: "dpo@example.com",
  classificationRationale:
    "Employment-related decision support with material impact",
  transparencyNotice: "Users are informed that AI assists the decision",
  humanOversight: "Authorized reviewer can override and stop the system",
  completedKeys: [
    "inventory",
    "risk-management",
    "data-governance",
    "technical-documentation",
    "logging",
    "human-oversight",
    "transparency",
    "fundamental-rights",
    "privacy",
    "incident-reporting",
  ],
  reviewDate: "2027-06-01",
};
test("regulatory engine derives role and risk-specific obligations", () => {
  const keys = regulatoryObligations(base).map((x) => x.key);
  assert.ok(keys.includes("fundamental-rights"));
  assert.ok(keys.includes("privacy"));
  assert.ok(keys.includes("human-oversight"));
  assert.ok(!keys.includes("copyright"));
});
test("regulatory profiles fail closed for prohibited and ungoverned decisions", () => {
  const v = validateRegulatoryProfile(base);
  assert.deepEqual(v.gaps, []);
  assert.throws(
    () => validateRegulatoryProfile({ ...base, classification: "prohibited" }),
    /Yasaklı/,
  );
  assert.throws(
    () => validateRegulatoryProfile({ ...base, humanOversight: "" }),
    /insan gözetimi/,
  );
  assert.equal(
    regulatoryAttention("approved", "2027-01-01", "2027-02-01"),
    "overdue",
  );
});
test("regulatory API is maker-checker, gap-gated, audited and export-safe", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/regulatory/route.ts", "utf8"),
      readFile("drizzle/0055_fornost_ai_regulatory_profiles.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-regulatory.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı sınıflandırmayı onaylayamaz/);
  assert.match(route, /Açık yükümlülükler kapatılmadan/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /model_id TEXT NOT NULL UNIQUE/);
  assert.match(storage, /aiRegulatoryProfilesSql/);
  assert.match(ui, /AI Regülasyon ve Yükümlülük Merkezi/);
  assert.match(copilot, /AI Regülasyon/);
  assert.match(layout, /fornost-ai-regulatory\.css/);
  assert.match(gate, /gaps_json='\[\]'/);
});
