import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AI executive portfolio aggregates live assurance domains without model calls", async () => {
  const route = await readFile("app/api/ai/portfolio/route.ts", "utf8");
  assert.match(route, /requireRole\(req, \["Admin"\]\)/);
  assert.match(route, /ai_release_gates/);
  assert.match(route, /ai_red_team_campaigns/);
  assert.match(route, /ai_transparency_profiles/);
  assert.match(route, /ai_assurance_policies/);
  assert.doesNotMatch(route, /callProvider|runProviderChain/);
  assert.match(route, /\^\[=\+\\-@\]/);
});
test("AI management summary is integrated with responsive evidence export", async () => {
  const [ui, css, copilot, layout] = await Promise.all([
    readFile("app/fornost-ai-portfolio.tsx", "utf8"),
    readFile("app/fornost-ai-portfolio.css", "utf8"),
    readFile("app/fornost-ai-copilot.tsx", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(ui, /AI Yönetim Özeti/);
  assert.match(ui, /Öncelikli aksiyon kuyruğu/);
  assert.match(ui, /executive-portfolio|portfolio\?format=csv/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(copilot, /FornostAiPortfolio/);
  assert.match(layout, /fornost-ai-portfolio\.css/);
});
test("repository and application descriptions reflect governed AI assurance", async () => {
  const [readme, architecture, pkg, layout] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("docs/AI-ARCHITECTURE.md", "utf8"),
    readFile("package.json", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);
  assert.match(readme, /Govern Risk\. Prove Compliance\. Control AI\./);
  assert.match(readme, /18 bağımsız kontrol alanını/);
  assert.match(architecture, /Current assurance model/);
  assert.match(
    JSON.parse(pkg).description,
    /Enterprise GRC and governed AI assurance/,
  );
  assert.match(layout, /Enterprise Risk & AI Governance/);
});
