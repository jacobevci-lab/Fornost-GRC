// Canonical schema authority lives in db/schema.ts, db/core-grc-schema.ts and
// their D1 migrations (0027 and 0078). This compatibility layer only repairs
// persisted on-prem installations that predate those migration baselines.

const compatibilitySchema = [
  `CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS simple_grc_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS simple_audits (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,template TEXT NOT NULL,audit_type TEXT NOT NULL,auditor TEXT NOT NULL,audit_owner TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS simple_grc_record_codes (record_id TEXT PRIMARY KEY,module TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS simple_grc_record_code_counters (module TEXT PRIMARY KEY,value INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)`,
] as const;

const canonicalTables = [
  "simple_grc_records",
  "simple_grc_metadata",
  "simple_audits",
  "simple_grc_record_codes",
  "simple_grc_record_code_counters",
] as const;

let coreGrcSchemaReady: Promise<void> | null = null;

async function canonicalTablesExist(db: D1Database) {
  const placeholders = canonicalTables.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
  ).bind(...canonicalTables).all<{ name: string }>();
  const names = new Set((rows.results || []).map((row) => row.name));
  return canonicalTables.every((table) => names.has(table));
}

export async function ensureCoreGrcSchemaCompatibility(db: D1Database) {
  if (!coreGrcSchemaReady) {
    coreGrcSchemaReady = (async () => {
      if (await canonicalTablesExist(db)) return;
      await db.batch(compatibilitySchema.map((sql) => db.prepare(sql)));
    })().catch((error) => {
      coreGrcSchemaReady = null;
      throw error;
    });
  }
  await coreGrcSchemaReady;
}
