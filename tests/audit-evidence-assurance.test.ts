import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAuditEvidenceAssurance } from "../app/audit-evidence-assurance";

test("audit evidence assurance resolves current, stale and missing control evidence", () => {
  const requirements = [
    { id: "AUD-1", data: { controlRef: "CTL-001" } },
    { id: "AUD-2", data: { controlRef: "CTL-002" } },
    { id: "AUD-3", data: { controlRef: "CTL-003" } },
  ];
  const evidence = [
    { id: "EVD-1", data: { controlRef: "CTL-001", status: "Onaylandı" } },
    { id: "EVD-2", data: { controlRef: "CTL-002", status: "Onaylandı", expiresAt: "2026-01-01" } },
  ];
  const result = buildAuditEvidenceAssurance(requirements, evidence, new Date("2026-09-20T00:00:00Z"));
  assert.deepEqual(result, { total: 3, linked: 2, current: 1, stale: 1, missing: ["CTL-003"], coverage: 67 });
});

test("audit management exposes the live evidence assurance chain", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const css = readFileSync("app/soc2-audit.css", "utf8");
  assert.match(page, /evidenceRows=\{by\("Kanıtlar"\)\}/);
  assert.match(page, /<AuditEvidenceAssurance items=\{portfolioRows\}/);
  assert.match(page, /<AuditEvidenceAssurance items=\{items\}/);
  assert.match(page, /Kanıt Kütüphanesine Git/);
  assert.match(css, /\.audit-evidence-assurance/);
  assert.match(css, /\.audit-evidence-metrics/);
});
