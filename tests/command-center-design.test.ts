import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("enterprise cockpit is the default dashboard experience",async()=>{
 const [page,layout]=await Promise.all([
  readFile("app/page.tsx","utf8"),
  readFile("app/layout.tsx","utf8"),
 ]);
 assert.match(page,/className="cockpit"/);
 assert.match(page,/className="posture-rail"/);
 assert.match(page,/className="attention-queue"/);
 assert.match(page,/className="workspace-launcher"/);
 assert.match(page,/useState<"light" \| "dark">\("dark"\)/);
 assert.match(layout,/data-theme="dark"/);
});

test("enterprise cockpit stylesheet covers both themes and responsive layouts",async()=>{
 const css=await readFile("app/cockpit.css","utf8");
 assert.match(css,/html\[data-theme="dark"\]/);
 assert.match(css,/\.cockpit-grid/);
 assert.match(css,/\.posture-rail/);
 assert.match(css,/\.attention-queue/);
 assert.match(css,/\.workspace-launcher/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
});
