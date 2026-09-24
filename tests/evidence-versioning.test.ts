import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  computeEvidenceChainHash,
  splitEvidenceControlRefs,
  validateEvidenceFile,
  verifyEvidenceVersionChain,
  type EvidenceChainInput,
  type EvidenceVersionRow,
} from "../app/evidence/versioning";

const base: EvidenceChainInput = {
  evidenceId: "EVD-123",
  versionNo: 1,
  fileKey: "evidence/EVD-123/v1-access-review.pdf",
  fileName: "access-review.pdf",
  fileType: "application/pdf",
  fileSize: 1234,
  contentSha256: "a".repeat(64),
  previousVersionId: null,
  previousChainSha256: null,
  evidenceTitle: "Quarterly access review",
  owner: "iam@example.com",
  period: "2026 Q3",
  frameworks: "ISO 27001, SOC 2",
  controlRefs: "A.5.15, CC6.1",
  changeNote: "Initial evidence upload",
  createdBy: "maker@example.com",
  createdAt: "2026-09-24T12:00:00.000Z",
};

function row(input: EvidenceChainInput, id: string, chainSha256: string): EvidenceVersionRow {
  return {
    id,
    evidence_id: input.evidenceId,
    version_no: input.versionNo,
    file_key: input.fileKey,
    file_name: input.fileName,
    file_type: input.fileType,
    file_size: input.fileSize,
    content_sha256: input.contentSha256,
    chain_sha256: chainSha256,
    previous_version_id: input.previousVersionId || null,
    previous_chain_sha256: input.previousChainSha256 || null,
    evidence_title: input.evidenceTitle,
    owner: input.owner,
    period: input.period,
    frameworks: input.frameworks,
    control_refs: input.controlRefs,
    change_note: input.changeNote,
    created_by: input.createdBy,
    created_at: input.createdAt,
  };
}

test("control references are normalized for duplicate-safe evidence mapping", () => {
  assert.deepEqual(splitEvidenceControlRefs(" A.5.15; CC6.1 | a.5.15\nPCI 8.4.2 "), ["A.5.15", "CC6.1", "PCI 8.4.2"]);
});

test("evidence file signatures are verified rather than trusting MIME only", () => {
  assert.equal(validateEvidenceFile(new TextEncoder().encode("%PDF-1.7 sample"), "application/pdf"), true);
  assert.equal(validateEvidenceFile(new TextEncoder().encode("not a pdf"), "application/pdf"), false);
  assert.equal(validateEvidenceFile(new Uint8Array([137,80,78,71,13,10,26,10,0]), "image/png"), true);
  assert.equal(validateEvidenceFile(new Uint8Array([255,216,255,1]), "image/jpeg"), true);
});

test("chain hash is deterministic and changes with previous lineage", async () => {
  const first = await computeEvidenceChainHash(base);
  const repeated = await computeEvidenceChainHash({ ...base });
  const changed = await computeEvidenceChainHash({ ...base, previousChainSha256: "b".repeat(64) });
  assert.equal(first, repeated);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, changed);
});

test("version chain verifies valid lineage and detects metadata tampering", async () => {
  const firstHash = await computeEvidenceChainHash(base);
  const second: EvidenceChainInput = {
    ...base,
    versionNo: 2,
    fileKey: "evidence/EVD-123/history/v2.pdf",
    fileName: "v2.pdf",
    fileSize: 2222,
    contentSha256: "c".repeat(64),
    previousVersionId: "EVV-1",
    previousChainSha256: firstHash,
    changeNote: "Added independent reviewer sign-off",
    createdAt: "2026-09-24T13:00:00.000Z",
  };
  const secondHash = await computeEvidenceChainHash(second);
  const valid = [row(base, "EVV-1", firstHash), row(second, "EVV-2", secondHash)];
  assert.deepEqual(await verifyEvidenceVersionChain(valid), { state: "verified", checked: 2, failedVersion: 0 });

  const tampered = valid.map((item) => ({ ...item }));
  tampered[1].change_note = "silently changed note";
  assert.deepEqual(await verifyEvidenceVersionChain(tampered), { state: "broken", checked: 2, failedVersion: 2 });
});

test("empty chain is explicitly legacy-unverified", async () => {
  assert.deepEqual(await verifyEvidenceVersionChain([]), { state: "legacy-unverified", checked: 0, failedVersion: 0 });
});

test("version row, control mappings and caller anchor statements share one D1 batch", async () => {
  const source = await readFile("app/evidence/versioning.ts", "utf8");
  assert.match(source, /const versionStatement = db\.prepare/);
  assert.match(source, /const controlStatements = refs\.map/);
  assert.match(source, /const additionalStatements = options\.additionalStatements\?\.\(commit\) \|\| \[\]/);
  assert.match(source, /await db\.batch\(\[versionStatement, \.\.\.controlStatements, \.\.\.additionalStatements\]\)/);
  assert.doesNotMatch(source, /VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)`\)\.bind\([\s\S]*?\)\.run\(\)/);
});
