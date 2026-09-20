import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("connected GRC is wired into navigation, UI and documentation",async()=>{
  const [page,component,css,contract,readme,docs]=await Promise.all([
    readFile("app/page.tsx","utf8"),readFile("app/connected-grc.tsx","utf8"),
    readFile("app/connected-grc.css","utf8"),readFile("app/connected-grc-contract.css","utf8"),
    readFile("README.md","utf8"),
    readFile("docs/CONNECTED-GRC.md","utf8"),
  ]);
  assert.match(page,/"Bağlantılı GRC"/);
  assert.match(page,/ConnectedGrc rows=\{rows\}/);
  assert.match(component,/CONNECTED GRC · RELATIONSHIP INTELLIGENCE/);
  assert.match(component,/records\.length-linkedIds\.size/);
  assert.match(component,/assessConnectedGrcCoverage/);
  assert.match(component,/connected-assurance/);
  assert.match(component,/fornost-connected-grc\.csv/);
  assert.match(component,/\/\^\[=\+\\-@\]\//);
  assert.match(css,/\.connected-layout/);
  assert.match(contract,/\.connected-gap-list/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(readme,/Connected GRC Relationship Intelligence/);
  assert.match(docs,/deterministik bağlantı/);
});
