import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("structural executive workspace is the default dashboard experience",async()=>{
 const [page,layout]=await Promise.all([
  readFile("app/page.tsx","utf8"),
  readFile("app/layout.tsx","utf8"),
 ]);
 assert.match(page,/className="workspace-dashboard"/);
 assert.match(page,/className="dashboard-hero"/);
 assert.match(page,/className="dashboard-metrics"/);
 assert.match(page,/className="attention-queue"/);
 assert.match(page,/className="dashboard-shortcuts"/);
 assert.match(page,/useState<"light" \| "dark">\("light"\)/);
 assert.match(layout,/data-theme="light"/);
});

test("workspace stylesheet covers both themes and responsive layouts",async()=>{
 const css=await readFile("app/workspace-system.css","utf8");
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(css,/\.dashboard-intelligence/);
 assert.match(css,/\.dashboard-hero/);
 assert.match(css,/\.attention-queue/);
 assert.match(css,/\.dashboard-shortcuts/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
});
