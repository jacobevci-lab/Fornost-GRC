import assert from "node:assert/strict";
import test from "node:test";
import { validateFindingGovernanceGate } from "../app/findings/domain";

const baseFinding = {
  source_type: "audit",
  source_ref: "AUD-2026-001",
  finding_type: "nonconformity",
  owner: "owner@example.com",
  reviewer: "reviewer@example.com",
  root_cause: "Access review evidence was not consistently collected.",
  corrective_action: "Collect the missing evidence and complete the overdue review.",
  preventive_action: "Automate recurring evidence collection and escalation before due date.",
  due_date: "2026-10-15",
  risk_ref: "RSK-2026-001",
  control_ref: "CTL-AC-01",
  evidence_reference: "EVD-CAPA-001",
  evidence_sha256: "a".repeat(64),
};

test("CAPA submit gate accepts a complete connected finding", () => {
  const result = validateFindingGovernanceGate(baseFinding, "submit");
  assert.equal(result.riskRef, "RSK-2026-001");
  assert.equal(result.controlRef, "CTL-AC-01");
});

test("control deficiencies cannot progress without a control link", () => {
  assert.throws(
    () => validateFindingGovernanceGate({
      ...baseFinding,
      source_type: "control",
      finding_type: "control-deficiency",
      control_ref: "",
      risk_ref: "RSK-2026-001",
    }, "submit"),
    /Control bağlantısı zorunludur/,
  );
});

test("connected enterprise findings need risk or control lineage before closure workflow", () => {
  assert.throws(
    () => validateFindingGovernanceGate({ ...baseFinding, risk_ref: "", control_ref: "" }, "submit"),
    /en az bir Risk veya Control bağlantısı/,
  );
});

test("risk acceptance cannot bypass the risk register", () => {
  assert.throws(
    () => validateFindingGovernanceGate({ ...baseFinding, risk_ref: "" }, "accept-risk"),
    /Risk Assessment bağlantısı zorunludur/,
  );
});

test("verification requires the CAPA submission evidence chain", () => {
  assert.throws(
    () => validateFindingGovernanceGate({ ...baseFinding, evidence_reference: "", evidence_sha256: "" }, "verify"),
    /CAPA gönderim kanıtı zorunludur/,
  );
  assert.throws(
    () => validateFindingGovernanceGate({ ...baseFinding, evidence_sha256: "not-a-digest" }, "verify"),
    /SHA-256/,
  );
});

test("maker-checker ownership remains independent at the governance gate", () => {
  assert.throws(
    () => validateFindingGovernanceGate({ ...baseFinding, reviewer: baseFinding.owner }, "submit"),
    /aksiyon sahibi ve bağımsız reviewer farklı/,
  );
});
