import assert from "node:assert/strict";
import test from "node:test";
import { auditPortfolioNames, auditPortfolioLinkLabel, isOverdueAuditRequirement } from "../app/audit-overdue-requirements";
import type { AuditReadinessPortfolio } from "../app/audit-readiness-portfolio";

test("dashboard and portfolio use the same deadline, UTC day boundary and lifecycle rules", () => {
  const now = Date.parse("2026-11-08T21:00:00Z");
  for (const status of ["  Kapatıldı ", "Tamamlandı", "Kapalı", "APPROVED", "Closed", "Accepted"]) {
    assert.equal(isOverdueAuditRequirement({ targetDate: "2026-11-07", status }, now), false, status);
  }
  assert.equal(isOverdueAuditRequirement({ endDate: "2026-11-07", status: "Reopened" }, now), true);
  assert.equal(isOverdueAuditRequirement({ dueDate: "2026-11-08" }, now), false);
  assert.equal(isOverdueAuditRequirement({ dueDate: "2026-11-09T00:00:00+03:00" }, now), false);
  assert.equal(isOverdueAuditRequirement({ dueDate: "2026-11-09T00:00:00+03:00" }, now + 1), true);
  for (const dueDate of ["", "bad-date", "2026-02-30"]) assert.equal(isOverdueAuditRequirement({ dueDate }, now), false);
});

test("portfolio labels distinguish known, missing, ambiguous and unverified assignments", () => {
  const audit = { id: "a", name: "İç Denetim", gate: "empty" as const, verified: true, issues: [], requirements: 0, current: 0, blockers: 0 };
  const portfolio: AuditReadinessPortfolio = { audits: [audit], verified: false, issues: ["orphan-requirements"], orphanRequirements: 1, generatedAt: "2026-11-08T00:00:00Z" };
  const names = auditPortfolioNames(portfolio);
  assert.equal(auditPortfolioLinkLabel(" iç DENETİM ", names, true), "Portföyde · İç Denetim");
  assert.equal(auditPortfolioLinkLabel("Eski ad", names, true), "Portföye bağlı değil");
  for (const issue of ["audits-incomplete", "audits-invalid", "audits-unavailable"]) {
    assert.equal(auditPortfolioLinkLabel("Eski ad", auditPortfolioNames({ ...portfolio, issues: [issue] }), false), "Portfolio link unverified");
  }
  const duplicate = auditPortfolioNames({ ...portfolio, audits: [audit, { ...audit, id: "b" }] });
  assert.equal(auditPortfolioLinkLabel(audit.name, duplicate, true), "Portföy bağlantısı doğrulanamadı");
  assert.equal(auditPortfolioLinkLabel(undefined, null, false), "Not linked to portfolio");
});
