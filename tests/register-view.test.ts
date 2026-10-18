import test from 'node:test';
import assert from 'node:assert/strict';
import { readRegisterView, writeRegisterView, registerViewKey, emptyRegisterView } from '../app/register-view';
test('register context is isolated by user/module and survives navigation and refresh', () => {
  const memory = new Map<string,string>(), storage = () => ({ getItem: (key: string) => memory.get(key) || null, setItem: (key: string, value: string) => { memory.set(key, value); } });
  const key = registerViewKey('user-a','Risk Assessment'), view = { query: 'payroll', filters: { owner: 'Operations', status: 'Open' } };
  writeRegisterView(storage, key, view); assert.deepEqual(readRegisterView(storage, key), view);
  assert.deepEqual(readRegisterView(storage, registerViewKey('user-b','Risk Assessment')), emptyRegisterView());
  assert.deepEqual(readRegisterView(storage, registerViewKey('user-a','BIA')), emptyRegisterView());
  assert.notEqual(registerViewKey('a:b','c'), registerViewKey('a','b:c'));
});
test('unavailable or malformed storage cannot break the register', () => {
  assert.doesNotThrow(() => writeRegisterView(() => { throw new Error(); }, 'key', emptyRegisterView()));
  assert.deepEqual(readRegisterView(() => { throw new Error(); }, 'key'), emptyRegisterView());
  for (const raw of ['null', '{', '{"query":1}', '{"query":"x","filters":[]}','x'.repeat(16001)])
    assert.deepEqual(readRegisterView(() => ({ getItem: () => raw }), 'key'), emptyRegisterView());
});
