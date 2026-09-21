import assert from "node:assert/strict";
import test from "node:test";

const count = (payload: Record<string, unknown>, key: string) => Array.isArray(payload[key]) ? (payload[key] as unknown[]).length : 0;

function projectableRecordCount(sourceKey: string, payload: Record<string, unknown>) {
  switch (sourceKey) {
    case "findings": return count(payload, "findings");
    case "incidents": return count(payload, "incidents");
    case "continuity": return count(payload, "plans") + count(payload, "exercises") + count(payload, "gaps");
    case "policy": return (count(payload, "documents") || count(payload, "policies")) + count(payload, "versions");
    case "riskAppetite": return count(payload, "appetites") + count(payload, "measurements") + count(payload, "breaches") + count(payload, "scenarios");
    case "regulatory": return count(payload, "sources") + count(payload, "changes") + count(payload, "impacts");
    case "thirdParty": return count(payload, "vendors") + count(payload, "assessments") + count(payload, "findings");
    case "evidenceAutomation": return count(payload, "sources") + count(payload, "rules") + count(payload, "findings");
    default: return 0;
  }
}

test("Connected GRC QA ignores auxiliary API arrays that adapters do not project", () => {
  assert.equal(projectableRecordCount("findings", { findings: [], events: [1, 2], sourceSignals: [1, 2, 3, 4] }), 0);
  assert.equal(projectableRecordCount("riskAppetite", { appetites: [], measurements: [], breaches: [], scenarios: [], linkedRisks: [1], snapshots: [1] }), 0);
  assert.equal(projectableRecordCount("regulatory", { sources: [], changes: [], impacts: [], records: Array.from({ length: 26 }) }), 0);
  assert.equal(projectableRecordCount("evidenceAutomation", { sources: [], rules: [], findings: [], runs: [1, 2, 3] }), 0);
});

test("Connected GRC QA counts exactly the enterprise adapter collections", () => {
  assert.equal(projectableRecordCount("findings", { findings: [1, 2] }), 2);
  assert.equal(projectableRecordCount("continuity", { plans: [1], exercises: [1, 2], gaps: [1] }), 4);
  assert.equal(projectableRecordCount("policy", { documents: [1], policies: [1, 2, 3], versions: [1, 2] }), 3);
  assert.equal(projectableRecordCount("riskAppetite", { appetites: [1], measurements: [1], breaches: [1], scenarios: [1] }), 4);
  assert.equal(projectableRecordCount("regulatory", { sources: [1], changes: [1, 2], impacts: [1] }), 4);
  assert.equal(projectableRecordCount("thirdParty", { vendors: [1], assessments: [1], findings: [1, 2] }), 4);
  assert.equal(projectableRecordCount("evidenceAutomation", { sources: [1], rules: [1, 2], findings: [1], runs: [1, 2] }), 4);
});
