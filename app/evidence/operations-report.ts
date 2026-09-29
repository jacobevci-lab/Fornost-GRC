import type { ContinuousAssuranceOperationsInsights } from "./operations-insights";

export type ContinuousAssuranceOperationsReport = ContinuousAssuranceOperationsInsights & {
  schemaVersion: "1.0";
  snapshotId: string;
  notice: string;
};

const NOTICE = "Operational Continuous Assurance snapshot. This report is not an independent audit opinion.";

const csvValue = (value: unknown) => {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const htmlValue = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export function buildContinuousAssuranceOperationsReport(
  insights: ContinuousAssuranceOperationsInsights,
  snapshotId: string,
): ContinuousAssuranceOperationsReport {
  return {
    schemaVersion: "1.0",
    snapshotId,
    notice: NOTICE,
    ...insights,
  };
}

export function buildContinuousAssuranceOperationsCsv(report: ContinuousAssuranceOperationsReport) {
  const headers = [
    "snapshot_id",
    "generated_at",
    "window_hours",
    "overall_state",
    "source_id",
    "source_name",
    "vendor",
    "category",
    "state",
    "active_rules",
    "healthy_rules",
    "unhealthy_rules",
    "due_rules",
    "evidence_ready_rules",
    "evidence_gap",
    "runs_24h",
    "pass_runs_24h",
    "fail_runs_24h",
    "error_runs_24h",
    "success_rate_24h",
    "average_duration_ms_24h",
    "p95_duration_ms_24h",
    "last_run_at",
    "last_run_status",
    "reasons",
  ];
  const rows = report.connectors.map((connector) => [
    report.snapshotId,
    report.generatedAt,
    report.windowHours,
    report.state,
    connector.sourceId,
    connector.sourceName,
    connector.vendor,
    connector.category,
    connector.state,
    connector.activeRules,
    connector.healthyRules,
    connector.unhealthyRules,
    connector.dueRules,
    connector.evidenceReadyRules,
    connector.evidenceGap,
    connector.runs24h,
    connector.passRuns24h,
    connector.failRuns24h,
    connector.errorRuns24h,
    connector.successRate24h ?? "",
    connector.averageDurationMs24h ?? "",
    connector.p95DurationMs24h ?? "",
    connector.lastRunAt ?? "",
    connector.lastRunStatus ?? "",
    connector.reasons.join("|"),
  ]);
  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}

export function buildContinuousAssuranceOperationsHtml(report: ContinuousAssuranceOperationsReport, tr: boolean) {
  const s = report.summary;
  const title = tr ? "Continuous Assurance Operasyon Raporu" : "Continuous Assurance Operations Report";
  const generated = tr ? "Üretim zamanı" : "Generated at";
  const notice = tr
    ? "Bu çıktı operasyonel Continuous Assurance snapshot'ıdır; bağımsız denetim görüşü değildir."
    : NOTICE;
  const connectorRows = report.connectors.map((connector) => `
    <tr>
      <td><code>${htmlValue(connector.sourceId)}</code><br/><strong>${htmlValue(connector.sourceName)}</strong></td>
      <td>${htmlValue(connector.vendor)}</td>
      <td><span class="state ${htmlValue(connector.state)}">${htmlValue(connector.state)}</span></td>
      <td>${connector.activeRules}</td>
      <td>${connector.unhealthyRules}</td>
      <td>${connector.evidenceGap}</td>
      <td>${connector.dueRules}</td>
      <td>${connector.errorRuns24h}</td>
      <td>${connector.successRate24h == null ? "—" : `${connector.successRate24h}%`}</td>
      <td>${htmlValue(connector.reasons.join(", ") || "healthy")}</td>
    </tr>`).join("");
  const insightRows = report.insights.map((insight) => `
    <li><strong>${htmlValue(insight.sourceName)}</strong> · ${htmlValue(insight.code)} · ${htmlValue(insight.detail)}</li>`).join("");

  return `<!doctype html><html lang="${tr ? "tr" : "en"}"><head><meta charset="utf-8"/><title>${htmlValue(title)}</title><style>
  :root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b1d22;background:#f6f7f9}body{margin:0;padding:32px}main{max-width:1280px;margin:auto;background:#fff;border:1px solid #d9dde4;border-radius:14px;padding:28px}h1{margin:0 0 4px;font-size:24px}p{color:#667085}.meta{font-size:12px}.notice{padding:12px;border-left:4px solid #e87924;background:#fff7ed}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:22px 0}.summary div{padding:12px;background:#f7f8fa;border:1px solid #e3e6eb;border-radius:8px}.summary strong{display:block;font-size:22px}.summary small{color:#667085}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px;border-bottom:1px solid #e3e6eb;text-align:left;vertical-align:top}th{background:#f7f8fa}.state{font-weight:700}.state.critical{color:#b42318}.state.watch{color:#b54708}.state.healthy{color:#067647}.state.idle{color:#475467}code{font-size:10px;color:#667085}ul{padding-left:18px}li{margin:7px 0;font-size:12px}footer{margin-top:24px;color:#667085;font-size:10px}@media print{body{padding:0;background:#fff}main{border:0}}
  </style></head><body><main><header><h1>${htmlValue(title)}</h1><p class="meta">${generated}: ${htmlValue(report.generatedAt)} · Snapshot: ${htmlValue(report.snapshotId)} · ${report.windowHours}h</p><p class="notice">${htmlValue(notice)}</p></header><section class="summary"><div><strong>${s.enabledSources}</strong><small>${tr ? "Etkin connector" : "Enabled connectors"}</small></div><div><strong>${s.criticalConnectors}</strong><small>${tr ? "Kritik" : "Critical"}</small></div><div><strong>${s.watchConnectors}</strong><small>Watch</small></div><div><strong>${s.evidenceGapRules}</strong><small>${tr ? "Kanıt açığı" : "Evidence gaps"}</small></div><div><strong>${s.errorRuns24h}</strong><small>${tr ? "24s hata" : "24h errors"}</small></div></section><h2>${tr ? "Connector operasyon görünümü" : "Connector operational posture"}</h2><table><thead><tr><th>${tr ? "Kaynak" : "Source"}</th><th>Vendor</th><th>State</th><th>${tr ? "Aktif kural" : "Active rules"}</th><th>${tr ? "Sağlıksız" : "Unhealthy"}</th><th>${tr ? "Kanıt açığı" : "Evidence gap"}</th><th>Due</th><th>Errors 24h</th><th>Success 24h</th><th>Reasons</th></tr></thead><tbody>${connectorRows || `<tr><td colspan="10">${tr ? "Etkin connector yok." : "No enabled connectors."}</td></tr>`}</tbody></table><h2>${tr ? "Aksiyon sinyalleri" : "Action signals"}</h2>${insightRows ? `<ul>${insightRows}</ul>` : `<p>${tr ? "Aksiyon gerektiren sinyal yok." : "No action signal currently requires attention."}</p>`}<footer>${htmlValue(report.notice)}</footer></main></body></html>`;
}
