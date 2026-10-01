import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ensureDemoUser } from "../app/api/auth/security";

test("concurrent demo initialization creates one account without changing its credentials", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE local_users (
    id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT,
    password_salt TEXT, password_iterations INTEGER, role TEXT, status TEXT,
    created_at TEXT, updated_at TEXT)`);
  const db = { prepare(sql: string) {
    return { bind(...args: (string | number)[]) {
      return {
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async run() { return sqlite.prepare(sql).run(...args); },
      };
    } };
  } } as unknown as Parameters<typeof ensureDemoUser>[0];
  try {
    await Promise.all([ensureDemoUser(db), ensureDemoUser(db), ensureDemoUser(db)]);
    const before = sqlite.prepare("SELECT * FROM local_users").all();
    assert.equal(before.length, 1);
    assert.equal(before[0].role, "Editor");
    await ensureDemoUser(db);
    assert.deepEqual(sqlite.prepare("SELECT * FROM local_users").all(), before);
  } finally { sqlite.close(); }
});
