import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  transparencyAttention,
  validateOversightEvent,
  validateTransparencyProfile,
} from "../app/ai/transparency";

const profile = {
  modelId: "AIM-1",
  intendedUse: "Assist analysts with evidence-grounded GRC recommendations",
  prohibitedUses:
    "No autonomous employment, credit, health or disciplinary decisions",
  capabilities:
    "Retrieve approved GRC records and generate reviewable recommendations",
  limitations:
    "May miss context, become outdated or produce incomplete recommendations",
  explanationMethod:
    "Show grounded source references, confidence and control rationale",
  humanOversight:
    "A human reviewer approves every material action and can override the model",
  noticeText:
    "This output was generated with AI and requires human review before use",
  appealChannel: "ai-appeals@example.com",
  owner: "AI Governance",
  affectedGroups: "Employees, control owners and assurance reviewers",
  languages: ["tr", "en"],
  reviewDate: "2027-08-01",
};

test("AI system cards require complete transparency and contestability", () => {
  assert.deepEqual(validateTransparencyProfile(profile).gaps, []);
  const gaps = validateTransparencyProfile({
    ...profile,
    humanOversight: "Automated routing is configured",
    noticeText: "Result ready for use",
    appealChannel: "help desk",
  }).gaps;
  assert.equal(gaps.length, 3);
  assert.throws(
    () => validateTransparencyProfile({ ...profile, limitations: "none" }),
    /zorunludur/,
  );
});

test("human oversight events are bounded and review lifecycle is deterministic", () => {
  const event = validateOversightEvent({
    modelId: "AIM-1",
    decisionReference: "CASE-2027-41",
    action: "overridden",
    severity: "high",
    reason: "The recommendation lacked current contractual context",
    outcome:
      "Human reviewer rejected the recommendation and selected the verified control",
    controlOwner: "GRC Lead",
  });
  assert.equal(event.action, "overridden");
  assert.throws(
    () => validateOversightEvent({ ...event, severity: "urgent" }),
    /zorunludur/,
  );
  assert.equal(
    transparencyAttention("approved", "2027-01-01", "2027-02-01"),
    "overdue",
  );
});

test("transparency API is maker-checker, audited, export-safe and release-gated", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/transparency/route.ts", "utf8"),
      readFile("drizzle/0059_fornost_ai_transparency.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-transparency.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı sistem kartını onaylayamaz/);
  assert.match(route, /Yüksek\/kritik gözetim kaydını açan kişi kapatamaz/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /ai_oversight_events/);
  assert.match(storage, /aiTransparencyProfilesSql/);
  assert.match(ui, /AI Şeffaflık ve İnsan Gözetimi/);
  assert.match(copilot, /AI Şeffaflık/);
  assert.match(layout, /fornost-ai-transparency\.css/);
  assert.match(gate, /ai_transparency_profiles/);
  assert.match(gate, /ai_oversight_events/);
});
