import assert from "node:assert/strict";
import test from "node:test";
import { loadConnectedGrcSources } from "../app/connected-grc-loader";

const json = (body: unknown) => Response.json(body);
const run = (fetcher: typeof fetch, signal = new AbortController().signal, includeAi = false) =>
  loadConnectedGrcSources({ includeAi, signal, fetcher, timeoutMs: 20 });

test("a stalled source times out without losing successful sources", async () => {
  let stalledSignal: AbortSignal | undefined;
  const result = await run(async (url, init) => {
    if (String(url).endsWith("/policy-lifecycle")) {
      stalledSignal = init?.signal as AbortSignal;
      return new Promise<Response>(() => {});
    }
    return json({ findings: [] });
  });
  assert.equal(result.total, 8);
  assert.equal(result.ready, 7);
  assert.equal(result.payloads.policy, undefined);
  assert.ok(result.payloads.findings);
  assert.equal(stalledSignal?.aborted, true);
});

test("deadline includes stalled body parsing and ignores late responses", async () => {
  let finish!: (body: unknown) => void;
  const result = await run(async url => String(url).endsWith("/policy-lifecycle")
    ? { ok: true, json: () => new Promise(resolve => { finish = resolve; }) } as Response
    : json({}));
  finish({ documents: [{ id: "late" }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.ready, 7);
  assert.equal(result.payloads.policy, undefined);
});

test("HTTP and malformed responses remain partial; a new attempt can recover", async () => {
  const failed = await run(async url => String(url).endsWith("/findings") ? new Response("denied", { status: 403 }) : json([]));
  assert.equal(failed.ready, 0);
  assert.deepEqual(failed.payloads, {});
  const recovered = await run(async () => json({}));
  assert.equal(recovered.ready, 8);
});

test("cancellation settles even if fetch ignores abort, and starts no work when already cancelled", async () => {
  const controller = new AbortController();
  const pending = run(async () => new Promise<Response>(() => {}), controller.signal);
  controller.abort();
  assert.deepEqual((await pending).payloads, {});
  let calls = 0;
  await run(async () => { calls++; return json({}); }, controller.signal);
  assert.equal(calls, 0);
});

test("AI requests are opt-in and incomplete AI sources cannot claim readiness", async () => {
  const paths: string[] = [];
  const fetcher: typeof fetch = async url => { paths.push(String(url)); return json({}); };
  assert.equal((await run(fetcher)).ready, 8);
  assert.ok(paths.every(path => !path.includes("/ai/")));
  const withAi = await run(fetcher, undefined, true);
  assert.equal(withAi.total, 11);
  assert.equal(withAi.ready, 8);
  assert.equal(paths.filter(path => path.includes("/ai/")).length, 3);
});

test("source failures expose safe, actionable reasons without server content", async () => {
  const result = await run(async url => {
    const path = String(url);
    if (path.endsWith("/findings")) return new Response("sensitive server details", { status: 403 });
    if (path.endsWith("/incidents")) return new Response("not-json");
    if (path.endsWith("/policy-lifecycle")) return new Promise<Response>(() => {});
    if (path.endsWith("/continuity")) return new Response("internal error", { status: 500 });
    return json({});
  });
  assert.equal(result.ready, 4);
  assert.deepEqual(Object.fromEntries(result.issues.map(issue => [issue.key, issue.reason])), {
    continuity: "unavailable", findings: "access", incidents: "invalid", policy: "timeout",
  });
  assert.ok(!JSON.stringify(result).includes("sensitive"));
});

test("cancelled loads do not produce misleading source failures", async () => {
  const controller = new AbortController();
  const pending = run(async () => new Promise<Response>(() => {}), controller.signal);
  controller.abort();
  assert.deepEqual((await pending).issues, []);
});
