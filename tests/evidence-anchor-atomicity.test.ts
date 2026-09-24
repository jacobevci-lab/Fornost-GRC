import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("initial evidence record is anchored in the same batch as version one", async () => {
  const source = await readFile("app/api/evidence/route.ts", "utf8");
  assert.match(source, /appendEvidenceVersion\([\s\S]*additionalStatements:\(commit\)=>/);
  assert.match(source, /anchoredData=\{\.\.\.data,versionNo:String\(commit\.versionNo\),versionChainSha256:commit\.chainSha256/);
  assert.match(source, /INSERT INTO simple_grc_records/);
  assert.doesNotMatch(source, /DELETE FROM evidence_versions/);
  assert.doesNotMatch(source, /UPDATE simple_grc_records SET data_json=/);
});

test("new evidence versions advance the Evidence Library head anchor inside the version batch", async () => {
  const source = await readFile("app/api/evidence/history/route.ts", "utf8");
  assert.match(source, /additionalStatements: \(commit\) =>/);
  assert.match(source, /versionNo: String\(commit\.versionNo\)/);
  assert.match(source, /versionChainSha256: commit\.chainSha256/);
  assert.match(source, /UPDATE simple_grc_records SET data_json=\?,updated_at=\?/);
  assert.doesNotMatch(source, /appendedVersionId/);
  assert.doesNotMatch(source, /DELETE FROM evidence_versions WHERE id=\?/);
});
