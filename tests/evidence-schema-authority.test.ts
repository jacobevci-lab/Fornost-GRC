import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("evidence lineage storage is represented in canonical schema and migration 0079", () => {
  const schema = readFileSync("db/evidence-schema.ts", "utf8");
  const migration = readFileSync("drizzle/0079_evidence_lineage_storage.sql", "utf8");
  const expected = [
    "evidence_versions",
    "evidence_version_controls",
    "simple_evidence_files",
  ];

  for (const table of expected) {
    assert.match(schema, new RegExp(`sqliteTable\\(\\"${table}\\"`));
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(migration, /UNIQUE\(evidence_id, version_no\)/);
  assert.match(migration, /PRIMARY KEY\(version_id, normalized_ref\)/);
});

test("migration validator includes the evidence schema module", () => {
  const validator = readFileSync("scripts/validate-d1-migrations.mjs", "utf8");
  assert.match(validator, /db["'], ["']evidence-schema\.ts/);
});

test("evidence history route delegates legacy repair instead of creating tables per request", () => {
  const route = readFileSync("app/api/evidence/history/route.ts", "utf8");
  const versioning = readFileSync("app/evidence/versioning.ts", "utf8");
  const compatibility = readFileSync("app/evidence/schema-compat.ts", "utf8");

  assert.match(route, /ensureCoreGrcSchemaCompatibility\(env\.DB\)/);
  assert.match(route, /ensureEvidenceHistorySchema\(env\.DB\)/);
  assert.doesNotMatch(route, /CREATE TABLE IF NOT EXISTS/);
  assert.match(versioning, /ensureEvidenceStorageSchemaCompatibility\(db\)/);
  assert.match(compatibility, /sqlite_master/);
  assert.match(compatibility, /let evidenceStorageSchemaReady: Promise<void> \| null = null/);
});
