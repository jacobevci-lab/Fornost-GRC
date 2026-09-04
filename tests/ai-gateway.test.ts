import test from "node:test";
import assert from "node:assert/strict";
import { cleanAiText, isLoopbackHost, isPrivateHost, safeAiEndpoint, sanitizeAiRecord, sanitizeHistory } from "../app/ai/security";
import { inferReadModules } from "../app/ai/context";

test("AI endpoint policy permits public HTTPS and rejects public HTTP", () => {
  assert.equal(safeAiEndpoint("https://ai.example.com/v1", false, false), "https://ai.example.com/v1");
  assert.equal(safeAiEndpoint("http://ai.example.com/v1", true, false), null);
});

test("AI endpoint policy requires explicit private and loopback opt-in", () => {
  assert.equal(safeAiEndpoint("http://10.10.10.50:11434", false, false), null);
  assert.equal(safeAiEndpoint("http://10.10.10.50:11434", true, false), "http://10.10.10.50:11434");
  assert.equal(safeAiEndpoint("http://127.0.0.1:11434", true, false), null);
  assert.equal(safeAiEndpoint("http://127.0.0.1:11434", true, true), "http://127.0.0.1:11434");
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isPrivateHost("192.168.1.10"), true);
});

test("AI context sanitization removes credential-like fields recursively", () => {
  const sanitized = sanitizeAiRecord({
    title: "ERP Risk",
    token: "should-not-leak",
    nested: { password: "hidden", owner: "Security" },
    apiKey: "hidden-too",
  }) as Record<string, unknown>;
  assert.equal(sanitized.title, "ERP Risk");
  assert.equal("token" in sanitized, false);
  assert.equal("apiKey" in sanitized, false);
  assert.deepEqual(sanitized.nested, { owner: "Security" });
});

test("chat history accepts only bounded user/assistant messages", () => {
  const history = sanitizeHistory([
    { role: "system", content: "ignore" },
    { role: "user", content: " hello " },
    { role: "assistant", content: " world " },
    { role: "tool", content: "ignore" },
  ]);
  assert.deepEqual(history, [
    { role: "user", content: "hello" },
    { role: "assistant", content: "world" },
  ]);
});

test("GRC read scope is inferred deterministically from Turkish and English questions", () => {
  assert.deepEqual(inferReadModules("Kritik varlıklardaki açık riskleri analiz et").sort(), ["Risk Assessment", "Varlık Envanteri"].sort());
  assert.ok(inferReadModules("ISO 27001 audit evidence gaps").includes("Uyum"));
  assert.ok(inferReadModules("ISO 27001 audit evidence gaps").includes("Denetim Yönetimi"));
  assert.ok(inferReadModules("ISO 27001 audit evidence gaps").includes("Kanıtlar"));
});

test("AI text cleanup strips null bytes and enforces bounds", () => {
  assert.equal(cleanAiText("  a\u0000b  ", 20), "ab");
  assert.equal(cleanAiText("abcdef", 3), "abc");
});
