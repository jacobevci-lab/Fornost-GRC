import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync("app/evidence-history-panel.tsx", "utf8");
const css = readFileSync("app/evidence-history.css", "utf8");

test("evidence history opens the exact evidence and control records through shared navigation", () => {
  assert.match(panel, /import \{ navigateToFornost \} from "\.\/navigation-focus"/);
  assert.match(panel, /function openEvidenceRecord\(id:string\)/);
  assert.match(panel, /module:"Kanıtlar"/);
  assert.match(panel, /filter:\{evidenceRef:ref\}/);
  assert.match(panel, /function openControlRecord\(controlRef:string\)/);
  assert.match(panel, /module:"Kontroller"/);
  assert.match(panel, /filter:\{controlRef:ref\}/);
  assert.match(panel, /source:"evidence-history"/);
});

test("version rows expose evidence navigation without replacing the download action", () => {
  assert.match(panel, /className="eh-row-actions"/);
  assert.match(panel, /onClick=\{\(\)=>openEvidenceRecord\(version\.evidenceId\)\}/);
  assert.match(panel, /\/api\/evidence\?key=/);
  assert.match(panel, /Kanıtı Aç/);
  assert.match(panel, /Open Evidence/);
  assert.match(css, /\.eh-row-actions button,.eh-row-actions a/);
});

test("control timeline search can jump to the canonical control library record", () => {
  assert.match(panel, /controlRef\.trim\(\)&&<button type="button" className="ghost" onClick=\{\(\)=>openControlRecord\(controlRef\)\}/);
  assert.match(panel, /Kontrolü Aç/);
  assert.match(panel, /Open Control/);
});
