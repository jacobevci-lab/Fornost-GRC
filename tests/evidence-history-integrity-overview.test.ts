import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("evidence history overview exposes integrity per record without claiming partial scans are verified", async () => {
  const source = await readFile("app/api/evidence/history/route.ts", "utf8");

  assert.match(source, /rows\.length !== item\.currentVersion/);
  assert.match(source, /state: "unavailable"/);
  assert.match(source, /integrity: integrity\.state/);
  assert.match(source, /checkedVersions: integrity\.checked/);
  assert.match(source, /failedVersion: integrity\.failedVersion/);
  assert.match(source, /integrityScanComplete/);
  assert.match(source, /ORDER BY created_at DESC,version_no DESC LIMIT 100/);
});
