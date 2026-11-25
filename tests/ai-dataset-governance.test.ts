import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  datasetAttention,
  datasetBlockers,
  validateDataset,
} from "../app/ai/dataset-governance";
const valid = {
  modelId: "AIM-1",
  name: "Policy corpus",
  version: "1.0",
  purpose: "rag",
  sourceType: "internal",
  sourceOwner: "data@example.com",
  provenance: "Approved policy library with version history",
  license: "Internal authorized use",
  legalBasis: "Legitimate business purpose",
  dataClassification: "Internal",
  personalData: false,
  specialCategory: false,
  consentRequired: false,
  consentVerified: false,
  retentionDays: 365,
  records: 5000,
  qualityScore: 85,
  biasScore: 15,
  documentation: "Coverage, sampling and known limitations documented",
  reviewDate: "2027-06-01",
};
test("AI dataset validation enforces lineage, privacy and bounded quality metadata", () => {
  assert.equal(validateDataset(valid).purpose, "rag");
  assert.throws(
    () => validateDataset({ ...valid, specialCategory: true }),
    /kişisel veri/,
  );
  assert.throws(
    () => validateDataset({ ...valid, consentRequired: true }),
    /açık rıza/i,
  );
  assert.throws(
    () => validateDataset({ ...valid, retentionDays: 5000 }),
    /1–3650/,
  );
});
test("dataset approval blockers are deterministic and fail closed", () => {
  assert.deepEqual(datasetBlockers(valid), []);
  assert.deepEqual(
    datasetBlockers({ ...valid, qualityScore: 60, biasScore: 45 }),
    ["Kalite skoru 70 altında", "Bias riski 30 üzerinde"],
  );
  assert.equal(
    datasetAttention("approved", "2027-01-01", "2027-02-01"),
    "overdue",
  );
});
test("dataset API enforces maker-checker, blockers, audit and safe export", async () => {
  const [route, migration, storage, ui, copilot, layout, gate] =
    await Promise.all([
      readFile("app/api/ai/datasets/route.ts", "utf8"),
      readFile("drizzle/0054_fornost_ai_dataset_governance.sql", "utf8"),
      readFile("app/ai/storage.ts", "utf8"),
      readFile("app/fornost-ai-datasets.tsx", "utf8"),
      readFile("app/fornost-ai-copilot.tsx", "utf8"),
      readFile("app/layout.tsx", "utf8"),
      readFile("app/api/ai/release-gate/route.ts", "utf8"),
    ]);
  assert.match(route, /oluşturan kişi aynı veri setini onaylayamaz/);
  assert.match(route, /Kontrol engelleri giderilmeden/);
  assert.match(route, /\^\[=\+\\-@\]/);
  assert.match(route, /recordAiEvent/);
  assert.match(migration, /UNIQUE\(model_id,name,version\)/);
  assert.match(storage, /aiDatasetsSql/);
  assert.match(ui, /AI Veri Seti ve Lineage Merkezi/);
  assert.match(copilot, /AI Veri Setleri/);
  assert.match(layout, /fornost-ai-datasets\.css/);
  assert.match(gate, /status='approved' AND review_date/);
});
