import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("module dashboards share the enterprise workspace contract", async () => {
  const css = await readFile("app/workspace-system.css", "utf8");

  for (const selector of [
    ".rap-page",
    ".continuity-page",
    ".plm-page",
    ".tprm-page",
    ".ri-page",
    ".incident-page",
    ".finding-page",
    ".ea-page",
    ".connected-grc",
  ]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }

  assert.match(css, /--atlas-bg:var\(--ws-bg\)/);
  assert.match(css, /--accent:var\(--ws-brand\)/);
  assert.match(css, /overflow-x:auto!important/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--ws-surface:#172021/);
});

test("reporting is an enterprise workflow and remains theme-token driven", async () => {
  const [page, css] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/reporting.css", "utf8"),
  ]);

  for (const contract of [
    "report-workspace",
    "report-scope-strip",
    "report-filter-panel",
    "report-analysis-grid",
    "report-data-quality",
    "report-table-empty",
  ]) {
    assert.match(page, new RegExp(contract));
    assert.match(css, new RegExp(`\\.${contract}`));
  }

  assert.match(page, /displayRecordCode\(r\)/);
  assert.match(page, /qualitySignals/);
  assert.match(page, /filtered\.length > 250/);
  assert.match(css, /var\(--ws-surface\)/);
  assert.match(css, /var\(--ws-brand-soft\)/);
  assert.doesNotMatch(css, /#(?:746cff|655cff|817aff|242452|635bff)/i);
});
