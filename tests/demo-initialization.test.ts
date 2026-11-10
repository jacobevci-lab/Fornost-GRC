import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ensureDemoUser } from "../app/api/auth/security";

test("concurrent demo initialization creates one account and respects a recorded removal", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE local_users (
    id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT,
    password_salt TEXT, password_iterations INTEGER, role TEXT, status TEXT,
    created_at TEXT, updated_at TEXT);
    CREATE TABLE user_access_events (id TEXT PRIMARY KEY,after_json TEXT NOT NULL)`);
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
    sqlite.prepare("DELETE FROM local_users WHERE id=?").run(before[0].id);
    sqlite.prepare("INSERT INTO user_access_events VALUES (?,?)").run("local-delete:demo-test",JSON.stringify({operation:"delete-local-account",email:before[0].email}));
    await Promise.all([ensureDemoUser(db),ensureDemoUser(db)]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) total FROM local_users").get()!.total,0);
  } finally { sqlite.close(); }
});
