// Keep login maintenance bounded even after long periods without sign-ins.
export const SESSION_CLEANUP_BATCH_SIZE = 100;
export const SESSION_EXPIRY_INDEX_SQL = "CREATE INDEX IF NOT EXISTS local_sessions_expiry_idx ON local_sessions(expires_at, id_hash)";
export const SESSION_USER_INDEX_SQL = "CREATE INDEX IF NOT EXISTS local_sessions_user_idx ON local_sessions(user_id)";
export const SESSION_CLEANUP_SQL = `DELETE FROM local_sessions WHERE id_hash IN (
  SELECT id_hash FROM local_sessions WHERE expires_at<=?
  ORDER BY expires_at, id_hash LIMIT ?
)`;

export async function cleanupExpiredSessions(db: D1Database, now: string) {
  return db.prepare(SESSION_CLEANUP_SQL).bind(now, SESSION_CLEANUP_BATCH_SIZE).run();
}
