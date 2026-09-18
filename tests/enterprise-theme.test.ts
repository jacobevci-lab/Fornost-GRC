import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const css=readFileSync("app/fornost-aegis.css","utf8");
const packageJson=readFileSync("package.json","utf8");
test("aegis design system reshapes principal product surfaces",()=>{for(const selector of [".brand",".nav-group button.active",".shell>main>header",".cockpit-titlebar",".cockpit-panel",".workspace-launcher",".module-head",".register-toolbar",".table-wrap",".fornost-ai-launcher"]){assert.ok(css.includes(selector),selector);}});
test("enterprise controls use balanced radii, density and responsive layouts",()=>{assert.match(css,/min-height:44px!important/);assert.match(css,/border-radius:16px!important/);assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:620px\)/);});
test("dark and light palettes expose readable semantic colors",()=>{for(const token of ["--ux-positive","--ux-warning","--ux-danger","--ux-text-2","--ux-text-3","--ux-border-strong"]){assert.ok(css.includes(token),token);}assert.match(css,/color-scheme:light/);assert.match(css,/color-scheme:dark/);});
test("teal is the interaction color and legacy purple-orange branding is retired",()=>{assert.match(css,/--ag-brand:#087f72/);assert.match(css,/--ag-brand:#55d2bd/);assert.doesNotMatch(css,/#(?:6256d9|a79cff|d84b20|ff7849|ff9a76)/i);});
test("aegis is application-owned CSS without a Tailwind runtime",()=>{assert.doesNotMatch(packageJson,/@tailwindcss|"tailwindcss"/);assert.match(css,/Fornost Aegis/);});
