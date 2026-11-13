import assert from 'node:assert/strict';

export const fixtureCleanupResults = [];

// Synthetic fixtures only. Keep protected lineage in the disposable database;
// never weaken a production deletion guard just to make a cleanup succeed.
export async function cleanupQaFixture(context, base, kind, id) {
  const origin = new URL(base);
  assert.ok(origin.protocol === 'http:' && origin.hostname === '127.0.0.1', 'Fixture cleanup requires isolated loopback');
  assert.ok(['audit', 'record'].includes(kind) && typeof id === 'string' && id.length > 0);
  const path = kind === 'audit' ? '/api/audits' : '/api/grc';
  async function read() {
    const r = await context.request.get(base + path);
    assert.equal(r.status(), 200, `Cannot verify ${kind} cleanup`);
    const body = await r.json();
    assert.ok(!body.nextCursor, 'Cleanup verification requires a complete source');
    return (kind === 'audit' ? body.audits : body.rows).find(row => row.id === id);
  }
  const before = await read();
  assert.ok(before, `Owned ${kind} fixture ${id} is missing before cleanup`);
  const r = await context.request.delete(base + path + '?id=' + encodeURIComponent(id), { headers: { origin: base } });
  const body = await r.json();
  const after = await read();
  if (r.status() === 200) assert.equal(after, undefined, 'Deleted fixture must disappear');
  else {
    assert.equal(r.status(), 409, JSON.stringify(body));
    assert.equal(body.code, kind === 'audit' ? 'AUDIT_LINKED' : 'RECORD_LINKED');
    assert.deepEqual(after, before, 'Protected fixture must remain unchanged');
  }
  const result = { kind, id, deleted: r.status() === 200, retained: r.status() === 409 };
  fixtureCleanupResults.push(result);
  console.log('ISOLATED_FIXTURE_CLEANUP', JSON.stringify(result));
  return result;
}
