import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonBodyError, readBoundedJsonObject } from '../app/api/request-body';
const request = (body: string, headers: Record<string,string> = {}) => new Request('https://app.test/api/auth', {method:'POST', body, headers});
const status = (expected: number) => (error: unknown) => error instanceof JsonBodyError && error.status === expected;
test('actual bytes enforce limits without Content-Length and with a dishonest small header', async () => {
  for (const headers of [{}, {'content-length':'1'}] as Record<string,string>[]) await assert.rejects(readBoundedJsonObject(request('{"value":"'+'a'.repeat(40)+'"}',headers),32),status(413));
});
test('multi-byte UTF-8 is bounded by bytes, and the exact limit is accepted', async () => {
  const body = '{"value":"şş"}';
  const size = new TextEncoder().encode(body).length;
  assert.deepEqual(await readBoundedJsonObject(request(body),size),{value:'şş'});
  await assert.rejects(readBoundedJsonObject(request(body),size-1),status(413));
});
test('malformed and non-object JSON cannot reach authentication handlers', async () => {
  for(const body of ['{bad','null','[]','true','1','"value"']) await assert.rejects(readBoundedJsonObject(request(body),100),status(400));
});
test('oversized cloned stream fails promptly without waiting for the unused tee', async () => {
  const source=request('{"value":"'+'a'.repeat(100)+'"}');
  await assert.rejects(Promise.race([readBoundedJsonObject(source.clone(),32),new Promise((_,reject)=>setTimeout(()=>reject(new Error('blocked clone cancellation')),500))]),status(413));
});
