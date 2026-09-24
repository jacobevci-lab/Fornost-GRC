import assert from "node:assert/strict";
import test from "node:test";
import { buildContinuousAssuranceDashboard } from "../app/continuous-assurance-dashboard";

const now = new Date("2026-09-24T12:00:00.000Z");

test("dashboard summarizes control health, work queue and remediation debt", () => {
  const result = buildContinuousAssuranceDashboard({
    now,
    rules: [
      { id: "r1", name: "PAM review", controlRefs: "A.5.15", enabled: true, lastStatus: "pass", lastEvidenceAt: "2026-09-24T10:00:00.000Z", freshnessHours: 24, consecutiveFailures: 0, nextRunAt: "2026-09-25T10:00:00.000Z" },
      { id: "r2", name: "MFA coverage", controlRefs: "CC6.1, A.5.17", enabled: true, lastStatus: "fail", lastEvidenceAt: "2026-09-24T09:00:00.000Z", freshnessHours: 24, consecutiveFailures: 2, nextRunAt: "2026-09-24T11:00:00.000Z" },
      { id: "r3", name: "Backup evidence", controlRefs: "A.8.13", enabled: true, lastStatus: "pass", lastEvidenceAt: "2026-09-20T09:00:00.000Z", freshnessHours: 24, consecutiveFailures: 0, nextRunAt: "2026-09-24T15:00:00.000Z" },
    ],
    findings: [
      { id: "f1", ruleId: "r2", title: "MFA below target", severity: "high", owner: "iam@example.com", dueDate: "2026-09-23", status: "acknowledged" },
      { id: "f2", ruleId: "r3", title: "Old backup evidence", severity: "medium", owner: "infra@example.com", dueDate: "2026-09-30", status: "closed" },
    ],
    workItems: [
      { id: "w1", findingId: "f1", ruleId: "r2", action: "capa-promotion", status: "pending-review", targetControlRef: "CC6.1", actor: "maker@example.com", updatedAt: "2026-09-24T11:30:00.000Z" },
      { id: "w2", findingId: "f1", ruleId: "r2", action: "control-retest", status: "failed-retest", targetControlRef: "CC6.1", actor: "maker@example.com", reviewedBy: "admin@example.com", updatedAt: "2026-09-24T11:45:00.000Z" },
    ],
  });

  assert.equal(result.summary.totalControls, 3);
  assert.equal(result.summary.healthy, 1);
  assert.equal(result.summary.failing, 1);
  assert.equal(result.summary.integrityFailures, 0);
  assert.equal(result.summary.stale, 1);
  assert.equal(result.summary.due, 1);
  assert.equal(result.summary.openFindings, 1);
  assert.equal(result.summary.overdueRemediation, 1);
  assert.equal(result.summary.pendingReview, 1);
  assert.equal(result.summary.failedRetest, 1);
  assert.equal(result.summary.assuranceCoverage, 83);
  assert.equal(result.priorities[0]?.id, "work:w2");
  assert.equal(result.priorities[0]?.targetControlRef, "CC6.1");
});

test("broken Evidence Library chains override fresh passing control health", () => {
  const result = buildContinuousAssuranceDashboard({
    now,
    rules: [
      {
        id: "r1",
        name: "Privileged access review",
        controlRefs: "A.5.15",
        enabled: true,
        lastStatus: "pass",
        lastEvidenceAt: "2026-09-24T10:00:00.000Z",
        freshnessHours: 24,
        consecutiveFailures: 0,
        nextRunAt: "2026-09-25T10:00:00.000Z",
        evidenceIntegrity: "broken",
        linkedEvidenceCount: 2,
      },
    ],
    findings: [],
    workItems: [],
  });

  assert.equal(result.summary.healthy, 0);
  assert.equal(result.summary.failing, 1);
  assert.equal(result.summary.integrityFailures, 1);
  assert.equal(result.summary.assuranceCoverage, 50);
  assert.equal(result.priorities[0]?.state, "integrity-failed");
  assert.equal(result.priorities[0]?.priority, 90);
  assert.equal(result.priorities[0]?.reason, "evidence-integrity-failed");
  assert.equal(result.priorities[0]?.evidenceIntegrity, "broken");
  assert.equal(result.priorities[0]?.linkedEvidenceCount, 2);
});

test("dashboard keeps multi-control target context from governed work item", () => {
  const result = buildContinuousAssuranceDashboard({
    now,
    rules: [
      { id: "r1", name: "Identity assurance", controlRefs: "A.5.16; A.5.17", enabled: true, lastStatus: "pass", lastEvidenceAt: "2026-09-24T10:00:00.000Z", freshnessHours: 24, consecutiveFailures: 0, nextRunAt: "2026-09-25T10:00:00.000Z" },
    ],
    findings: [
      { id: "f1", ruleId: "r1", title: "Identity exception", severity: "medium", owner: "iam@example.com", dueDate: "2026-10-01", status: "acknowledged" },
    ],
    workItems: [
      { id: "w1", findingId: "f1", ruleId: "r1", action: "capa-promotion", status: "pending-review", targetControlRef: "A.5.17", updatedAt: "2026-09-24T11:00:00.000Z" },
    ],
  });

  const work = result.priorities.find((item) => item.id === "work:w1");
  assert.ok(work);
  assert.equal(work.targetControlRef, "A.5.17");
});

test("empty dashboard is healthy by definition and does not divide by zero", () => {
  const result = buildContinuousAssuranceDashboard({ rules: [], findings: [], workItems: [], now });
  assert.equal(result.summary.totalControls, 0);
  assert.equal(result.summary.assuranceCoverage, 100);
  assert.deepEqual(result.priorities, []);
});
