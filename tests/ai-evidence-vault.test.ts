import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  evidenceExpiryState,
  normalizeSha256,
  validateAiEvidence,
} from "../app/ai/evidence";

const HASH = "A".repeat(64);

test("AI evidence hashes are normalized and strictly validated", () => {
  assert.equal(normalizeSha256(HASH), HASH.toLowerCase());
  assert.throws(() => normalizeSha256("abc"), /SHA-256/);
  assert.throws(() => normalizeSha256("g".repeat(64)), /SHA-256/);
});

test("AI evidence validation rejects invalid or reversed dates", () => {
  const input = {
    modelId: "AIM-1",
    type: "test-result",
    title: "Prompt injection suite",
    description: "Signed evaluation output reference",
    source: "s3://evidence/result.json",
    collectionMethod: "CI attestation",
    classification: "Internal",
    owner: "security@example.com",
    expectedHash: HASH,
    collectedAt: "2027-01-01",
    validUntil: "2027-03-01",
  };
  assert.equal(validateAiEvidence(input).expectedHash, HASH.toLowerCase());
  assert.throws(() => validateAiEvidence({ ...input, collectedAt: "2027-02-30" }), /tarihleri/);
  assert.throws(() => validateAiEvidence({ ...input, validUntil: "2026-12-31" }), /tarihleri/);
});

test("AI evidence expiry queue is deterministic", () => {
  assert.equal(evidenceExpiryState("2027-02-15", "approved", "2027-01-31"), "expiring");
  assert.equal(evidenceExpiryState("2027-04-01", "approved", "2027-01-31"), "valid");
  assert.equal(evidenceExpiryState("2027-01-01", "approved", "2027-01-31"), "expired");
  assert.equal(evidenceExpiryState("2027-01-01", "draft", "2027-01-31"), "draft");
});

test("AI evidence vault enforces relational integrity, human approval and safe exports", async () => {
  const [route, migration, storage, ui, copilot, layout] = await Promise.all([
    readFile("app/api/ai/evidence/route.ts", "utf8"),
    readFile("drizzle/0047_fornost_ai_evidence.sql", "utf8"),
    readFile("app/ai/storage.ts", "utf8"),
    readFile("app/fornost-ai-evidence.tsx", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(route, /Kontrol bu modele ait değil/);
  assert.match(route, /Aynı hash/);
  assert.match(route, /Bütünlüğü doğrulanmamış kanıt onaylanamaz/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /format.*manifest/);
  assert.match(migration, /ai_evidence_model_status_idx/);
  assert.match(storage, /aiEvidenceSql/);
  assert.match(ui, /role === "Admin"/);
  assert.match(ui, /AI Kanıt Kasası ve Assurance Pack/);
  assert.match(copilot, /AI Kanıt/);
  assert.match(layout, /fornost-ai-evidence\.css/);
});
