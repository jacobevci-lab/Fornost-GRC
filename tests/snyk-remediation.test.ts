import assert from "node:assert/strict";
import test from "node:test";
import { safeWebHref } from "../app/safe-web-href";
import { buildAuditReadinessReportHtml } from "../app/audit-readiness-export";

test("browser link validation rejects executable and ambiguous URLs", () => {
  for (const value of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "//evil.test", " https://good.test", "https:\\evil.test", "https://user:password@good.test", "https://good.test\n.evil.test", null, {}]) {
    assert.equal(safeWebHref(value), undefined);
  }
  assert.equal(safeWebHref("https://docs.example.test/path?q=one#section"), "https://docs.example.test/path?q=one#section");
  assert.equal(safeWebHref("http://jira.internal/issue/ABC-1"), "http://jira.internal/issue/ABC-1");
});

test("downloaded readiness reports escape hostile fields and disallow active content", () => {
  const payload = '<img src=x onerror=alert(1)>';
  const report = buildAuditReadinessReportHtml({ auditName: payload, generatedAt: payload, gateLabel: payload,
    readiness: 50, coverage: 50, total: 1, current: 0, stale: 0, missing: 1,
    requirements: [{ reference: payload, title: payload, owner: payload, dueDate: payload, status: "missing", linkedEvidence: 0, currentEvidence: 0, staleEvidence: 0 }],
    assuranceSignals: [],
  });
  assert.ok(!report.includes(payload));
  assert.ok(report.includes("&lt;img"));
  assert.ok(report.includes("default-src 'none'"));
  assert.ok(report.includes("form-action 'none'"));
});
