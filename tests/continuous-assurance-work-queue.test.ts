import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/continuous-assurance/route.ts", "utf8");

test("continuous assurance API exposes an auditable work queue", () => {
  assert.match(route, /continuous_assurance_work_items/);
  assert.match(route, /pending-review/);
  assert.match(route, /queue-retest/);
  assert.match(route, /queue-capa-promotion/);
  assert.match(route, /requireRole\(req,\["Admin","Editor"\]\)/);
});

test("recovery evaluation uses stored remediation closure and post-closure re-test evidence", () => {
  assert.match(route, /evaluateAssuranceRecovery/);
  assert.match(route, /closure_evidence_ref/);
  assert.match(route, /closure_evidence_sha256/);
  assert.match(route, /created_at>\?/);
  assert.match(route, /retestResultFor/);
  assert.match(route, /retestEvidenceFreshness/);
  assert.match(route, /riskLinked:Boolean\(context\.risk\)/);
});

test("CAPA promotion goes through governed candidate validation before queueing", () => {
  assert.match(route, /buildContinuousAssuranceCapaCandidate/);
  assert.match(route, /reviewer:clean\(body\.reviewer/);
  assert.match(route, /rootCause:clean\(body\.rootCause/);
  assert.match(route, /correctiveAction:clean\(body\.correctiveAction/);
  assert.match(route, /preventiveAction:clean\(body\.preventiveAction/);
  assert.match(route, /originEvidenceSha256:String\(evidenceData\.responseHash/);
  assert.match(route, /if\(!candidate\.eligible\)/);
});

test("work queue prevents duplicate pending re-test and CAPA jobs", () => {
  assert.match(route, /action='control-retest' AND status='pending-review'/);
  assert.match(route, /action='capa-promotion' AND status='pending-review'/);
});
