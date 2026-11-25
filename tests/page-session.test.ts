import test from "node:test";
import assert from "node:assert/strict";
import { pageSessionKey, restorePage, rememberPage } from "../app/page-session";
import { canOpenModule } from "../app/module-access";

test("refresh restores the latest page, isolated by authenticated user", () => {
  const data = new Map<string,string>();
  const storage = () => ({ getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key,value); } });
  const first = pageSessionKey("first"), second = pageSessionKey("second");
  rememberPage(storage, first, "BIA");
  rememberPage(storage, second, "Kontroller");
  assert.equal(restorePage(storage, first, () => true), "BIA");
  assert.equal(restorePage(storage, second, () => true), "Kontroller");
  rememberPage(storage, first, "Risk Assessment");
  assert.equal(restorePage(storage, first, () => true), "Risk Assessment");
});
test("unknown and revoked pages fall back to Home", () => {
  const subject = {role: "Editor", moduleAccess: {mode: "scoped" as const, modules: {}}};
  const storage = () => ({getItem: () => "Risk Assessment", setItem: () => {}});
  assert.equal(restorePage(storage, "key", module => canOpenModule(subject,module)), "Ana Sayfa");
  assert.equal(restorePage(storage, "key", () => false), "Ana Sayfa");
});
test("missing, oversized and unavailable storage do not break navigation", () => {
  for (const value of [null, "x".repeat(101)]) {
    assert.equal(restorePage(() => ({getItem: () => value, setItem: () => {}}), "key", () => true), "Ana Sayfa");
  }
  const blocked = () => { throw new Error("SecurityError"); };
  assert.equal(restorePage(blocked, "key", () => true), "Ana Sayfa");
  assert.doesNotThrow(() => rememberPage(blocked, "key", "BIA"));
});
