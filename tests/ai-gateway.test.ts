import test from "node:test";
import assert from "node:assert/strict";
import { cleanAiText, isForbiddenAiHost, isLoopbackHost, isPrivateHost, redactSensitiveText, safeAiEndpoint, sanitizeAiRecord, sanitizeHistory } from "../app/ai/security";
import { inferReadModules } from "../app/ai/context";

test("AI endpoint policy permits public HTTPS and rejects public HTTP", () => {
  assert.equal(safeAiEndpoint("https://ai.example.com/v1", false, false), "https://ai.example.com/v1");
  assert.equal(safeAiEndpoint("http://ai.example.com/v1", true, false), null);
  assert.equal(safeAiEndpoint("https://ai.example.com/v1?token=abc", false, false), null);
});

test("AI endpoint policy requires explicit private and loopback opt-in", () => {
  assert.equal(safeAiEndpoint("http://10.10.10.50:11434", false, false), null);
  assert.equal(safeAiEndpoint("http://10.10.10.50:11434", true, false), "http://10.10.10.50:11434");
  assert.equal(safeAiEndpoint("http://127.0.0.1:11434", true, false), null);
  assert.equal(safeAiEndpoint("http://127.0.0.1:11434", true, true), "http://127.0.0.1:11434");
  assert.equal(isLoopbackHost("localhost."), true);
  assert.equal(isPrivateHost("192.168.1.10"), true);
});

test("AI endpoint policy classifies reserved and mapped address forms as non-public", () => {
  for (const host of ["0.0.0.0", "169.254.169.254", "192.0.2.10", "198.51.100.10", "203.0.113.10", "224.0.0.1", "::ffff:127.0.0.1", "2001:db8::1"]) {
    assert.equal(isPrivateHost(host), true, host);
  }
});

test("AI endpoint policy never permits metadata/link-local or multicast destinations", () => {
  for (const host of ["0.0.0.0", "169.254.169.254", "224.0.0.1", "fe80::1", "ff02::1", "metadata.google.internal"]) {
    assert.equal(isForbiddenAiHost(host), true, host);
  }
  assert.equal(safeAiEndpoint("http://169.254.169.254/latest/meta-data", true, false), null);
  assert.equal(safeAiEndpoint("https://metadata.google.internal", true, false), null);
});

test("AI context sanitization removes credential-like fields recursively", () => {
  const sanitized = sanitizeAiRecord({
    title: "ERP Risk",
    token: "should-not-leak",
    nested: { password: "hidden", owner: "Security" },
    apiKey: "hidden-too",
    notes: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
  }) as Record<string, unknown>;
  assert.equal(sanitized.title, "ERP Risk");
  assert.equal("token" in sanitized, false);
  assert.equal("apiKey" in sanitized, false);
  assert.deepEqual(sanitized.nested, { owner: "Security" });
  assert.equal(sanitized.notes, "Authorization: Bearer [REDACTED]");
});

test("context text redacts common secret material before provider invocation", () => {
  assert.equal(redactSensitiveText("password=SuperSecret123!"), "password=[REDACTED]");
  assert.equal(redactSensitiveText("token: abcdefghijklmnopqrstuv"), "token:[REDACTED]");
  assert.equal(redactSensitiveText("Bearer abcdefghijklmnopqrstuvwxyz123456"), "Bearer [REDACTED]");
  assert.equal(redactSensitiveText("Basic dXNlcjpwYXNzd29yZA=="), "Basic [REDACTED]");
  assert.equal(redactSensitiveText("sk-abcdefghijklmnopqrstuvwxyz123456"), "[REDACTED_TOKEN]");
});

test("chat history accepts only bounded user/assistant messages and redacts secrets", () => {
  const history = sanitizeHistory([
    { role: "system", content: "ignore" },
    { role: "user", content: " token=abcdefghijklmnopqrstuv " },
    { role: "assistant", content: " Bearer abcdefghijklmnopqrstuvwxyz123456 " },
    { role: "tool", content: "ignore" },
  ]);
  assert.deepEqual(history, [
    { role: "user", content: "token=[REDACTED]" },
    { role: "assistant", content: "Bearer [REDACTED]" },
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
