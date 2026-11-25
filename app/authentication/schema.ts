import { completedInitialization } from "../completed-initialization";
export const authenticationSchema = [
  `CREATE TABLE IF NOT EXISTS identity_login_config (id INTEGER PRIMARY KEY CHECK(id=1), config_json TEXT NOT NULL, secrets_ciphertext TEXT NOT NULL, revision TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS authentication_events (id TEXT PRIMARY KEY, method TEXT NOT NULL, outcome TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS authentication_events_created ON authentication_events(created_at DESC,id DESC)`,
  `CREATE TABLE IF NOT EXISTS authentication_states (id_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, revision TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS authentication_states_expiry ON authentication_states(expires_at)`,
  `CREATE TABLE IF NOT EXISTS authentication_bindings (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(provider,user_id))`,
  `CREATE TABLE IF NOT EXISTS authentication_limits (key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS authentication_limits_expiry ON authentication_limits(expires_at)`,
  `CREATE TABLE IF NOT EXISTS authentication_session_methods (id_hash TEXT PRIMARY KEY, method TEXT NOT NULL, expires_at TEXT NOT NULL)`,
];
const initialized = completedInitialization();
export async function ensureAuthentication(db: D1Database) {
  await initialized(db, () =>
    db.batch(authenticationSchema.map((sql) => db.prepare(sql))),
  );
}
