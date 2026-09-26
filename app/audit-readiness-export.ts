export type AuditReadinessRequirement = {
  reference: string;
  title: string;
  owner: string;
  dueDate: string;
  status: "current" | "stale" | "missing";
  linkedEvidence: number;
  currentEvidence: number;
  staleEvidence: number;
};

export type AuditReadinessSignal = {
  id: string;
  state: string;
  title: string;
  targetControlRef: string;
  owner: string;
  dueDate: string;
  reason: string;
  blocking: boolean;
};

export type AuditReadinessSnapshot = {
  auditName: string;
  generatedAt: string;
  gateLabel: string;
  readiness: number | null;
  coverage: number | null;
  total: number;
  current: number;
  stale: number;
  missing: number;
  requirements: AuditReadinessRequirement[];
  assuranceSignals: AuditReadinessSignal[];
};

type ReportFormat = "html" | "csv";

const clean = (value: unknown) => String(value ?? "").trim();
const html = (value: unknown) => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function percentage(value: number | null) {
  return value === null ? "—" : `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function statusLabel(status: AuditReadinessRequirement["status"]) {
  return status === "current" ? "CURRENT" : status === "stale" ? "STALE" : "MISSING";
}

export function buildAuditReadinessReportHtml(snapshot: AuditReadinessSnapshot) {
  const blockerCount = snapshot.assuranceSignals.filter((signal) => signal.blocking).length;
  const requirementRows = snapshot.requirements.map((item) => `<tr><td>${html(item.reference)}</td><td>${html(item.title || "—")}</td><td>${html(item.owner || "—")}</td><td>${html(item.dueDate || "—")}</td><td>${statusLabel(item.status)}</td><td>${item.linkedEvidence}</td><td>${item.currentEvidence}</td><td>${item.staleEvidence}</td></tr>`).join("");
  const signalRows = snapshot.assuranceSignals.map((item) => `<tr><td>${html(item.targetControlRef || "—")}</td><td>${html(item.title || "—")}</td><td>${html(item.state || "—")}</td><td>${html(item.reason || "—")}</td><td>${html(item.owner || "—")}</td><td>${html(item.dueDate || "—")}</td><td>${item.blocking ? "BLOCKING" : "ATTENTION"}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(snapshot.auditName || "Audit Readiness Snapshot")}</title><style>body{font-family:Inter,Arial,sans-serif;margin:32px;color:#1b1f24}h1{margin:0 0 6px}p{color:#59636e}.meta,.metrics{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.card{border:1px solid #d8dee4;border-radius:10px;padding:12px 16px;min-width:120px}.card b{display:block;font-size:22px;margin-top:4px}.gate{font-weight:800}table{border-collapse:collapse;width:100%;margin:12px 0 28px;font-size:13px}th,td{border:1px solid #d8dee4;padding:8px;text-align:left;vertical-align:top}th{background:#f6f8fa}h2{margin-top:28px;font-size:18px}.foot{font-size:12px;color:#6e7781;margin-top:32px}</style></head><body><h1>Fornost GRC · Audit Readiness Snapshot</h1><p>${html(snapshot.auditName || "Audit portfolio")}</p><div class="meta"><div class="card"><span>Gate</span><b class="gate">${html(snapshot.gateLabel)}</b></div><div class="card"><span>Readiness</span><b>${percentage(snapshot.readiness)}</b></div><div class="card"><span>Coverage</span><b>${percentage(snapshot.coverage)}</b></div><div class="card"><span>Continuous Assurance blockers</span><b>${blockerCount}</b></div></div><div class="metrics"><div class="card"><span>Total</span><b>${snapshot.total}</b></div><div class="card"><span>Current</span><b>${snapshot.current}</b></div><div class="card"><span>Stale</span><b>${snapshot.stale}</b></div><div class="card"><span>Missing</span><b>${snapshot.missing}</b></div></div><h2>Evidence readiness by requirement</h2><table><thead><tr><th>Reference</th><th>Requirement</th><th>Owner</th><th>Due date</th><th>Status</th><th>Linked evidence</th><th>Current</th><th>Stale</th></tr></thead><tbody>${requirementRows || '<tr><td colspan="8">No in-scope requirements.</td></tr>'}</tbody></table><h2>Continuous Assurance signals</h2><table><thead><tr><th>Control</th><th>Signal</th><th>State</th><th>Reason</th><th>Owner</th><th>Due date</th><th>Impact</th></tr></thead><tbody>${signalRows || '<tr><td colspan="7">No scoped Continuous Assurance signals.</td></tr>'}</tbody></table><p class="foot">Generated ${html(snapshot.generatedAt)} · Fornost GRC Connected Assurance</p></body></html>`;
}

export function buildAuditReadinessReportCsv(snapshot: AuditReadinessSnapshot) {
  const rows: string[][] = [
    ["section", "reference", "title", "owner", "due_date", "status", "linked_evidence", "current_evidence", "stale_evidence", "reason", "blocking"],
    ...snapshot.requirements.map((item) => ["requirement", item.reference, item.title, item.owner, item.dueDate, item.status, String(item.linkedEvidence), String(item.currentEvidence), String(item.staleEvidence), "", ""]),
    ...snapshot.assuranceSignals.map((item) => ["continuous-assurance", item.targetControlRef, item.title, item.owner, item.dueDate, item.state, "", "", "", item.reason, item.blocking ? "true" : "false"]),
  ];
  return rows.map((row) => row.map(csv).join(",")).join("\r\n");
}

function safeFilePart(value: string) {
  return clean(value || "audit-readiness").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "audit-readiness";
}

export function downloadAuditReadinessReport(snapshot: AuditReadinessSnapshot, format: ReportFormat) {
  if (typeof document === "undefined") return false;
  const body = format === "html" ? buildAuditReadinessReportHtml(snapshot) : buildAuditReadinessReportCsv(snapshot);
  const mime = format === "html" ? "text/html;charset=utf-8" : "text/csv;charset=utf-8";
  const blob = new Blob([format === "csv" ? `\uFEFF${body}` : body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilePart(snapshot.auditName)}-audit-readiness.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
