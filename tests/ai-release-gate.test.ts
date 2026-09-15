import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  evaluateReleaseGate,
  validateReleaseDecision,
  validateReleaseRequest,
} from "../app/ai/release-gate";
const ready = {
  modelApproved: true,
  controlsTotal: 12,
  controlsOpen: 0,
  highRisks: 0,
  expiredAcceptances: 0,
  criticalIncidents: 0,
  vendorCurrent: true,
  evidenceCurrent: 3,
  accessFindings: 0,
  impactCurrent: true,
  resilienceCurrent: true,
  datasetCurrent: true,
  regulatoryCurrent: true,
  literacyCurrent: true,
  artifactCurrent: true,
  redTeamCurrent: true,
  transparencyCurrent: true,
  oversightClear: true,
  changeApproved: true,
};
test("AI release gate requires all seventeen independent assurance domains", () => {
  const result = evaluateReleaseGate(ready);
  assert.equal(result.ready, true);
  assert.equal(result.score, 100);
  assert.equal(result.checks.length, 17);
  const blocked = evaluateReleaseGate({
    ...ready,
    evidenceCurrent: 0,
    highRisks: 1,
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.score, 88);
  assert.deepEqual(blocked.blockers, ["AI riskleri", "Kanıt bütünlüğü"]);
});
test("release request requires approved change identity and rollback ownership", () => {
  const input = {
    modelId: "AIM-1",
    changeId: "AIC-1",
    version: "2.1.0",
    environment: "production",
    releaseOwner: "product@example.com",
    rollbackOwner: "sre@example.com",
    rollbackPlan: "Restore previous signed model package",
    plannedAt: "2027-05-01",
  };
  assert.equal(validateReleaseRequest(input).environment, "production");
  assert.throws(
    () => validateReleaseRequest({ ...input, environment: "dev" }),
    /zorunludur/,
  );
  assert.throws(
    () => validateReleaseRequest({ ...input, plannedAt: "2027-02-30" }),
    /zorunludur/,
  );
});
test("production approval is explicitly confirmed and limited to 90 days", () => {
  const input = {
    status: "approved",
    note: "All assurance gates reviewed",
    validUntil: "2027-03-01",
    confirmation: "YAYINA ALMAYI ONAYLA",
  };
  assert.equal(validateReleaseDecision(input, "2027-01-01").status, "approved");
  assert.throws(
    () =>
      validateReleaseDecision(
        { ...input, confirmation: "ONAYLA" },
        "2027-01-01",
      ),
    /YAYINA ALMAYI ONAYLA/,
  );
  assert.throws(
    () =>
      validateReleaseDecision(
        { ...input, validUntil: "2027-12-01" },
        "2027-01-01",
      ),
    /90 günü/,
  );
});
test("release API re-evaluates live controls and enforces maker-checker", async () => {
  const [route, migration, storage, ui, copilot, layout] = await Promise.all([
    readFile("app/api/ai/release-gate/route.ts", "utf8"),
    readFile("drizzle/0051_fornost_ai_release_gate.sql", "utf8"),
    readFile("app/ai/storage.ts", "utf8"),
    readFile("app/fornost-ai-release-gate.tsx", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(route, /sekiz|currentGate/);
  assert.match(route, /oluşturan kişi aynı yayını onaylayamaz/);
  assert.match(route, /Kontroller talep sonrasında değişti/);
  assert.match(route, /status='approved' AND integrity_status='verified'/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(migration, /snapshot_json/);
  assert.match(storage, /aiReleaseGatesSql/);
  assert.match(ui, /AI Yayına Alma Güvenlik Kapısı/);
  assert.match(copilot, /AI Yayın Kapısı/);
  assert.match(layout, /fornost-ai-release-gate\.css/);
});
