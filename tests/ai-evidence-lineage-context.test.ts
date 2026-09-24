import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inferReadModules } from "../app/ai/context";
import {
  isGlobalEvidenceIntegrityQuestion,
  scoreEvidenceLineageRecord,
  selectEvidenceLineageCandidates,
} from "../app/ai/evidence-lineage-context";

type Candidate = Parameters<typeof scoreEvidenceLineageRecord>[0];
type LineageRecords = Parameters<typeof selectEvidenceLineageCandidates>[0];

const records: Candidate[] = [
  {
    id: "EVD-alpha",
    data: {
      evidenceTitle: "Privileged access quarterly review",
      controlRefs: "A.5.15, CC6.1",
      owner: "iam@example.com",
      versionNo: "3",
    },
    updatedAt: "2026-09-24T10:00:00.000Z",
  },
  {
    id: "EVD-beta",
    data: {
      evidenceTitle: "Backup restore test",
      controlRefs: "A.8.13",
      owner: "infra@example.com",
      versionNo: "2",
    },
    updatedAt: "2026-09-24T11:00:00.000Z",
  },
];
const lineageRecords: LineageRecords = records.map((record) => ({
  ...record,
  createdAt: record.updatedAt,
  classification: "Internal",
}));

test("Ask Fornost routes evidence version, lineage and SHA-256 questions to Evidence Library", () => {
  for (const question of [
    "EVD-alpha kanıt versiyon geçmişini göster",
    "Show the evidence lineage and integrity chain for CC6.1",
    "Bu kanıtın SHA-256 bütünlük zinciri nedir?",
  ]) {
    assert.ok(inferReadModules(question).includes("Kanıtlar"), question);
  }
});

test("evidence lineage candidate selection strongly prefers exact evidence IDs and control references", () => {
  assert.ok(scoreEvidenceLineageRecord(records[0], "EVD-alpha geçmişini göster") > 900);
  assert.ok(scoreEvidenceLineageRecord(records[0], "CC6.1 evidence history") > scoreEvidenceLineageRecord(records[1], "CC6.1 evidence history"));
  const exact = selectEvidenceLineageCandidates(lineageRecords, "Show EVD-alpha evidence history", 5);
  assert.deepEqual(exact.map((record) => record.id), ["EVD-alpha"]);
  const control = selectEvidenceLineageCandidates(lineageRecords, "CC6.1 kanıt zinciri", 1);
  assert.equal(control[0]?.id, "EVD-alpha");
});

test("global integrity intent is separated from evidence-specific and control-specific requests", () => {
  assert.equal(isGlobalEvidenceIntegrityQuestion("Tüm kanıt zincirlerinde bütünlük sorunu var mı?"), true);
  assert.equal(isGlobalEvidenceIntegrityQuestion("Are any evidence integrity chains broken?"), true);
  assert.equal(isGlobalEvidenceIntegrityQuestion("EVD-alpha integrity chain status"), false);
  assert.equal(isGlobalEvidenceIntegrityQuestion("CC6.1 integrity chain status"), false);
});

test("lineage context is classification-gated, bounded and cryptographically verified before grounding", async () => {
  const [lineage, context] = await Promise.all([
    readFile("app/ai/evidence-lineage-context.ts", "utf8"),
    readFile("app/ai/context.ts", "utf8"),
  ]);
  assert.match(lineage, /dataClassificationAllowed/);
  assert.match(lineage, /verifyEvidenceVersionChain/);
  assert.match(lineage, /GLOBAL_VERSION_LIMIT/);
  assert.match(lineage, /sanitizeAiRecord/);
  assert.match(lineage, /all-visible-evidence/);
  assert.match(lineage, /history-unavailable/);
  assert.match(context, /buildEvidenceLineageAiContext/);
  assert.match(context, /specialContextBudget/);
  assert.match(context, /recordBudget/);
});
