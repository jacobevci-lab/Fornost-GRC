/** Internal SQL identifiers only: callers supply server-read snapshots, never request objects. */
type Row = Record<string, string | number | null>;
const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid lifecycle SQL identifier');
  return value;
};

export class LifecycleConflict extends Error {
  constructor() { super('Kayıt işlem sırasında değişti. Güncel kaydı açıp kararınızı yeniden verin.'); }
}

export function lifecycleClaim(db: D1Database, table: string, assignments: string, values: unknown[], expected: Row, guard?: {sql: string; values: unknown[]}) {
  if (!Object.keys(expected).length || !expected.id) throw new Error('Lifecycle snapshot required');
  return db.prepare(`UPDATE ${identifier(table)} SET ${assignments} WHERE ${Object.keys(expected).map(key => `${identifier(key)} IS ?`).join(' AND ')}${guard ? ` AND (${guard.sql})` : ''}`)
    .bind(...values, ...Object.values(expected), ...(guard?.values || []));
}

/** Every dependent insert follows a single-row claim/insert in the same transaction. */
export function lifecycleInsert(db: D1Database, table: string, row: Row) {
  return db.prepare(`INSERT INTO ${identifier(table)}(${Object.keys(row).map(identifier).join(',')}) SELECT ${Object.keys(row).map(() => '?').join(',')} WHERE changes()=1`)
    .bind(...Object.values(row));
}

export async function commitLifecycle(db: D1Database, claim: D1PreparedStatement, dependents: D1PreparedStatement[]) {
  const results = await db.batch([claim, ...dependents]);
  if (Number(results[0]?.meta?.changes || 0) !== 1) throw new LifecycleConflict();
}

export function nextLifecycleStamp(previous: unknown) {
  const time = Date.parse(String(previous));
  if (!Number.isFinite(time)) throw new LifecycleConflict();
  return new Date(Math.max(Date.now(), time + 1)).toISOString();
}
