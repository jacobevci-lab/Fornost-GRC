import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { redTeamAttention, validateCampaign } from "../app/ai/red-team";

const base = {
  modelId: "AIM-1",
  name: "Quarterly adversarial exercise",
  scope: "Public chat, retrieval, tools and output handling",
  methodology: "OWASP LLM Top 10 plus model-specific abuse cases",
  lead: "Security Red Team",
  independentTester: "Independent Assurance",
  environment: "isolated-test",
  categories: [
    "prompt-injection",
    "insecure-output",
    "data-poisoning",
    "model-dos",
    "sensitive-disclosure",
  ],
  plannedAt: "2027-01-01",
  completedAt: "2027-01-10",
  totalTests: 100,
  passedTests: 96,
  criticalFindings: 0,
  highFindings: 0,
  mediumFindings: 2,
  reportReference: "GRC-EVIDENCE-2027-001",
  remediationPlan: "Medium findings assigned with tracked corrective actions",
  retestAt: "2027-07-01",
};

test("red-team campaign derives pass rate and approval blockers", () => {
  assert.deepEqual(validateCampaign(base).blockers, []);
  const blocked = validateCampaign({
    ...base,
    passedTests: 80,
    criticalFindings: 1,
    highFindings: 2,
    categories: ["jailbreak"],
  });
  assert.equal(blocked.passRate, 80);
  assert.equal(blocked.blockers.length, 4);
});

test("red-team validation rejects inconsistent counts and lifecycle dates", () => {
  assert.throws(
    () => validateCampaign({ ...base, passedTests: 101 }),
    /aşamaz/,
  );
  assert.throws(
    () => validateCampaign({ ...base, retestAt: "2027-01-09" }),
    /zorunludur/,
  );
  assert.equal(
    redTeamAttention("approved", "2027-01-01", "2027-02-01"),
    "retest-overdue",
  );
});

test("red-team API is maker-checker, blocker-gated, audited, exported and release-gated", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/red-team/route.ts", "utf8"),
      readFile("drizzle/0058_fornost_ai_red_team.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-red-team.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı red-team kampanyasını onaylayamaz/);
  assert.match(route, /Red-team engelleri/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /UNIQUE\(model_id,name,completed_at\)/);
  assert.match(storage, /aiRedTeamCampaignsSql/);
  assert.match(ui, /AI Red-Team Kontrol Merkezi/);
  assert.match(copilot, /AI Red Team/);
  assert.match(layout, /fornost-ai-red-team\.css/);
  assert.match(gate, /ai_red_team_campaigns/);
});
