import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),theme=fs.readFileSync("app/fornost-atlas.css","utf8");

test("atlas is the single structural and palette authority",()=>{
  assert.match(page,/import "\.\/fornost-atlas\.css"/);
  for(const legacy of ["theme-system.css","midnight-graphite.css","fornost-enterprise-2026.css","fornost-atelier.css","fornost-horizon.css","sidebar-collapse.css"]){assert.doesNotMatch(page,new RegExp(`import "\\./${legacy}"`));}
  assert.match(theme,/:root\{[\s\S]*--atlas-bg:#f5f7fa/);
  assert.match(theme,/html\[data-theme="dark"\]\{[\s\S]*--atlas-bg:#0b111a/);
  assert.match(page,/useState<"light" \| "dark">\("light"\)/);
  assert.match(page,/fornost-grc-theme-v3/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".cockpit",".cockpit-titlebar",".posture-rail",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form",".auth-screen"]){assert.ok(theme.includes(selector),selector);}
});

test("genuine dark mode uses navy surfaces and accessible blue interaction",()=>{
  for(const token of ["--atlas-surface:#121b28","--atlas-text:#edf2f8","--atlas-brand:#6ca8ff","--atlas-sidebar:#080e17"])assert.match(theme,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:d84b20|ff7849|ff9a76)/i);
  assert.match(theme,/prefers-reduced-motion/);
});
