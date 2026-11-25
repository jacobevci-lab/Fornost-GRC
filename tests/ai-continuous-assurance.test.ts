import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessAssurance,
  validateAssurancePolicy,
} from "../app/ai/continuous-assurance";
const policy = {
  modelId: "AIM-1",
  owner: "Model Risk",
  minAccuracy: 90,
  maxErrorRate: 5,
  maxDriftScore: 15,
  maxBiasScore: 10,
  maxP95LatencyMs: 5000,
  minSampleSize: 100,
  frequencyDays: 30,
  evidencePlan:
    "Validated monthly production sample with retained aggregate evidence",
  breachAction:
    "Suspend capability and open an AI incident for independent review",
  reviewDate: "2027-12-01",
};
test("model assurance policy validates bounded SLO and KRI thresholds", () => {
  assert.equal(validateAssurancePolicy(policy).frequencyDays, 30);
  assert.throws(
    () => validateAssurancePolicy({ ...policy, minAccuracy: 40 }),
    /güvenli eşikler/,
  );
  assert.throws(
    () => validateAssurancePolicy({ ...policy, frequencyDays: 100 }),
    /güvenli eşikler/,
  );
});
test("continuous assurance detects every baseline breach and stale evidence", () => {
  const p = validateAssurancePolicy(policy),
    healthy = assessAssurance(
      p,
      {
        accuracy: 95,
        errorRate: 2,
        driftScore: 4,
        biasScore: 3,
        p95LatencyMs: 1200,
        sampleSize: 500,
        recordedAt: "2027-05-20T00:00:00Z",
      },
      "2027-06-01T00:00:00Z",
    );
  assert.equal(healthy.state, "healthy");
  const breached = assessAssurance(
    p,
    {
      accuracy: 80,
      errorRate: 10,
      driftScore: 25,
      biasScore: 20,
      p95LatencyMs: 9000,
      sampleSize: 10,
      recordedAt: "2027-01-01T00:00:00Z",
    },
    "2027-06-01T00:00:00Z",
  );
  assert.equal(breached.state, "breached");
  assert.equal(breached.breaches.length, 7);
});
test("continuous assurance is maker-checker, audited, export-safe and release-gated", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/continuous-assurance/route.ts", "utf8"),
      readFile("drizzle/0060_fornost_ai_continuous_assurance.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-continuous-assurance.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı güvence baseline'ını onaylayamaz/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /ai_assurance_policies/);
  assert.match(storage, /aiAssurancePoliciesSql/);
  assert.match(ui, /AI Sürekli Güvence Merkezi/);
  assert.match(copilot, /AI Güvence/);
  assert.match(layout, /fornost-ai-continuous-assurance\.css/);
  assert.match(gate, /ai_assurance_policies/);
  assert.match(gate, /m\.accuracy>=p\.min_accuracy/);
});
