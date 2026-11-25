import assert from "node:assert/strict";
import test from "node:test";
import { dataClassificationAllowed, type AiDataClassification } from "../app/ai/data-policy";
import { buildGrcContext } from "../app/ai/context";
import { buildEvidenceLineageAiContext } from "../app/ai/evidence-lineage-context";
import { searchApprovedKnowledge } from "../app/ai/knowledge";
import { getEffectiveAiDataPolicy, type AiRuntimeProfile } from "../app/ai/runtime-provider";

test("localized classes, case and Unicode variants keep their data ceiling", () => {
  for (const value of ["Public", "PUBLIC", "Herkese Açık", "HERKESE AÇIK", "Herkese Acik"])
    assert.equal(dataClassificationAllowed(value, "Public"), true, value);
  for (const value of ["Internal", "INTERNAL", "Şirket İçi", "ŞİRKET İÇİ", "S\u0327irket I\u0307c\u0327i"]) {
    assert.equal(dataClassificationAllowed(value, "Internal"), true, value);
    assert.equal(dataClassificationAllowed(value, "Public"), false, value);
  }
  for (const value of ["Confidential", "confidential", "Gizli", "GİZLİ", "GIZLI", "  Gizli  "]) {
    assert.equal(dataClassificationAllowed(value, "Internal"), false, value);
    assert.equal(dataClassificationAllowed(value, "Confidential"), true, value);
  }
  for (const value of ["Restricted", "restricted", "Çok Gizli", "ÇOK GİZLİ", "cok gizli", "Top Secret", "unknown", "", null, undefined, 1, {}, ["Public"], "Public\0", "Public\n", "Public" + " ".repeat(30) + "Restricted"]) {
    for (const max of ["Public", "Internal", "Confidential"] as const)
      assert.equal(dataClassificationAllowed(value, max), false, String(value));
  }
});

// Real context builders; only D1 query results are synthetic. No model/network.
const cases: Array<[string, Record<string, unknown>]> = [
  ["public", { classification: "Herkese Açık" }],
  ["internal", { classification: "Şirket İçi" }],
  ["legacy", {}],
  ["secret", { classification: "Gizli" }],
  ["restricted", { classification: "Çok Gizli" }],
  ["unknown", { classification: "custom-private" }],
  ["blank", { classification: "" }],
  ["null", { classification: null }],
  ["conflict", { dataClassification: "Public", classification: "Gizli" }],
  ["secondary", { dataClassification: "Internal", securityClassification: "Çok Gizli" }],
  ["malformed", { dataClassification: { value: "Public" }, classification: "Public" }],
];
function contextDb(module: string) {
  const rows = cases.map(([id, data]) => ({ id: `EVD-${id}`, module,
    data_json: JSON.stringify({ evidenceTitle: id, title: id, ...data }),
    created_at: "2026-11-04T00:00:00.000Z", updated_at: "2026-11-04T00:00:00.000Z" }));
  const versionIds: string[] = [];
  return { versionIds, db: { prepare(sql: string) {
    let values: unknown[] = [];
    return { bind(...args: unknown[]) { values = args; return this; }, async all() {
      if (sql.includes("FROM simple_grc_records")) return { results: rows };
      if (sql.includes("FROM evidence_versions")) { versionIds.push(...values.map(String)); return { results: [] }; }
      if (sql.includes("FROM ai_knowledge_chunks")) return { results: [] };
      throw new Error(`Unexpected query: ${sql}`);
    } };
  } } as unknown as D1Database };
}

for (const [max, expected] of [
  ["Public", ["public"]],
  ["Internal", ["public", "internal", "legacy"]],
  ["Confidential", ["public", "internal", "legacy", "secret", "conflict"]],
] as Array<[AiDataClassification, string[]]>) {
  test(`real core and evidence context enforce ${max} across every classification alias`, async () => {
    const core = contextDb("Varlık Envanteri");
    const context = await buildGrcContext(core.db, "asset", max);
    assert.deepEqual(context.sources.map(s => s.id).sort(), expected.map(id => `EVD-${id}`).sort());
    const evidence = contextDb("Kanıtlar");
    const lineage = await buildEvidenceLineageAiContext(evidence.db, "evidence history", max);
    for (const [id] of cases) {
      const permitted = expected.includes(id);
      assert.equal(context.contextText.includes(`EVD-${id}`), permitted, `core ${id}`);
      assert.equal(lineage.contextText.includes(`EVD-${id}`), permitted, `lineage ${id}`);
      assert.equal(evidence.versionIds.includes(`EVD-${id}`), permitted, `version query ${id}`);
    }
  });
}

test("approved knowledge uses the same policy for persisted localized and unknown classes", async () => {
  const rows = ["Public", "Şirket İçi", "Gizli", "Çok Gizli", "unknown", null].map((classification, i) => ({
    source_id: `source000${i}`, name: "Access policy", classification, version: 1, ordinal: 0,
    content_text: "access policy", updated_at: "2026-11-04",
  }));
  const db = { prepare: () => ({ all: async () => ({ results: rows }) }) } as unknown as D1Database;
  const result = await searchApprovedKnowledge(db, "access policy", "Internal");
  assert.deepEqual(new Set(result.map(row => row.classification)), new Set(["Public", "Şirket İçi"]));
});

test("external fallback ceiling excludes Turkish confidential core context", async () => {
  const base = { provider: "openai-compatible", model: "fixture", apiKey: "", temperature: 0,
    timeoutMs: 5000, maxTokens: 128 } as const;
  const chain: AiRuntimeProfile[] = [
    { ...base, profile: "primary", baseUrl: "http://127.0.0.1:11434", trustZone: "local", maxDataClassification: "Confidential" },
    { ...base, profile: "fallback", baseUrl: "https://ai.example.com", trustZone: "external", maxDataClassification: "Internal" },
  ];
  const policy = getEffectiveAiDataPolicy(chain);
  const result = await buildGrcContext(contextDb("Varlık Envanteri").db, "asset", policy.maxDataClassification);
  assert.deepEqual(result.sources.map(s => s.id).sort(), ["EVD-internal", "EVD-legacy", "EVD-public"]);
});
