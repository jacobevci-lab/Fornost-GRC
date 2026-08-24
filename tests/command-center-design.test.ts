import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("command center is the default dashboard experience",async()=>{
 const [page,layout]=await Promise.all([
  readFile("app/page.tsx","utf8"),
  readFile("app/layout.tsx","utf8"),
 ]);
 assert.match(page,/className="command-dashboard"/);
 assert.match(page,/className="attention-list"/);
 assert.match(page,/className="posture-dial"/);
 assert.match(page,/useState<"light" \| "dark">\("dark"\)/);
 assert.match(layout,/data-theme="dark"/);
});

test("command center stylesheet covers both themes and responsive layouts",async()=>{
 const css=await readFile("app/command-center.css","utf8");
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(css,/\.command-hero/);
 assert.match(css,/\.command-grid/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
});
