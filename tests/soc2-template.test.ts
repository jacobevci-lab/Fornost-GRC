import assert from "node:assert/strict";
import test from "node:test";
import { soc2TemplateControls, soc2TemplateMeta } from "../app/api/grc/soc2-template";

test("generic SOC 2 catalog contains 38 unique criteria", () => {
  assert.equal(soc2TemplateControls.length, 38);
  assert.equal(new Set(soc2TemplateControls.map((control) => control.tscId)).size, 38);
  assert.deepEqual(soc2TemplateMeta.scope, ["Security", "Availability", "Confidentiality"]);
  assert.deepEqual(soc2TemplateMeta.phaseTwo, ["Processing Integrity", "Privacy"]);
});

test("every SOC 2 criterion is audit-ready without imported assessment data", () => {
  for (const control of soc2TemplateControls) {
    assert.match(control.tscId, /^(CC\d+\.\d+|A\d+\.\d+|C\d+\.\d+)$/);
    assert.ok(control.expectation.length > 10, `${control.tscId} expectation is missing`);
    assert.ok(control.controlOwner.length > 1, `${control.tscId} owner is missing`);
    assert.ok(control.expectedEvidence.length > 5, `${control.tscId} expected evidence is missing`);
    assert.ok(control.typeIITestApproach.length > 5, `${control.tscId} Type II test approach is missing`);
    assert.equal(Object.keys(control).length, 9);
  }
});
