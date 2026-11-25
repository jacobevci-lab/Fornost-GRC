import assert from "node:assert/strict";
import test from "node:test";

test("renders production cockpit metadata and the light-first theme", async (t) => {
  // This Node-only test verifies SSR metadata, not Cloudflare's HTML parser.
  // Real nonce rewriting/hydration is exercised by security-browser-qa.mjs
  // against the built Worker runtime.
  const original = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = class {
    on() { return this; }
    transform(response) { return response; }
  };
  t.after(() => {
    if (original) globalThis.HTMLRewriter = original;
    else delete globalThis.HTMLRewriter;
  });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>Fornost GRC · Enterprise Risk &amp; AI Governance<\/title>/i);
  assert.match(html, /<html[^>]*data-theme=["']light["']/i);
  assert.doesNotMatch(html, /name=["']codex-preview["']/i);
});
