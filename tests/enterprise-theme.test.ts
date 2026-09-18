import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const css=readFileSync("app/workspace-system.css","utf8");
const packageJson=readFileSync("package.json","utf8");
test("workspace design system reshapes principal product surfaces",()=>{for(const selector of [".brand",".nav-group button.active",".shell>main>header",".dashboard-hero",".dashboard-panel",".dashboard-shortcuts",".module-head",".register-toolbar",".fornost-ai-launcher"]){assert.ok(css.includes(selector),selector);}});
test("enterprise controls use a structured responsive workspace",()=>{assert.match(css,/grid-template-columns:296px minmax\(0,1fr\)!important/);assert.match(css,/border-radius:18px!important/);assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:620px\)/);});
test("dark and light palettes expose readable semantic colors",()=>{for(const token of ["--ux-positive","--ux-warning","--ux-danger","--ux-text-2","--ux-text-3","--ux-border-strong"]){assert.ok(css.includes(token),token);}assert.match(css,/color-scheme:light/);assert.match(css,/color-scheme:dark/);});
test("petrol and teal replace the legacy purple-orange branding",()=>{assert.match(css,/--ws-brand:#0b6b68/);assert.match(css,/--ws-brand:#53c6bd/);assert.doesNotMatch(css,/#(?:6256d9|a79cff|d84b20|ff7849|ff9a76)/i);});
test("workspace system has no Tailwind runtime",()=>{assert.doesNotMatch(packageJson,/@tailwindcss|"tailwindcss"/);assert.match(css,/Fornost Workspace System/);});
