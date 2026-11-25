export type PortfolioSystem = {
  id: string; systemName: string; modelName: string; owner: string; status: string;
  riskTier: string; reviewDate: string; highRisks: number; criticalIncidents: number;
  openControls: number; totalControls: number; evidenceCurrent: number;
  redTeamCurrent: boolean; transparencyCurrent: boolean; assuranceCurrent: boolean;
  unresolvedExceptions: number; retirementInProgress: boolean; blockingFindings: number;
  blockingAssuranceAlerts?: number; blockingRegulatoryObligations?: number;
  releaseStatus: string; releaseScore: number; actions: string[]; readiness: number;
};
export function systemReviewOverdue(row: PortfolioSystem, today: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(row.reviewDate || "") && row.reviewDate < today;
}
export function portfolioGaps(row: PortfolioSystem, lang: "tr" | "en", today: string) {
  const t = (tr: string, en: string) => lang === "tr" ? tr : en;
  const gaps: string[] = [];
  if (systemReviewOverdue(row, today)) gaps.push(t("Sistem incelemesini yenile", "Renew system review"));
  if (row.criticalIncidents) gaps.push(t(`${row.criticalIncidents} yüksek/kritik olayı incele`, `Review ${row.criticalIncidents} high/critical incidents`));
  if (row.highRisks) gaps.push(t(`${row.highRisks} yüksek/kritik riski incele`, `Review ${row.highRisks} high/critical risks`));
  if (row.blockingFindings) gaps.push(t(`${row.blockingFindings} öncelikli CAPA bulgusunu incele`, `Review ${row.blockingFindings} priority CAPA findings`));
  if (row.blockingAssuranceAlerts) gaps.push(t(`${row.blockingAssuranceAlerts} güvence alarmını incele`, `Review ${row.blockingAssuranceAlerts} assurance alerts`));
  if (row.blockingRegulatoryObligations) gaps.push(t(`${row.blockingRegulatoryObligations} regülasyon yükümlülüğünü incele`, `Review ${row.blockingRegulatoryObligations} regulatory obligations`));
  if (row.status !== "approved") gaps.push(t("Envanter kararını incele", "Review inventory decision"));
  if (!row.totalControls || row.openControls) gaps.push(t("Kontrol değerlendirmesini tamamla", "Complete control assessment"));
  if (!row.evidenceCurrent) gaps.push(t("Güncel doğrulanmış kanıt ekle", "Add current verified evidence"));
  if (!row.redTeamCurrent) gaps.push(t("Güvenlik testini doğrula", "Verify security testing"));
  if (!row.transparencyCurrent) gaps.push(t("AI sistem kartını tamamla", "Complete AI system card"));
  if (!row.assuranceCurrent) gaps.push(t("Güvence temelini incele", "Review assurance baseline"));
  if (row.unresolvedExceptions) gaps.push(t("Gecikmiş istisnaları incele", "Review overdue exceptions"));
  if (row.retirementInProgress) gaps.push(t("Kullanımdan kaldırma planını tamamla", "Complete retirement plan"));
  if (row.releaseStatus !== "approved") gaps.push(t("Yayın kararını incele", "Review release decision"));
  return gaps;
}
export function sortPortfolioWork(rows: PortfolioSystem[], today: string) {
  const rank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return [...rows].sort((a, b) => Number(systemReviewOverdue(b, today)) - Number(systemReviewOverdue(a, today)) ||
    (rank[a.riskTier] ?? 4) - (rank[b.riskTier] ?? 4) ||
    (a.reviewDate || "9999").localeCompare(b.reviewDate || "9999") || a.id.localeCompare(b.id));
}
export function aiDisplayStatus(value: string, lang: "tr" | "en") {
  const labels: Record<string, [string, string]> = {
    draft: ["Taslak", "Draft"], approved: ["Onaylı", "Approved"], suspended: ["Askıda", "Suspended"],
    retired: ["Kullanımdan kaldırıldı", "Retired"], none: ["Değerlendirilmedi", "Not assessed"],
    blocked: ["Engelli", "Blocked"], rejected: ["Reddedildi", "Rejected"],
    pending: ["İnceleme bekliyor", "Pending review"], ready: ["İncelemeye hazır", "Ready for review"],
    Critical: ["Kritik", "Critical"], High: ["Yüksek", "High"], Medium: ["Orta", "Medium"], Low: ["Düşük", "Low"],
  };
  return labels[value]?.[lang === "tr" ? 0 : 1] || value;
}
