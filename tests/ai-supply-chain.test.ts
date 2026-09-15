import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  artifactAttention,
  validateModelArtifact,
} from "../app/ai/supply-chain";
const base = {
  modelId: "AIM-1",
  version: "2.0",
  artifactType: "model",
  source: "https://models.example.invalid/signed/model",
  supplier: "Approved supplier",
  sha256: "a".repeat(64),
  signatureVerified: true,
  signatureIssuer: "Enterprise CA",
  license: "Commercial license",
  sbomReference: "urn:cyclonedx:model:2.0",
  scanner: "ModelScan and Trivy",
  scanDate: "2027-01-01",
  malwareClean: true,
  criticalVulnerabilities: 0,
  highVulnerabilities: 0,
  unsafeFormats: false,
  reproducible: true,
  provenance:
    "Signed build produced from reviewed source and locked dependencies",
  validUntil: "2027-07-01",
};
test("model artifact validation requires integrity, SBOM and bounded vulnerability results", () => {
  assert.deepEqual(validateModelArtifact(base).blockers, []);
  assert.throws(
    () => validateModelArtifact({ ...base, sha256: "abc" }),
    /SHA-256/,
  );
  assert.throws(
    () => validateModelArtifact({ ...base, criticalVulnerabilities: -1 }),
    /0–10000/,
  );
});
test("untrusted supply-chain properties deterministically block approval", () => {
  const v = validateModelArtifact({
    ...base,
    signatureVerified: false,
    malwareClean: false,
    criticalVulnerabilities: 1,
    reproducible: false,
  });
  assert.ok(v.blockers.includes("İmza doğrulanmadı"));
  assert.ok(v.blockers.includes("Zararlı içerik taraması temiz değil"));
  assert.ok(v.blockers.includes("Kritik açık mevcut"));
  assert.equal(
    artifactAttention("approved", "2027-01-01", "2027-02-01"),
    "expired",
  );
});
test("supply-chain API is maker-checker, blocker-gated, audited and export-safe", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/supply-chain/route.ts", "utf8"),
      readFile("drizzle/0057_fornost_ai_supply_chain.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-supply-chain.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı artifactı onaylayamaz/);
  assert.match(route, /Supply-chain engelleri/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /UNIQUE\(model_id,version,sha256\)/);
  assert.match(storage, /aiModelArtifactsSql/);
  assert.match(ui, /AI Model Supply-Chain Güvencesi/);
  assert.match(copilot, /AI Supply Chain/);
  assert.match(layout, /fornost-ai-supply-chain\.css/);
  assert.match(gate, /signature_verified=1 AND malware_clean=1/);
});
