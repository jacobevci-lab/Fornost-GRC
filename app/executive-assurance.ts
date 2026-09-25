import { buildControlAssurance, type AssuranceRow } from "./control-assurance";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, connectedRelationLabels, connectedTitle } from "./connected-grc-model";

export type ExecutiveAssurance = ReturnType<typeof buildExecutiveAssurance>;
export type EvidenceIntegrityOverviewItem = {
  id: string;
  integrity?: string;
  checkedVersions?: number;
  failedVersion?: number;
};

const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("tr-TR");
const evidenceIntegrity = (row: AssuranceRow) => normalized(row.data.evidenceIntegrity);
const isCurrentEvidence = (row: AssuranceRow, now: number) => {
  const status = normalized(row.data.status || row.data.reviewStatus);
  const expires = row.data.expiresAt ? new Date(String(row.data.expiresAt)).getTime() : Number.NaN;
  return evidenceIntegrity(row) !== "broken"
    && !["süresi doldu", "expired", "reddedildi", "rejected"].includes(status)
    && (!Number.isFinite(expires) || expires >= now);
};

export function applyEvidenceIntegrityOverview(rows: AssuranceRow[], items: EvidenceIntegrityOverviewItem[]) {
  if (!items.length) return rows;
  const byId = new Map(items.filter((item) => item.id).map((item) => [item.id, item]));
  return rows.map((row) => {
    if (row.module !== "Kanıtlar") return row;
    const snapshot = byId.get(row.id);
    if (!snapshot?.integrity) return row;
    return {
      ...row,
      data: {
        ...row.data,
        evidenceIntegrity: snapshot.integrity,
        evidenceIntegrityCheckedVersions: Number(snapshot.checkedVersions || 0),
        evidenceIntegrityFailedVersion: Number(snapshot.failedVersion || 0),
      },
    };
  });
}

export function buildExecutiveAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const graph = buildConnectedGrcGraph(rows);
  const traceability = assessConnectedGrcCoverage(rows, graph.links);
  const controls = buildControlAssurance(rows, today);
  const evidenceRows = rows.filter((row) => row.module === "Kanıtlar");
  const auditRows = rows.filter((row) => row.module === "Denetim Yönetimi");
  const now = new Date(today).getTime();
  const currentEvidence = evidenceRows.filter((row) => isCurrentEvidence(row, now)).length;
  const freshnessScore = evidenceRows.length ? Math.round((currentEvidence / evidenceRows.length) * 100) : 100;
  const verifiedEvidence = evidenceRows.filter((row) => evidenceIntegrity(row) === "verified").length;
  const brokenEvidence = evidenceRows.filter((row) => evidenceIntegrity(row) === "broken").length;
  const legacyEvidence = evidenceRows.filter((row) => evidenceIntegrity(row) === "legacy-unverified").length;
  const unavailableEvidence = evidenceRows.filter((row) => evidenceIntegrity(row) === "unavailable").length;
  const integrityObservedEvidence = evidenceRows.filter((row) => Boolean(evidenceIntegrity(row))).length;
  const integrityUnknownEvidence = Math.max(0, evidenceRows.length - verifiedEvidence - brokenEvidence - legacyEvidence - unavailableEvidence);
  const integrityCoverage = evidenceRows.length ? Math.round((integrityObservedEvidence / evidenceRows.length) * 100) : 100;
  const evidencePenalty = evidenceRows.length
    ? Math.round(((brokenEvidence * 40) + (legacyEvidence * 10)) / evidenceRows.length)
    : 0;
  const evidenceScore = Math.max(0, freshnessScore - evidencePenalty);
  const readyAudits = auditRows.filter((row) => {
    const evidence = normalized(row.data.evidenceStatus);
    const status = normalized(row.data.status);
    return !["kanıt bekleniyor", "awaiting evidence"].includes(evidence) && !["gecikmiş", "overdue"].includes(status);
  }).length;
  const auditScore = auditRows.length ? Math.round((readyAudits / auditRows.length) * 100) : 100;
  const score = Math.round(traceability.percent * .3 + controls.score * .3 + evidenceScore * .2 + auditScore * .2);
  const state = score >= 80 ? "strong" : score >= 55 ? "developing" : "critical";
  const priorities = traceability.gaps.slice(0, 8).map((gap) => ({
    id: gap.row.id,
    code: gap.row.code || gap.row.id,
    module: gap.row.module,
    title: connectedTitle(gap.row),
    percent: gap.percent,
    severity: gap.severity,
    missingRelations: gap.missingRelations,
  }));
  const controlPriorities = controls.items
    .filter((item) => item.state !== "healthy")
    .slice(0, 8)
    .map((item) => ({
      id: item.control.id,
      reference: item.reference,
      title: item.title,
      score: item.score,
      state: item.state,
      reasons: item.reasons,
      brokenEvidenceCount: item.brokenEvidenceCount,
      openFindingCount: item.openFindingCount + item.automationOpenFindingCount + item.openRemediationCount,
    }));
  return {
    score,
    state,
    traceabilityScore: traceability.percent,
    controlScore: controls.score,
    evidenceScore,
    freshnessScore,
    auditScore,
    completeChains: traceability.covered,
    partialChains: traceability.partial,
    totalChains: traceability.eligible,
    currentEvidence,
    totalEvidence: evidenceRows.length,
    verifiedEvidence,
    brokenEvidence,
    legacyEvidence,
    unavailableEvidence,
    integrityUnknownEvidence,
    integrityCoverage,
    readyAudits,
    totalAudits: auditRows.length,
    healthyControls: controls.healthy,
    totalControls: controls.total,
    automatedControls: controls.automated,
    automationCoveredControls: controls.automationCovered,
    automationHealthyControls: controls.automationHealthy,
    frameworkMappedControls: controls.frameworkMapped,
    connectedControls: controls.connected,
    failedControlTests: controls.failedTests,
    overdueControlTests: controls.overdueTests,
    openControlFindings: controls.openFindings,
    integrityFailureControls: controls.integrityFailures,
    fullyVerifiedEvidenceControls: controls.verifiedEvidenceControls,
    legacyEvidenceControls: controls.legacyEvidenceControls,
    integrityUnknownControls: controls.integrityUnknownControls,
    priorities,
    controlPriorities,
    domains: traceability.domains,
  };
}

