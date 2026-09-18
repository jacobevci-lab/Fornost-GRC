import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),aegis=fs.readFileSync("app/fornost-aegis.css","utf8"),theme=`${fs.readFileSync("app/fornost-atlas.css","utf8")}\n${aegis}`;

test("aegis is the final structural and palette authority",()=>{
  assert.match(page,/import "\.\/fornost-aegis\.css"/);
  for(const legacy of ["theme-system.css","midnight-graphite.css","fornost-enterprise-2026.css","fornost-atelier.css","fornost-horizon.css","sidebar-collapse.css"]){assert.doesNotMatch(page,new RegExp(`import "\\./${legacy}"`));}
  assert.match(aegis,/:root\{[\s\S]*--ag-canvas:#f1f4f3/);
  assert.match(aegis,/html\[data-theme="dark"\]\{[\s\S]*--ag-canvas:#091419/);
  assert.match(page,/useState<"light" \| "dark">\("light"\)/);
  assert.match(page,/fornost-grc-theme-v5/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".cockpit",".cockpit-titlebar",".posture-rail",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form",".auth-screen"]){assert.ok(theme.includes(selector),selector);}
});

test("genuine dark mode uses slate surfaces and accessible teal interaction",()=>{
  for(const token of ["--ag-panel:#102027","--ag-ink:#edf7f4","--ag-brand:#55d2bd","--ag-navy:#061016"])assert.match(aegis,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:d84b20|ff7849|ff9a76)/i);
  assert.match(aegis,/prefers-reduced-motion/);
});
