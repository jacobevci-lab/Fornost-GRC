import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),theme=fs.readFileSync("app/workspace-system.css","utf8");

test("workspace system is the only shell and palette authority",()=>{
  assert.match(page,/import "\.\/workspace-system\.css"/);
  for(const legacy of ["theme-system.css","midnight-graphite.css","fornost-enterprise-2026.css","fornost-atelier.css","fornost-horizon.css","sidebar-collapse.css"]){assert.doesNotMatch(page,new RegExp(`import "\\./${legacy}"`));}
  assert.doesNotMatch(page,/import "\.\/fornost-(?:atlas|tabler)\.css"/);
  assert.match(theme,/:root\{[\s\S]*--ws-bg:#eef1f3/);
  assert.match(theme,/html\[data-theme="dark"\]\{[\s\S]*--ws-bg:#0f1516/);
  assert.match(page,/useState<"light" \| "dark">\("light"\)/);
  assert.match(page,/fornost-grc-theme-v5/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".workspace-dashboard",".dashboard-hero",".dashboard-metrics",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card"]){assert.ok(theme.includes(selector),selector);}
});

test("genuine dark mode uses graphite surfaces and accessible teal interaction",()=>{
  for(const token of ["--ws-surface:#172021","--ws-ink:#edf4f3","--ws-brand:#53c6bd"])assert.match(theme,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:d84b20|ff7849|ff9a76)/i);
  assert.match(theme,/prefers-reduced-motion/);
});
