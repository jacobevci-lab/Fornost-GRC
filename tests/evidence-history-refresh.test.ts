import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelPath = "app/evidence-history-panel.tsx";

test("evidence history refresh invalidates the selected chain detail", async () => {
  const source = await readFile(panelPath, "utf8");
  assert.match(source, /const \[detailRevision,setDetailRevision\]=useState\(0\)/);
  assert.match(source, /setDetailRevision\(value=>value\+1\)/);
  assert.match(source, /\[selected,tr,detailRevision\]/);
});

test("version upload keeps a stable form reference across the async request", async () => {
  const source = await readFile(panelPath, "utf8");
  assert.match(source, /const formElement=event\.currentTarget/);
  assert.match(source, /new FormData\(formElement\)/);
  assert.match(source, /formElement\.reset\(\);await loadOverview\(\)/);
  assert.doesNotMatch(source, /event\.currentTarget\.reset\(\)/);
});

test("overview refresh reconciles a selection that no longer exists", async () => {
  const source = await readFile(panelPath, "utf8");
  assert.match(source, /body\.evidenceItems\.find\(item=>item\.id===selected\)/);
  assert.match(source, /setSelected\(""\);setVersionRefs\(""\);setDetail\(null\)/);
});
