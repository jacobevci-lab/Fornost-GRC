// Concurrent requests/isolates may both observe an older schema before ALTER.
// Only the exact duplicate-column race is harmless; operational failures propagate.
export async function ensurePasswordIterationsColumn(db: D1Database) {
  const columns = await db.prepare("PRAGMA table_info(local_users)").all<{name:string}>();
  if ((columns.results || []).some(column => column.name === "password_iterations")) return;
  try {
    await db.prepare("ALTER TABLE local_users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000").run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/\bduplicate column name:\s*password_iterations(?=[:\s]|$)/i.test(message)) throw error;
  }
}
