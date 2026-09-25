// Canonical schema authority lives in db/evidence-schema.ts and
// drizzle/0079_evidence_lineage_storage.sql. This module only repairs older
// persisted on-prem installations that predate the evidence migration baseline.

const compatibilitySchema = [
  `CREATE TABLE IF NOT EXISTS evidence_versions(
    id TEXT PRIMARY KEY,
    evidence_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_sha256 TEXT NOT NULL,
    chain_sha256 TEXT NOT NULL,
    previous_version_id TEXT,
    previous_chain_sha256 TEXT,
    evidence_title TEXT NOT NULL,
    owner TEXT NOT NULL,
    period TEXT NOT NULL,
    frameworks TEXT NOT NULL,
    control_refs TEXT NOT NULL,
    change_note TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(evidence_id,version_no)
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_version_controls(
    version_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    control_ref TEXT NOT NULL,
    normalized_ref TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(version_id,normalized_ref)
  )`,
  `CREATE TABLE IF NOT EXISTS simple_evidence_files(
    file_key TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content BLOB NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS evidence_versions_evidence_idx ON evidence_versions(evidence_id,version_no)",
  "CREATE INDEX IF NOT EXISTS evidence_versions_created_idx ON evidence_versions(created_at)",
  "CREATE INDEX IF NOT EXISTS evidence_version_controls_ref_idx ON evidence_version_controls(normalized_ref,created_at)",
  "CREATE INDEX IF NOT EXISTS evidence_version_controls_evidence_idx ON evidence_version_controls(evidence_id,version_no)",
] as const;

const requiredObjects = [
  "evidence_versions",
  "evidence_version_controls",
  "simple_evidence_files",
  "evidence_versions_evidence_idx",
  "evidence_versions_created_idx",
  "evidence_version_controls_ref_idx",
  "evidence_version_controls_evidence_idx",
] as const;

let evidenceStorageSchemaReady: Promise<void> | null = null;

async function canonicalObjectsExist(db: D1Database) {
  const placeholders = requiredObjects.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT name FROM sqlite_master WHERE name IN (${placeholders})`,
  ).bind(...requiredObjects).all<{ name: string }>();
  const names = new Set((rows.results || []).map((row) => row.name));
  return requiredObjects.every((name) => names.has(name));
}

export async function ensureEvidenceStorageSchemaCompatibility(db: D1Database) {
  if (!evidenceStorageSchemaReady) {
    evidenceStorageSchemaReady = (async () => {
      if (await canonicalObjectsExist(db)) return;
      await db.batch(compatibilitySchema.map((sql) => db.prepare(sql)));
    })().catch((error) => {
      evidenceStorageSchemaReady = null;
      throw error;
    });
  }
  await evidenceStorageSchemaReady;
}
