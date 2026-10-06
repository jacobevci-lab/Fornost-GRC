import assert from "node:assert/strict";
import test from "node:test";
import { probeConnectedGrcSource } from "../scripts/connected-grc-source-probe.mjs";
const probe = get => probeConnectedGrcSource({ get }, "https://example.test/api/policy", {});
const response = (body, status = 200) => ({ status: () => status, ok: () => status >= 200 && status < 300, json: async () => body });

test("QA captures request failure without leaking session headers and can continue", async () => {
  const failed = await probe(async () => { throw new Error("cookie: session=private-value"); });
  assert.deepEqual(failed, { ok: false, status: null, reason: "request-failed", payload: null });
  const next = await probe(async () => response({ findings: [] }));
  assert.equal(next.ok, true);
});
test("QA treats invalid successful responses as failures", async () => {
  for (const body of [null, [], "html"]) assert.equal((await probe(async () => response(body))).reason, "invalid-response");
  assert.equal((await probe(async () => ({ ...response({}), json: async () => { throw new Error("bad json"); } }))).reason, "invalid-response");
});
test("QA preserves HTTP failures and sets a bounded request timeout", async () => {
  const result = await probe(async (_, options) => {
    assert.equal(options.timeout, 30_000);
    return response({ secret: "do not copy" }, 403);
  });
  assert.deepEqual(result, { ok: false, status: 403, reason: "http", payload: null });
});
