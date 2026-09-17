import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const css=readFileSync("app/fornost-horizon.css","utf8");
test("horizon design system covers every principal product surface",()=>{for(const selector of [".brand",".nav-group button.active",".shell>main>header",".cockpit-panel",".workspace-launcher",".module-head",".register-toolbar",".table-wrap",".settings-card-head",".ea-tabs",".auth-card",".fornost-ai-launcher",".finding-hero"]){assert.ok(css.includes(selector),selector);}});
test("enterprise controls use balanced radii, density and visible focus",()=>{assert.match(css,/min-height:42px!important/);assert.match(css,/box-shadow:0 0 0 3px color-mix/);assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:620px\)/);});
test("dark and light palettes expose readable semantic colors",()=>{for(const token of ["--ux-positive","--ux-warning","--ux-danger","--ux-text-2","--ux-text-3","--ux-border-strong"]){assert.ok(css.includes(token),token);}assert.match(css,/color-scheme:light/);assert.match(css,/color-scheme:dark/);});
test("blue is the interaction color and orange is retired",()=>{assert.match(css,/--hz-primary:#2563eb/);assert.match(css,/--hz-primary:#60a5fa/);assert.doesNotMatch(css,/#(?:d84b20|ff7849|ff9a76)/i);});
