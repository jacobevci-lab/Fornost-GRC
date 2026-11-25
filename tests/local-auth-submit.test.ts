import test from 'node:test';
import assert from 'node:assert/strict';
import { submitLocalAuthentication } from '../app/local-auth-submit';
const input = { action: 'login' as const, email: 'qa@example.test', password: 'synthetic' };
const send = (fetcher: typeof fetch, timeoutMs = 1000) => submitLocalAuthentication('/api/auth', input, { signal: new AbortController().signal, fetcher, timeoutMs });
test('login sends exactly one write and requires an explicit successful response', async () => {
 let calls = 0;
 await send(async (_url, init) => { calls++; assert.equal(init?.method, 'POST'); assert.deepEqual(JSON.parse(String(init?.body)), input); return Response.json({ ok: true }); });
 assert.equal(calls, 1);
 await assert.rejects(send(async () => Response.json({})), /doğrulanamadı/);
});
test('gateway and network failures never replay authentication writes', async () => {
 for (const network of [true, false]) {
  let calls = 0;
  await assert.rejects(send(async () => { calls++; if (network) throw new TypeError('offline'); return new Response('gateway', { status: 503 }); }));
  assert.equal(calls, 1);
 }
});
test('invalid credentials retain the server error and malformed JSON remains recoverable', async () => {
 await assert.rejects(send(async () => Response.json({ error: 'Geçersiz hesap.' }, { status: 401 })), /Geçersiz hesap/);
 await assert.rejects(send(async () => new Response('<html>proxy</html>')), /doğrulanamadı/);
});
test('a stalled authentication write is aborted without retry', async () => {
 let calls = 0;
 await assert.rejects(send(async (_url, init) => { calls++; return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))); }, 20), /zaman aşımına/);
 assert.equal(calls, 1);
});
