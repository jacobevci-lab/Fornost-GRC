import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const css=readFileSync("app/fornost-tabler.css","utf8");
const packageJson=readFileSync("package.json","utf8");
test("tabler design system reshapes principal product surfaces",()=>{for(const selector of [".brand",".nav-group button.active",".shell>main>header",".cockpit-titlebar",".cockpit-panel",".workspace-launcher",".module-head",".register-toolbar",".table-wrap",".fornost-ai-launcher"]){assert.ok(css.includes(selector),selector);}});
test("enterprise controls use compact radii, density and responsive layouts",()=>{assert.match(css,/min-height:40px!important/);assert.match(css,/border-radius:4px!important/);assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:620px\)/);});
test("dark and light palettes expose readable semantic colors",()=>{for(const token of ["--ux-positive","--ux-warning","--ux-danger","--ux-text-2","--ux-text-3","--ux-border-strong"]){assert.ok(css.includes(token),token);}assert.match(css,/color-scheme:light/);assert.match(css,/color-scheme:dark/);});
test("tabler blue is the interaction color and legacy purple-orange branding is retired",()=>{assert.match(css,/--tb-primary:#206bc4/);assert.match(css,/--tb-primary:#6ea8e6/);assert.doesNotMatch(css,/#(?:6256d9|a79cff|d84b20|ff7849|ff9a76)/i);});
test("tabler workspace is Bootstrap-style without a Tailwind runtime",()=>{assert.doesNotMatch(packageJson,/@tailwindcss|"tailwindcss"/);assert.match(css,/Fornost Tabler Workspace/);});
