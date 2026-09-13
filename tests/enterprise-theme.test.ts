import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const css=readFileSync("app/fornost-atelier.css","utf8");
test("enterprise design system covers every principal product surface",()=>{for(const selector of [".brand",".nav-group button.active",".header-actions",".cockpit-panel",".workspace-launcher",".module-head",".register-toolbar",".table-wrap",".row-actions",".settings-card-head",".report-module-picker",".ea-tabs",".auth-card",".fornost-ai-launcher"]){assert.ok(css.includes(selector),selector);}});
test("enterprise controls use sharp radii and visible focus state",()=>{assert.match(css,/--at-radius:8px/);assert.match(css,/box-shadow:0 0 0 3px color-mix/);assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/@media\(max-width:620px\)/);});
test("dark and light palettes expose readable semantic colors",()=>{for(const token of ["--ux-positive","--ux-warning","--ux-danger","--ux-text-2","--ux-text-3","--ux-border-strong"]){assert.ok(css.includes(token),token);}assert.match(css,/color-scheme:light/);assert.match(css,/color-scheme:dark/);});
test("brand color is reserved for interaction instead of tinting product surfaces",()=>{assert.match(css,/--at-accent:#d84b20/);assert.match(css,/--at-accent:#ff7849/);assert.doesNotMatch(css,/#(?:4f7dff|165dff|2bb8a6|635bff|c5a15a)/i);});
