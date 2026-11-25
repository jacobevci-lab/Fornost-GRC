import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { cleanupExpiredSessions, SESSION_CLEANUP_SQL, SESSION_CLEANUP_BATCH_SIZE, SESSION_EXPIRY_INDEX_SQL, SESSION_USER_INDEX_SQL } from '../app/api/auth/session-storage';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0077_identity_security.sql', 'utf8'));
  const migration = readFileSync('drizzle/0083_session_lookup_indexes.sql', 'utf8');
  sql.exec(migration);
  // Runtime self-healing and repeat application must preserve existing indexes.
  sql.exec(`${SESSION_EXPIRY_INDEX_SQL}; ${SESSION_USER_INDEX_SQL};`);
  const db = { prepare(query: string) {
    let values: SQLInputValue[] = [];
    return {
      bind(...args: SQLInputValue[]) { values = args; return this; },
      async run() { return sql.prepare(query).run(...values); },
    };
  } } as unknown as D1Database;
  return { sql, db };
}

test('session maintenance drains a large expired backlog in bounded batches without deleting live sessions', async () => {
  const { sql, db } = fixture();
  try {
    const now = '2026-10-08T12:00:00.000Z';
    const insert = sql.prepare('INSERT INTO local_sessions VALUES(?,?,?,?,?)');
    for (let i = 0; i < 253; i++) insert.run(`expired-${String(i).padStart(3, '0')}`, 'old-user', now, now, now);
    for (let i = 0; i < 7; i++) insert.run(`live-${i}`, 'live-user', '2026-10-08T13:00:00.000Z', now, now);
    for (const expected of [153, 53, 0, 0]) {
      const before = Number(sql.prepare('SELECT COUNT(*) n FROM local_sessions').get()!.n);
      await cleanupExpiredSessions(db, now);
      const after = Number(sql.prepare('SELECT COUNT(*) n FROM local_sessions').get()!.n);
      assert.ok(before - after <= SESSION_CLEANUP_BATCH_SIZE);
      assert.equal(after, expected + 7);
      assert.equal(sql.prepare("SELECT COUNT(*) n FROM local_sessions WHERE user_id='live-user'").get()!.n, 7);
    }
  } finally { sql.close(); }
});

test('expiry ordering clears the oldest records first, including exact deadline matches', async () => {
  const { sql, db } = fixture();
  try {
    const insert = sql.prepare('INSERT INTO local_sessions VALUES(?,?,?,?,?)');
    for (let i = 0; i < 100; i++) insert.run(`a-${i}`, 'u', '2026-10-08T12:00:00.000Z', '', '');
    insert.run('z-oldest', 'u', '2026-01-01T00:00:00.000Z', '', '');
    await cleanupExpiredSessions(db, '2026-10-08T12:00:00.000Z');
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM local_sessions WHERE id_hash='z-oldest'").get()!.n, 0);
    assert.equal(sql.prepare('SELECT COUNT(*) n FROM local_sessions').get()!.n, 1);
  } finally { sql.close(); }
});

test('cleanup and per-user revocation use indexes and leave other users intact', () => {
  const { sql } = fixture();
  try {
    const plan = sql.prepare(`EXPLAIN QUERY PLAN ${SESSION_CLEANUP_SQL}`).all('2026-10-08', 100).map(row => row.detail).join('\n');
    assert.match(plan, /SEARCH local_sessions USING COVERING INDEX local_sessions_expiry_idx/);
    assert.doesNotMatch(plan, /SCAN local_sessions|USE TEMP B-TREE/);
    const revokePlan = sql.prepare('EXPLAIN QUERY PLAN DELETE FROM local_sessions WHERE user_id=?').all('target').map(row => row.detail).join('\n');
    assert.match(revokePlan, /SEARCH local_sessions USING INDEX local_sessions_user_idx/);
    sql.exec("INSERT INTO local_sessions VALUES('one','target','future','',''),('two','other','future','','');");
    sql.prepare('DELETE FROM local_sessions WHERE user_id=?').run('target');
    assert.deepEqual(sql.prepare('SELECT id_hash FROM local_sessions').all().map(row => row.id_hash), ['two']);
  } finally { sql.close(); }
});

test('cleanup propagates database failures instead of reporting maintenance success', async () => {
  const { sql, db } = fixture();
  sql.close();
  await assert.rejects(() => cleanupExpiredSessions(db, '2026-10-08T12:00:00.000Z'));
});
