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
  assert.equal(result.total, 3);
  assert.equal(result.linked, 2);
  assert.equal(result.current, 1);
  assert.equal(result.stale, 1);
  assert.deepEqual(result.missing, ["CTL-003"]);
  assert.deepEqual(result.staleReferences, ["CTL-002"]);
  assert.equal(result.coverage, 67);
  assert.equal(result.readiness, 33);
  assert.equal(result.gate, "not-ready");
  assert.deepEqual(result.requirements.map((item) => [item.reference, item.status]), [
    ["CTL-003", "missing"],
    ["CTL-002", "stale"],
    ["CTL-001", "current"],
  ]);
  assert.deepEqual(result.gaps.map((item) => [item.reference, item.status]), [
    ["CTL-003", "missing"],
    ["CTL-002", "stale"],
  ]);
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
