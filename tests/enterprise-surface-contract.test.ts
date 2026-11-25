import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every enterprise and AI surface inherits the shared light/dark contract", async () => {
  const [page, css, copilot, packageJson] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/enterprise-surface-contract.css", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("package.json", "utf8"),
  ]);

  assert.match(page, /enterprise-surface-contract\.css/);
  for (const selector of [
    ".settings-card",
    ".integration-hub",
    ".fornost-ai-panel.is-workspace",
    ".ai-model-inventory",
    ".ai-risk-center",
    ".ai-access-governance",
    ".ai-assurance",
    ".ai-data-protection",
    ".rap-page",
    ".incident-page",
    ".finding-page",
    ".audit-workspace-tabs",
  ]) assert.ok(css.includes(selector), selector);

  for (const token of ["--ws-bg", "--ws-surface", "--ws-ink", "--ws-line", "--ws-brand"])
    assert.ok(css.includes(`var(${token})`), token);

  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /Operational modules: remove the last historical orange\/violet skins/);
  assert.match(css, /\.audit-workspace-tabs button\.active\{background:var\(--ws-brand\)!important/);
  assert.match(css, /\.incident-form-grid,\.finding-form-grid/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(copilot, /"assurance-alerts"/);
  assert.match(copilot, /data-ai-view=\{activeTab\}/);
  assert.match(packageJson, /"typecheck": "tsc --noEmit"/);
});
