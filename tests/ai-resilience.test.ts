import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  evaluateExercise,
  resilienceAttention,
  validateExercise,
  validateResiliencePlan,
} from "../app/ai/resilience";
const plan = {
  modelId: "AIM-1",
  scenario: "provider-outage",
  owner: "Business owner",
  technicalOwner: "SRE owner",
  rtoMinutes: 60,
  rpoMinutes: 15,
  maxDegradedMinutes: 240,
  fallbackPlan: "Use the approved secondary provider",
  manualPlan: "Continue critical workflows manually",
  shutdownProcedure: "Activate the audited emergency stop",
  communicationPlan: "Notify owners and affected users",
  dependencies: "Identity, network, provider",
  nextExercise: "2027-06-01",
};
test("resilience plans enforce bounded recovery objectives and complete playbooks", () => {
  assert.equal(validateResiliencePlan(plan).rtoMinutes, 60);
  assert.throws(
    () => validateResiliencePlan({ ...plan, rpoMinutes: 2000 }),
    /0–1440/,
  );
  assert.throws(
    () => validateResiliencePlan({ ...plan, scenario: "unknown" }),
    /zorunludur/,
  );
});
test("critical kill-switch or fallback failure fails an otherwise strong exercise", () => {
  const good = evaluateExercise({
    rtoMinutes: 60,
    rpoMinutes: 15,
    actualRecoveryMinutes: 50,
    actualDataLossMinutes: 10,
    killSwitchPassed: true,
    fallbackPassed: true,
    manualModePassed: true,
    communicationPassed: true,
  });
  assert.equal(good.status, "passed");
  const bad = evaluateExercise({
    rtoMinutes: 60,
    rpoMinutes: 15,
    actualRecoveryMinutes: 50,
    actualDataLossMinutes: 10,
    killSwitchPassed: false,
    fallbackPassed: true,
    manualModePassed: true,
    communicationPassed: true,
  });
  assert.equal(bad.status, "failed");
  assert.deepEqual(bad.criticalFailures, ["kill-switch"]);
});
test("exercise dates, findings and retest order are validated", () => {
  const value = validateExercise(
    {
      actualRecoveryMinutes: 50,
      actualDataLossMinutes: 5,
      killSwitchPassed: true,
      fallbackPassed: true,
      manualModePassed: true,
      communicationPassed: true,
      findings: "All paths verified",
      correctiveActions: "Rotate the contact roster",
      exercisedAt: "2027-01-01",
      nextRetest: "2027-04-01",
    },
    { rtoMinutes: 60, rpoMinutes: 15 },
  );
  assert.equal(value.status, "passed");
  assert.throws(
    () =>
      validateExercise(
        { ...value, nextRetest: "2026-12-01" },
        { rtoMinutes: 60, rpoMinutes: 15 },
      ),
    /zorunludur/,
  );
  assert.equal(
    resilienceAttention("approved", "2027-01-01", "2027-02-01"),
    "overdue",
  );
});
test("resilience API, audit, schema, UI and release gate are integrated", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/resilience/route.ts", "utf8"),
      readFile("drizzle/0053_fornost_ai_resilience.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-resilience.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı planı onaylayamaz/);
  assert.match(route, /Yalnız onaylı plan/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /ai_resilience_exercises/);
  assert.match(storage, /aiResiliencePlansSql/);
  assert.match(ui, /AI Dayanıklılık ve Tatbikat Merkezi/);
  assert.match(copilot, /AI Dayanıklılık/);
  assert.match(layout, /fornost-ai-resilience\.css/);
  assert.match(gate, /180 day/);
});
