// Canonical schema authority lives in db/schema.ts and drizzle/0072_enterprise_findings_capa.sql.
// This module exists only to self-heal older persisted on-prem installations that predate
// the migration baseline. New installations must receive these tables through migrations.

const compatibilitySchema = [
  `CREATE TABLE IF NOT EXISTS enterprise_findings(id TEXT PRIMARY KEY NOT NULL,code TEXT NOT NULL UNIQUE,source_type TEXT NOT NULL,source_ref TEXT NOT NULL,source_title TEXT NOT NULL,finding_type TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,severity TEXT NOT NULL,owner TEXT NOT NULL,reviewer TEXT NOT NULL,root_cause TEXT NOT NULL,corrective_action TEXT NOT NULL,preventive_action TEXT NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',risk_ref TEXT,control_ref TEXT,evidence_reference TEXT,evidence_sha256 TEXT,verification_evidence_reference TEXT,verification_evidence_sha256 TEXT,acceptance_rationale TEXT,accept_until TEXT,recurrence_count INTEGER NOT NULL DEFAULT 0,detected_by TEXT NOT NULL,detected_at TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,started_by TEXT,started_at TEXT,submitted_by TEXT,submitted_at TEXT,verified_by TEXT,verified_at TEXT,reopened_by TEXT,reopened_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS enterprise_findings_status_due_idx ON enterprise_findings(status,severity,due_date)`,
  `CREATE INDEX IF NOT EXISTS enterprise_findings_source_idx ON enterprise_findings(source_type,source_ref)`,
  `CREATE TABLE IF NOT EXISTS enterprise_finding_events(id TEXT PRIMARY KEY NOT NULL,finding_id TEXT NOT NULL,action TEXT NOT NULL,from_status TEXT,to_status TEXT,detail TEXT NOT NULL,evidence_reference TEXT,evidence_sha256 TEXT,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS enterprise_finding_events_finding_date_idx ON enterprise_finding_events(finding_id,created_at)`,
] as const;

let findingsSchemaReady: Promise<void> | null = null;

async function canonicalTablesExist(db: D1Database) {
  const rows = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('enterprise_findings','enterprise_finding_events')",
  ).all<{ name: string }>();
  const names = new Set((rows.results || []).map((row) => row.name));
  return names.has("enterprise_findings") && names.has("enterprise_finding_events");
}

export async function ensureFindingsSchemaCompatibility(db: D1Database) {
  if (!findingsSchemaReady) {
    findingsSchemaReady = (async () => {
      if (await canonicalTablesExist(db)) return;
      await db.batch(compatibilitySchema.map((sql) => db.prepare(sql)));
    })().catch((error) => {
      findingsSchemaReady = null;
      throw error;
    });
  }
  await findingsSchemaReady;
}
