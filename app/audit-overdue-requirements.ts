import { auditNameKey, type AuditReadinessPortfolio } from "./audit-readiness-portfolio";
import { isPastDue } from "./due-date";

const closedStatuses = new Set([
  "kapalı", "kapatıldı", "tamamlandı", "onaylandı", "kabul edildi",
  "closed", "completed", "resolved", "accepted", "approved",
]);

export function isOverdueAuditRequirement(data: Record<string, unknown>, now: number) {
  const status = String(data.status ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
  return !closedStatuses.has(status) && isPastDue(data.dueDate || data.targetDate || data.endDate, now);
}

// A failed evidence assessment can still contain a complete, usable directory of audit names.
export function auditPortfolioNames(portfolio?: AuditReadinessPortfolio) {
  if (!portfolio || portfolio.issues.some(issue => ["audits-incomplete", "audits-invalid", "audits-unavailable"].includes(issue))) return null;
  const names = new Map<string, string | null>();
  for (const audit of portfolio.audits) {
    const key = auditNameKey(audit.name);
    names.set(key, names.has(key) ? null : audit.name);
  }
  return names;
}

export function auditPortfolioLinkLabel(value: unknown, names: ReturnType<typeof auditPortfolioNames>, tr: boolean) {
  const key = auditNameKey(value);
  if (key && (!names || names.get(key) === null)) return tr ? "Portföy bağlantısı doğrulanamadı" : "Portfolio link unverified";
  const name = names?.get(key);
  if (name) return tr ? `Portföyde · ${name}` : `In portfolio · ${name}`;
  return tr ? "Portföye bağlı değil" : "Not linked to portfolio";
}
