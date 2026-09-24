import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evidenceIntegrityForRule } from "../app/continuous-assurance-store";

test("rule integrity deduplicates linked evidence and fails closed on any broken chain", () => {
  const links = new Map<string, ReadonlySet<string>>([
    ["a.5.15", new Set(["EVD-1", "EVD-2"])],
    ["cc6.1", new Set(["EVD-1"])],
  ]);
  const states = new Map([
    ["EVD-1", "verified" as const],
    ["EVD-2", "broken" as const],
  ]);
  assert.deepEqual(evidenceIntegrityForRule("A.5.15; CC6.1", links, states), {
    evidenceIntegrity: "broken",
    linkedEvidenceCount: 2,
  });
});

test("rule integrity distinguishes verified, legacy and unlinked evidence", () => {
  const links = new Map<string, ReadonlySet<string>>([
    ["a.5.15", new Set(["EVD-1"])],
    ["a.5.17", new Set(["EVD-2"])],
  ]);
  assert.deepEqual(evidenceIntegrityForRule("A.5.15", links, new Map([["EVD-1", "verified" as const]])), {
    evidenceIntegrity: "verified",
    linkedEvidenceCount: 1,
  });
  assert.deepEqual(evidenceIntegrityForRule("A.5.17", links, new Map([["EVD-2", "legacy-unverified" as const]])), {
    evidenceIntegrity: "legacy-unverified",
    linkedEvidenceCount: 1,
  });
  assert.deepEqual(evidenceIntegrityForRule("A.8.13", links, new Map()), { linkedEvidenceCount: 0 });
});

test("Continuous Assurance and Ask Fornost expose evidence integrity without loading file content", async () => {
  const [store, context] = await Promise.all([
    readFile("app/continuous-assurance-store.ts", "utf8"),
    readFile("app/ai/operational-assurance-context.ts", "utf8"),
  ]);
  assert.match(store, /verifyEvidenceVersionChainWithAnchor/);
  assert.match(store, /evidenceIntegrityComplete/);
  assert.match(store, /MAX_EVIDENCE_VERSION_ROWS/);
  assert.doesNotMatch(store, /simple_evidence_files/);
  assert.match(context, /evidenceIntegrityFailures/);
  assert.match(context, /evidenceIntegrity: compact\(item\.evidenceIntegrity/);
  assert.match(context, /linkedEvidenceCount/);
});
