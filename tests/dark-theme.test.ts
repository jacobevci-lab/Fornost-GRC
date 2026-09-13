import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),theme=fs.readFileSync("app/fornost-atelier.css","utf8");

test("atelier is the final structural and palette authority",()=>{
  assert.ok(page.indexOf('import "./fornost-atelier.css"')>page.indexOf('import "./fornost-enterprise-2026.css"'));
  assert.match(theme,/:root\{[\s\S]*--at-bg:#f5f5f3/);
  assert.match(theme,/html\[data-theme="dark"\]\{[\s\S]*--at-bg:#0b0c0d/);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".cockpit",".cockpit-titlebar",".posture-rail",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form",".auth-screen"]){assert.ok(theme.includes(selector),selector);}
});

test("new palette is graphite with a single signal-orange interaction color",()=>{
  for(const token of ["--at-surface:#121315","--at-ink:#f2f2ef","--at-accent:#ff7849","--at-sidebar:#101112"])assert.match(theme,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:2bb8a6|43c69a|635bff|8176ff|4f7dff|165dff|c5a15a)/i);
  assert.match(theme,/prefers-reduced-motion/);
});