const escapeHtml = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const assuranceReasonLabel = (reason: string, tr: boolean) => ({
  "owner-missing": tr ? "Kontrol sahibi eksik" : "Control owner missing",
  "test-owner-missing": tr ? "Test sahibi eksik" : "Test owner missing",
  "test-date-missing": tr ? "Test tarihi planlanmamış" : "Test date not planned",
  "test-overdue": tr ? "Kontrol testi gecikmiş" : "Control test overdue",
  "test-failed": tr ? "Son kontrol testi başarısız" : "Latest control test failed",
  "evidence-missing": tr ? "Bağlı kanıt yok" : "No linked evidence",
  "evidence-stale": tr ? "Kanıt güncel değil" : "Evidence is not current",
  "evidence-integrity-broken": tr ? "Kanıt bütünlük zinciri bozuk" : "Evidence integrity chain broken",
  "evidence-integrity-legacy": tr ? "Eski kanıt bütünlüğü doğrulanamıyor" : "Legacy evidence integrity unverified",
  "evidence-integrity-unavailable": tr ? "Kanıt bütünlük doğrulaması kullanılamıyor" : "Evidence integrity verification unavailable",
  "audit-missing": tr ? "Denetim izi yok" : "No audit trace",
  "open-findings": tr ? "Açık bulgu var" : "Open finding exists",
  "automation-failing": tr ? "Otomatik kontrol başarısız" : "Automated control failing",
  "automation-stale": tr ? "Otomatik kanıt bayat/eksik" : "Automated evidence stale/missing",
  "automation-attention": tr ? "Otomasyon sinyali dikkat istiyor" : "Automation signal needs attention",
  "automation-finding-open": tr ? "Açık otomasyon bulgusu" : "Open automation finding",
  "remediation-open": tr ? "Açık CAPA / remediation" : "Open CAPA / remediation",
  "risk-link-missing": tr ? "Bulgu risk bağlantısı eksik" : "Finding risk link missing",
  "control-needs-improvement": tr ? "Kontrol iyileştirme bekliyor" : "Control needs improvement",
} as Record<string, string>)[reason] || reason;

