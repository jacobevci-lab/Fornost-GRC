import { buildControlAssurance, type AssuranceRow } from "./control-assurance";
import { assessConnectedGrcCoverage, buildConnectedGrcGraph, connectedRelationLabels, connectedTitle } from "./connected-grc-model";

export type ExecutiveAssurance = ReturnType<typeof buildExecutiveAssurance>;

const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("tr-TR");
const isCurrentEvidence = (row: AssuranceRow, now: number) => {
  const status = normalized(row.data.status || row.data.reviewStatus);
  const expires = row.data.expiresAt ? new Date(String(row.data.expiresAt)).getTime() : Number.NaN;
  return !["süresi doldu", "expired", "reddedildi", "rejected"].includes(status) && (!Number.isFinite(expires) || expires >= now);
};

export function buildExecutiveAssurance(rows: AssuranceRow[], today = new Date().toISOString().slice(0, 10)) {
  const graph = buildConnectedGrcGraph(rows);
  const traceability = assessConnectedGrcCoverage(rows, graph.links);
  const controls = buildControlAssurance(rows, today);
  const evidenceRows = rows.filter((row) => row.module === "Kanıtlar");
  const auditRows = rows.filter((row) => row.module === "Denetim Yönetimi");
  const now = new Date(today).getTime();
  const currentEvidence = evidenceRows.filter((row) => isCurrentEvidence(row, now)).length;
  const evidenceScore = evidenceRows.length ? Math.round((currentEvidence / evidenceRows.length) * 100) : 100;
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
  return {
    score,
    state,
    traceabilityScore: traceability.percent,
    controlScore: controls.score,
    evidenceScore,
    auditScore,
    completeChains: traceability.covered,
    partialChains: traceability.partial,
    totalChains: traceability.eligible,
    currentEvidence,
    totalEvidence: evidenceRows.length,
    readyAudits,
    totalAudits: auditRows.length,
    priorities,
    domains: traceability.domains,
  };
}

const escapeHtml = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function buildAssuranceReportHtml(rows: AssuranceRow[], tr: boolean, today = new Date().toISOString().slice(0, 10)) {
  const assurance = buildExecutiveAssurance(rows, today);
  const label = (relation: string) => connectedRelationLabels[relation]?.[tr ? "tr" : "en"] || relation;
  const state = assurance.state === "strong" ? (tr ? "Güçlü" : "Strong") : assurance.state === "developing" ? (tr ? "Gelişiyor" : "Developing") : (tr ? "Kritik" : "Critical");
  return `<!doctype html><html lang="${tr ? "tr" : "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fornost GRC — ${tr ? "Yönetici Güvence Paketi" : "Executive Assurance Pack"}</title><style>body{font-family:Arial,sans-serif;margin:36px;color:#172323;background:#fff}header{display:flex;justify-content:space-between;gap:30px;padding-bottom:22px;border-bottom:3px solid #087f78}h1{margin:0 0 8px;font-size:28px}p,small{color:#5d6d6c}.score{text-align:right}.score b{display:block;color:#087f78;font-size:42px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card{padding:17px;border:1px solid #d7e1df;border-radius:12px}.card b,.card span,.card small{display:block}.card b{font-size:25px}.card span{margin:7px 0 4px;font-weight:700}.domains{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0 26px}.domain{padding:14px;background:#f3f7f6;border-radius:9px}.domain b{float:right;color:#087f78}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px;border-bottom:1px solid #d7e1df;text-align:left;vertical-align:top}th{background:#f3f7f6;font-size:10px;text-transform:uppercase}.high{color:#b63e47;font-weight:700}@media print{body{margin:16mm}.card,tr{break-inside:avoid}}@media(max-width:760px){.grid,.domains{grid-template-columns:1fr 1fr}header{display:block}.score{text-align:left;margin-top:14px}}</style><body><header><div><small>FORNOST GRC · CONTINUOUS ASSURANCE</small><h1>${tr ? "Yönetici Güvence Paketi" : "Executive Assurance Pack"}</h1><p>${tr ? "Risk–kontrol–kanıt–denetim zincirinin bağımsız karar özeti." : "Decision summary for the risk-control-evidence-audit chain."}</p></div><div class="score"><b>${assurance.score}/100</b><span>${escapeHtml(state)}</span><small>${today}</small></div></header><section class="grid"><div class="card"><b>${assurance.traceabilityScore}%</b><span>${tr ? "Zincir bütünlüğü" : "Chain integrity"}</span><small>${assurance.completeChains}/${assurance.totalChains} ${tr ? "tam kayıt" : "complete records"}</small></div><div class="card"><b>${assurance.controlScore}%</b><span>${tr ? "Kontrol güvencesi" : "Control assurance"}</span><small>${tr ? "Test, sahiplik ve kanıt" : "Test, ownership and evidence"}</small></div><div class="card"><b>${assurance.evidenceScore}%</b><span>${tr ? "Kanıt güveni" : "Evidence confidence"}</span><small>${assurance.currentEvidence}/${assurance.totalEvidence} ${tr ? "güncel" : "current"}</small></div><div class="card"><b>${assurance.auditScore}%</b><span>${tr ? "Denetim readiness" : "Audit readiness"}</span><small>${assurance.readyAudits}/${assurance.totalAudits} ${tr ? "hazır" : "ready"}</small></div></section><h2>${tr ? "Alan posture" : "Domain posture"}</h2><section class="domains">${assurance.domains.map((domain) => `<div class="domain"><b>${domain.percent}%</b><span>${escapeHtml(domain.module)}</span><small>${domain.covered} ${tr ? "tam" : "complete"} · ${domain.partial} ${tr ? "kısmi" : "partial"}</small></div>`).join("")}</section><h2>${tr ? "Öncelikli güvence açıkları" : "Priority assurance gaps"}</h2><table><thead><tr><th>${tr ? "Kayıt" : "Record"}</th><th>${tr ? "Alan" : "Domain"}</th><th>${tr ? "Başlık" : "Title"}</th><th>${tr ? "Tamlık" : "Completeness"}</th><th>${tr ? "Eksik bağlantılar" : "Missing relationships"}</th></tr></thead><tbody>${assurance.priorities.map((item) => `<tr><td><b>${escapeHtml(item.code)}</b></td><td>${escapeHtml(item.module)}</td><td>${escapeHtml(item.title)}</td><td class="${item.severity}">${item.percent}%</td><td>${item.missingRelations.map(label).map(escapeHtml).join(" · ")}</td></tr>`).join("") || `<tr><td colspan="5">${tr ? "Kritik güvence açığı bulunmadı." : "No critical assurance gaps found."}</td></tr>`}</tbody></table></body></html>`;
}
