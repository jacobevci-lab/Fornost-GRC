import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("findings canonical schema is owned by Drizzle schema and migration 0072", () => {
  const schema = readFileSync("db/schema.ts", "utf8");
  const migration = readFileSync("drizzle/0072_enterprise_findings_capa.sql", "utf8");

  assert.match(schema, /sqliteTable\("enterprise_findings"/);
  assert.match(schema, /sqliteTable\("enterprise_finding_events"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS enterprise_findings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS enterprise_finding_events/);
  assert.match(migration, /verification_evidence_reference/);
  assert.match(migration, /acceptance_rationale/);
  assert.match(migration, /recurrence_count/);
});

test("findings API delegates legacy self-heal to an explicit compatibility layer", () => {
  const route = readFileSync("app/api/findings/route.ts", "utf8");
  const compatibility = readFileSync("app/api/findings/schema-compat.ts", "utf8");

  assert.match(route, /ensureFindingsSchemaCompatibility/);
  assert.doesNotMatch(route, /CREATE TABLE IF NOT EXISTS enterprise_findings/);
  assert.match(compatibility, /Canonical schema authority lives in db\/schema\.ts/);
  assert.match(compatibility, /sqlite_master/);
  assert.match(compatibility, /db\.batch/);
  assert.match(compatibility, /findingsSchemaReady/);
});
