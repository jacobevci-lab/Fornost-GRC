import {completedInitialization} from "../completed-initialization";
export const integrationSchema = [
  `CREATE TABLE IF NOT EXISTS integration_settings (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    secret_ciphertext TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS integration_settings_kind_idx ON integration_settings(kind)`,
  `CREATE TABLE IF NOT EXISTS integration_events (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS integration_events_kind_created_idx ON integration_events(kind, created_at)`,
];
const ready=completedInitialization();
export async function ensureIntegrations(db:D1Database){await ready(db,()=>db.batch(integrationSchema.map(sql=>db.prepare(sql))));}
