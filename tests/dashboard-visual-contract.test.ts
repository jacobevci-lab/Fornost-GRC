import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assurancePanel = readFileSync(new URL("../app/executive-assurance-panel.tsx", import.meta.url), "utf8");
const qualityGuardrails = readFileSync(new URL("../app/quality-guardrails.css", import.meta.url), "utf8");

test("executive assurance score renders as one baseline-safe value", () => {
  assert.match(assurancePanel, /\{assurance\.score\}\/100/);
  assert.doesNotMatch(assurancePanel, /<sup>\s*\/100\s*<\/sup>/);
});

test("dashboard workspace shortcut strip is retired from the visible UI", () => {
  assert.match(
    qualityGuardrails,
    /\.dashboard-shortcuts\s*\{[^}]*display:\s*none\s*!important\s*;/s,
  );
});
