import assert from "node:assert/strict";
import test from "node:test";
import { connectedSourceValidity } from "../app/connected-grc-sources";
import { loadConnectedGrcSources } from "../app/connected-grc-loader";

const empty = { findings: [], incidents: [], plans: [], exercises: [], gaps: [], documents: [], versions: [], appetites: [], measurements: [], breaches: [], scenarios: [], sources: [], changes: [], impacts: [], vendors: [], assessments: [], rules: [], runs: [] };
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
    return json(empty);
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
    : json(empty));
  finish({ documents: [{ id: "late" }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.ready, 7);
  assert.equal(result.payloads.policy, undefined);
});

test("HTTP and malformed responses remain partial; a new attempt can recover", async () => {
  const failed = await run(async url => String(url).endsWith("/findings") ? new Response("denied", { status: 403 }) : json([]));
  assert.equal(failed.ready, 0);
  assert.deepEqual(failed.payloads, {});
  const recovered = await run(async () => json(empty));
  assert.equal(recovered.ready, 8);
});

test("cancellation settles even if fetch ignores abort, and starts no work when already cancelled", async () => {
  const controller = new AbortController();
  const pending = run(async () => new Promise<Response>(() => {}), controller.signal);
  controller.abort();
  assert.deepEqual((await pending).payloads, {});
  let calls = 0;
  await run(async () => { calls++; return json(empty); }, controller.signal);
  assert.equal(calls, 0);
});

test("AI requests are opt-in and incomplete AI sources cannot claim readiness", async () => {
  const paths: string[] = [];
  const fetcher: typeof fetch = async url => { paths.push(String(url)); return json(String(url).includes("/ai/") ? {} : empty); };
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
    return json(empty);
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


test("malformed successful payloads cannot masquerade as empty, ready sources", async () => {
  for (const malformed of [{}, { ...empty, findings: null }, { ...empty, findings: [{}] }, { ...empty, findings: [{ id: "same" }, { id: " same " }] }]) {
    const result = await run(async url => json(String(url).endsWith("/findings") ? malformed : empty));
    assert.equal(result.ready, 7);
    assert.equal(result.payloads.findings, undefined);
    assert.deepEqual(result.issues, [{ key: "findings", reason: "invalid" }]);
  }
});

test("capped valid data remains visible but never reports full graph coverage", async () => {
  const findings = Array.from({ length: 3000 }, (_, i) => ({ id: `finding-${i}` }));
  const result = await run(async url => json(String(url).endsWith("/findings") ? { findings } : empty));
  assert.equal(result.ready, 7);
  assert.equal((result.payloads.findings?.findings as unknown[]).length, 3000);
  assert.deepEqual(result.issues, [{ key: "findings", reason: "incomplete" }]);
  const recovered = await run(async () => json(empty));
  assert.equal(recovered.ready, 8);
  assert.deepEqual(recovered.issues, []);
});


test("every enterprise graph collection rejects missing or duplicate identities", () => {
  const groups = {
    findings: ["findings"], incidents: ["incidents"], continuity: ["plans", "exercises", "gaps"],
    policy: ["documents", "versions"], riskAppetite: ["appetites", "measurements", "breaches", "scenarios"],
    regulatory: ["sources", "changes", "impacts"], thirdParty: ["vendors", "assessments", "findings"],
    evidenceAutomation: ["sources", "rules", "runs", "findings"],
  } as const;
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) {
    assert.equal(connectedSourceValidity(key, empty), "ready", key);
    for (const collection of groups[key]) {
      assert.equal(connectedSourceValidity(key, { ...empty, [collection]: undefined }), "invalid", `${key}.${collection}`);
      const idKey = key === "thirdParty" && collection === "vendors" ? "vendorId" : "id";
      assert.equal(connectedSourceValidity(key, { ...empty, [collection]: [{ [idKey]: "Ａ" }, { [idKey]: "A" }] }), "invalid");
      assert.equal(connectedSourceValidity(key, { ...empty, [collection]: [{ [idKey]: "one" }, { [idKey]: "two" }] }), "ready");
    }
  }
});

test("automation history and child collection limits suppress complete coverage", () => {
  for (const [key, collection, limit] of [["evidenceAutomation", "runs", 100], ["evidenceAutomation", "findings", 100], ["policy", "versions", 3000], ["thirdParty", "vendors", 1000]] as const) {
    const rows = Array.from({ length: limit }, (_, id) => ({ id: String(id), vendorId: String(id) }));
    assert.equal(connectedSourceValidity(key, { ...empty, [collection]: rows.slice(1) }), "ready");
    assert.equal(connectedSourceValidity(key, { ...empty, [collection]: rows }), "incomplete");
  }
});
