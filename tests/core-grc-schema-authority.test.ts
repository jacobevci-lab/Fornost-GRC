import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("core GRC support tables are represented in canonical schema and migration 0078", () => {
  const schema = readFileSync("db/core-grc-schema.ts", "utf8");
  const migration = readFileSync("drizzle/0078_core_grc_support_tables.sql", "utf8");
  const expected = [
    "simple_grc_metadata",
    "simple_audits",
    "simple_grc_record_codes",
    "simple_grc_record_code_counters",
  ];

  for (const table of expected) {
    assert.match(schema, new RegExp(`sqliteTable\\(\\"${table}\\"`));
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("migration validator includes all canonical schema modules", () => {
  const validator = readFileSync("scripts/validate-d1-migrations.mjs", "utf8");
  assert.match(validator, /db["'], ["']schema\.ts/);
  assert.match(validator, /db["'], ["']identity-schema\.ts/);
  assert.match(validator, /db["'], ["']core-grc-schema\.ts/);
});

test("core GRC API delegates legacy self-heal instead of executing DDL per request", () => {
  const route = readFileSync("app/api/grc/route.ts", "utf8");
  const compatibility = readFileSync("app/api/grc/schema-compat.ts", "utf8");

  assert.match(route, /ensureCoreGrcSchemaCompatibility/);
  assert.doesNotMatch(route, /CREATE TABLE IF NOT EXISTS simple_grc_records/);
  assert.doesNotMatch(route, /CREATE TABLE IF NOT EXISTS simple_grc_metadata/);
  assert.match(compatibility, /Canonical schema authority lives in db\/schema\.ts/);
  assert.match(compatibility, /sqlite_master/);
  assert.match(compatibility, /coreGrcSchemaReady/);
  assert.match(compatibility, /db\.batch/);
});
