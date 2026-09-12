import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),theme=fs.readFileSync("app/fornost-enterprise-2026.css","utf8");

test("enterprise 2026 is the final visual authority for light and dark modes",()=>{
  assert.ok(page.indexOf('import "./fornost-enterprise-2026.css"')>page.indexOf('import "./midnight-graphite.css"'));
  assert.match(theme,/:root\{[\s\S]*--ux-bg:#f3f3f1/);
  assert.match(theme,/html\[data-theme="dark"\]\{[\s\S]*--ux-bg:#0d0e0f/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".cockpit",".posture-rail",".command-hero",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form",".auth-screen"]){assert.ok(theme.includes(selector),selector);}
});

test("new palette is neutral carbon with a restrained champagne interaction color",()=>{
  for(const token of ["--ux-canvas:#151617","--ux-text:#f0efeb","--ux-accent:#c5a15a","--ux-sidebar:#101112"])assert.match(theme,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:2bb8a6|43c69a|635bff|8176ff|4f7dff|165dff)/i);
  assert.match(theme,/prefers-reduced-motion/);
});
