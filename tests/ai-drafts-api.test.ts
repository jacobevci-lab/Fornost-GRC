import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const route = fs.readFileSync("app/api/ai/drafts/route.ts", "utf8");
const storage = fs.readFileSync("app/ai/storage.ts", "utf8");
const ui = fs.readFileSync("app/fornost-ai-copilot.tsx", "utf8");

test("AI draft creation is typed, rate limited and never writes live GRC records", () => {
  assert.match(route, /isAiDraftKind/);
  assert.match(route, /DRAFTS_PER_MINUTE/);
  assert.match(route, /parseAiDraftResponse/);
  assert.doesNotMatch(route, /INSERT INTO simple_grc_records/);
  assert.doesNotMatch(route, /UPDATE simple_grc_records/);
});

test("AI draft review is Admin-only, single-decision and audited", () => {
  const patchSection = route.slice(route.indexOf("export async function PATCH"));
  assert.match(patchSection, /requireRole\(req, \["Admin"\]\)/);
  assert.match(patchSection, /WHERE id=\? AND status='pending'/);
  assert.match(patchSection, /mutation\.meta\.changes/);
  assert.match(patchSection, /no live GRC record was mutated/);
});

test("AI draft schema self-heals on on-prem upgrades and UI exposes review queue", () => {
  assert.match(storage, /CREATE TABLE IF NOT EXISTS ai_action_drafts/);
  assert.match(ui, /AI Taslağı Oluştur/);
  assert.match(ui, /Taslağı Onayla/);
  assert.match(ui, /canlı GRC kaydı değiştirilmedi/);
});
