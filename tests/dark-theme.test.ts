import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),theme=fs.readFileSync("app/midnight-graphite.css","utf8");

test("midnight graphite is the final theme layer and is scoped to dark mode",()=>{
  assert.ok(page.indexOf('import "./midnight-graphite.css"')>page.indexOf('import "./final-polish.css"'));
  assert.match(theme,/html\[data-theme="dark"\]\{[\s\S]*--cp-bg:#0a0f14/);
  assert.doesNotMatch(theme,/(^|\})\s*(body|\.shell|\.table-card)\s*\{/m);
});

test("dark theme covers the complete operational surface hierarchy",()=>{
  for(const selector of [".shell>aside",".shell>main>header",".command-hero",".table-card","tbody tr:hover",".modal",".evidence-preview",".integration-card",".ea-hero",".fornost-ai-panel",".fornost-ai-draft-form",".fornost-ai-knowledge-form"]){assert.ok(theme.includes(selector),selector);}
});

test("new dark palette uses restrained graphite and teal rather than legacy violet",()=>{
  for(const token of ["--cc-bg:#0a0f14","--cc-surface:#111820","--cc-violet:#2bb8a6","--cc-ink:#edf4f5"])assert.match(theme,new RegExp(token));
  assert.doesNotMatch(theme,/#(?:8176ff|8b83ff|6f63f6|635bff)/i);
  assert.match(theme,/prefers-contrast:more/);
});
