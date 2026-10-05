import test from 'node:test';
import assert from 'node:assert/strict';
import { readSessionSnapshot } from '../app/session-snapshot';
const signedIn = { authenticated: true, bootstrapRequired: false, user: { id: 'a', role: 'Admin' } };
const read = (fetcher: typeof fetch, timeoutMs = 1000) => readSessionSnapshot('/api/auth', { signal: new AbortController().signal, fetcher, timeoutMs });
test('identity probe retries a transient gateway error once and returns the session', async () => {
 let calls = 0;
 assert.deepEqual(await read(async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json(signedIn)), signedIn);
 assert.equal(calls, 2);
});
test('identity probe retries a network failure but never loops', async () => {
 let calls = 0;
 await assert.rejects(read(async () => { calls++; throw new TypeError('offline'); }));
 assert.equal(calls, 2);
});
test('identity probe does not retry authorization errors or accept malformed success', async () => {
 let calls = 0;
 await assert.rejects(read(async () => { calls++; return new Response('', { status: 401 }); }));
 assert.equal(calls, 1);
 for (const value of [{}, { authenticated: true, bootstrapRequired: false }, { ...signedIn, user: { id: '' } }]) await assert.rejects(read(async () => Response.json(value)));
 assert.equal((await read(async () => Response.json({ authenticated: false, bootstrapRequired: false }))).authenticated, false);
});
test('identity deadline aborts a stalled request and returns a recoverable error', async () => {
 let cancelled = false;
 await assert.rejects(read(async (_url, init) => new Promise((_resolve, reject) => {
  init!.signal!.addEventListener('abort', () => { cancelled = true; reject(new Error('aborted')); });
 }), 20), /zaman aşımına/);
 assert.equal(cancelled, true);
});
test('superseding a check aborts its transport without retrying it', async () => {
 const controller = new AbortController(); let calls = 0;
 const pending = readSessionSnapshot('/api/auth', { signal: controller.signal, fetcher: async (_url, init) => {
  calls++; return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
 } });
 controller.abort(); await assert.rejects(pending); assert.equal(calls, 1);
});
