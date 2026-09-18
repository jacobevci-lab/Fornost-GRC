import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),tabler=fs.readFileSync("app/fornost-tabler.css","utf8"),theme=`${fs.readFileSync("app/fornost-atlas.css","utf8")}\n${tabler}`;

test("tabler workspace is the final structural and palette authority",()=>{
  assert.match(page,/import "\.\/fornost-tabler\.css"/);
  for(const legacy of ["theme-system.css","midnight-graphite.css","fornost-enterprise-2026.css","fornost-atelier.css","fornost-horizon.css","sidebar-collapse.css"]){assert.doesNotMatch(page,new RegExp(`import "\\./${legacy}"`));}
  assert.match(tabler,/:root\{[\s\S]*--tb-bg:#f4f6fa/);
  assert.match(tabler,/html\[data-theme="dark"\]\{[\s\S]*--tb-bg:#111827/);
  assert.match(page,/useState<"light" \| "dark">\("light"\)/);
  assert.match(page,/fornost-grc-theme-v5/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".cockpit",".cockpit-titlebar",".posture-rail",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form",".auth-screen"]){assert.ok(theme.includes(selector),selector);}
});

test("genuine dark mode uses slate surfaces and accessible blue interaction",()=>{
  for(const token of ["--tb-card:#182433","--tb-text:#f1f5f9","--tb-primary:#6ea8e6"])assert.match(tabler,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:d84b20|ff7849|ff9a76)/i);
  assert.match(tabler,/prefers-reduced-motion/);
});