export function buildAssuranceReportHtml(rows: AssuranceRow[], tr: boolean, today = new Date().toISOString().slice(0, 10)) {
  const assurance = buildExecutiveAssurance(rows, today);
  const label = (relation: string) => connectedRelationLabels[relation]?.[tr ? "tr" : "en"] || relation;
  const state = assurance.state === "strong" ? (tr ? "Güçlü" : "Strong") : assurance.state === "developing" ? (tr ? "Gelişiyor" : "Developing") : (tr ? "Kritik" : "Critical");
  return `<!doctype html><html lang="${tr ? "tr" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fornost GRC — ${tr ? "Yönetici Güvence Paketi" : "Executive Assurance Pack"}</title><style>body{font-family:Arial,sans-serif;margin:36px;color:#172323;background:#fff}header{display:flex;justify-content:space-between;gap:30px;padding-bottom:22px;border-bottom:3px solid #087f78}h1{margin:0 0 8px;font-size:28px}p,small{color:#5d6d6c}.score{text-align:right}.score b{display:block;color:#087f78;font-size:42px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card{padding:17px;border:1px solid #d7e1df;border-radius:12px}.card b,.card span,.card small{display:block}.card b{font-size:25px}.card span{margin:7px 0 4px;font-weight:700}.danger b{color:#b63e47}.warning b{color:#a56815}.domains{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0 26px}.domain{padding:14px;background:#f3f7f6;border-radius:9px}.domain b{float:right;color:#087f78}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}th,td{padding:10px;border-bottom:1px solid #d7e1df;text-align:left;vertical-align:top}th{background:#f3f7f6;font-size:10px;text-transform:uppercase}.high,.critical{color:#b63e47;font-weight:700}@media print{body{margin:16mm}.card,tr{break-inside:avoid}}@media(max-width:760px){.grid,.domains{grid-template-columns:1fr 1fr}header{display:block}.score{text-align:left;margin-top:14px}}</style><body><header><div><small>FORNOST GRC · CONTINUOUS ASSURANCE</small><h1>${tr ? "Yönetici Güvence Paketi" : "Executive Assurance Pack"}</h1><p>${tr ? "Risk–kontrol–kanıt–denetim zincirinin bağımsız karar özeti." : "Decision summary for the risk-control-evidence-audit chain."}</p></div><div class="score"><b>${assurance.score}/100</b><span>${escapeHtml(state)}</span><small>${today}</small></div></header><section class="grid"><div class="card"><b>${assurance.traceabilityScore}%</b><span>${tr ? "Zincir bütünlüğü" : "Chain integrity"}</span><small>${assurance.completeChains}/${assurance.totalChains} ${tr ? "tam kayıt" : "complete records"}</small></div><div class="card"><b>${assurance.controlScore}%</b><span>${tr ? "Kontrol güvencesi" : "Control assurance"}</span><small>${assurance.healthyControls}/${assurance.totalControls} ${tr ? "sağlıklı" : "healthy"} · ${assurance.openControlFindings} ${tr ? "açık bulgu/CAPA" : "open findings/CAPA"}</small></div><div class="card"><b>${assurance.evidenceScore}%</b><span>${tr ? "Kanıt güveni" : "Evidence confidence"}</span><small>${assurance.currentEvidence}/${assurance.totalEvidence} ${tr ? "güncel" : "current"} · ${assurance.integrityCoverage}% ${tr ? "bütünlük görünürlüğü" : "integrity visibility"}</small></div><div class="card"><b>${assurance.auditScore}%</b><span>${tr ? "Denetim readiness" : "Audit readiness"}</span><small>${assurance.readyAudits}/${assurance.totalAudits} ${tr ? "hazır" : "ready"}</small></div></section><h2>${tr ? "Kanıt bütünlüğü ve aksiyon posture" : "Evidence integrity and action posture"}</h2><section class="grid"><div class="card"><b>${assurance.verifiedEvidence}</b><span>${tr ? "Doğrulanmış kanıt zinciri" : "Verified evidence chains"}</span><small>${assurance.fullyVerifiedEvidenceControls}/${assurance.totalControls} ${tr ? "tam doğrulanmış kontrol" : "fully verified controls"}</small></div><div class="card ${assurance.brokenEvidence ? "danger" : ""}"><b>${assurance.brokenEvidence}</b><span>${tr ? "Bozuk kanıt zinciri" : "Broken evidence chains"}</span><small>${assurance.integrityFailureControls} ${tr ? "etkilenen kontrol" : "affected controls"}</small></div><div class="card ${assurance.legacyEvidence + assurance.integrityUnknownEvidence + assurance.unavailableEvidence ? "warning" : ""}"><b>${assurance.legacyEvidence + assurance.integrityUnknownEvidence + assurance.unavailableEvidence}</b><span>${tr ? "Doğrulama bekleyen" : "Awaiting verification"}</span><small>${assurance.legacyEvidence} legacy · ${assurance.unavailableEvidence} unavailable · ${assurance.integrityUnknownEvidence} unknown</small></div><div class="card ${assurance.failedControlTests + assurance.overdueControlTests ? "warning" : ""}"><b>${assurance.failedControlTests + assurance.overdueControlTests}</b><span>${tr ? "Test aksiyonu" : "Test actions"}</span><small>${assurance.failedControlTests} ${tr ? "başarısız" : "failed"} · ${assurance.overdueControlTests} ${tr ? "gecikmiş" : "overdue"}</small></div></section><h2>${tr ? "Kontrol güvence öncelikleri" : "Control assurance priorities"}</h2><table><thead><tr><th>${tr ? "Kontrol" : "Control"}</th><th>${tr ? "Başlık" : "Title"}</th><th>${tr ? "Skor" : "Score"}</th><th>${tr ? "Açık bulgu/CAPA" : "Open finding/CAPA"}</th><th>${tr ? "Güvence açıkları" : "Assurance gaps"}</th></tr></thead><tbody>${assurance.controlPriorities.map((item) => `<tr><td><b>${escapeHtml(item.reference)}</b></td><td>${escapeHtml(item.title)}</td><td class="${item.state}">${item.score}/100</td><td>${item.openFindingCount}</td><td>${item.reasons.map((reason) => assuranceReasonLabel(reason, tr)).map(escapeHtml).join(" · ")}</td></tr>`).join("") || `<tr><td colspan="5">${tr ? "Kontrol güvence açığı bulunmadı." : "No control assurance gaps found."}</td></tr>`}</tbody></table><h2>${tr ? "Alan posture" : "Domain posture"}</h2><section class="domains">${assurance.domains.map((domain) => `<div class="domain"><b>${domain.percent}%</b><span>${escapeHtml(domain.module)}</span><small>${domain.covered} ${tr ? "tam" : "complete"} · ${domain.partial} ${tr ? "kısmi" : "partial"}</small></div>`).join("")}</section><h2>${tr ? "Öncelikli izlenebilirlik açıkları" : "Priority traceability gaps"}</h2><table><thead><tr><th>${tr ? "Kayıt" : "Record"}</th><th>${tr ? "Alan" : "Domain"}</th><th>${tr ? "Başlık" : "Title"}</th><th>${tr ? "Tamlık" : "Completeness"}</th><th>${tr ? "Eksik bağlantılar" : "Missing relationships"}</th></tr></thead><tbody>${assurance.priorities.map((item) => `<tr><td><b>${escapeHtml(item.code)}</b></td><td>${escapeHtml(item.module)}</td><td>${escapeHtml(item.title)}</td><td class="${item.severity}">${item.percent}%</td><td>${item.missingRelations.map(label).map(escapeHtml).join(" · ")}</td></tr>`).join("") || `<tr><td colspan="5">${tr ? "Kritik izlenebilirlik açığı bulunmadı." : "No critical traceability gaps found."}</td></tr>`}</tbody></table></body></html>`;
}
