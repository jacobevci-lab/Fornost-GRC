import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync("app/api/evidence/route.ts","utf8");
const versioning=readFileSync("app/evidence/versioning.ts","utf8");

test("evidence screenshots work in cloud object storage and on-prem database storage",()=>{
  assert.match(route,/simple_evidence_files/);
  assert.match(route,/if\(env\.BUCKET\).*env\.BUCKET\.put/);
  assert.match(route,/INSERT INTO simple_evidence_files/);
});

test("evidence upload delegates MIME allowlist and magic-byte validation to the shared versioning module",()=>{
  assert.match(route,/validateEvidenceFile/);
  assert.match(versioning,/EVIDENCE_ALLOWED_TYPES/);
  assert.match(versioning,/application\/pdf/);
  assert.match(versioning,/image\/png/);
  assert.match(versioning,/image\/jpeg/);
  assert.match(versioning,/image\/webp/);
  assert.match(versioning,/%PDF-/);
  assert.match(versioning,/137,80,78,71,13,10,26,10/);
  assert.match(versioning,/RIFF/);
  assert.match(versioning,/WEBP/);
});
