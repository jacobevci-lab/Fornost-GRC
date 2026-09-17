import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),theme=fs.readFileSync("app/fornost-horizon.css","utf8");

test("horizon is the final structural and palette authority",()=>{
  assert.ok(page.indexOf('import "./fornost-horizon.css"')>page.indexOf('import "./sidebar-collapse.css"'));
  assert.match(theme,/:root\{[\s\S]*--hz-bg:#f3f6fb/);
  assert.match(theme,/html\[data-theme="dark"\]\{[\s\S]*--hz-bg:#09111f/);
  assert.match(page,/useState<"light" \| "dark">\("light"\)/);
  assert.match(page,/fornost-grc-theme-v2/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".cockpit",".cockpit-titlebar",".posture-rail",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form",".auth-screen"]){assert.ok(theme.includes(selector),selector);}
});

test("genuine dark mode uses navy surfaces and accessible blue interaction",()=>{
  for(const token of ["--hz-surface:#101b2c","--hz-text:#edf3fc","--hz-primary:#60a5fa","--at-sidebar:#0c1626"])assert.match(theme,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:d84b20|ff7849|ff9a76)/i);
  assert.match(theme,/prefers-reduced-motion/);
});
