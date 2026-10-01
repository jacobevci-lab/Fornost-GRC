"use client";
import { dueTimestamp } from "./due-date";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  applyEvidenceIntegrityOverview,
  buildExecutiveAssurance,
  type EvidenceIntegrityOverviewItem,
} from "./executive-assurance";
import { assessedRiskScore } from "./risk-methodology";
import type { AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import NavIcon from "./nav-icon";
import DashboardCustomizer, { useDashboardView, PANEL_ORDER } from "./dashboard-customizer";
import { connectedTitle } from "./connected-grc-model";
import "./executive-assurance.css";

type Operations = {
  summary: {
    openEscalations: number;
    critical: number;
    high: number;
    unacknowledged: number;
    ownerless: number;
    ownerCoverage: number;
    overdueRiskReviews: number;
    mandatoryRetests: number;
    retestFailures: number;
    oldestOpenAgeDays: number;
    queuedNotifications: number;
  };
  routes: { owner: number; governance: number };
  owners: Array<{
    owner: string;
    assigned: boolean;
    open: number;
    critical: number;
    high: number;
    unacknowledged: number;
    oldestAgeDays: number;
    kinds: string[];
  }>;
};

type PanelRow = {
  label: string;
  value: number;
  detail?: string;
  tone?: "critical" | "warning" | "positive" | "neutral";
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const isClosed = (value: unknown) => [
  "kapalı",
  "kapatıldı",
  "tamamlandı",
  "onaylandı",
  "closed",
  "completed",
  "resolved",
  "accepted",
  "kabul edildi",
].includes(normalized(value));
const riskBand = (score: number) => score >= 17 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low";
const frameworkName = (row: AssuranceRow, fallback: string) =>
  clean(row.data.framework || row.data.frameworkName || row.data.standard || row.data.regulation || row.data.catalog || fallback);

function MiniBar({ value, tone = "neutral" }: { value: number; tone?: PanelRow["tone"] }) {
  const safe = Math.max(0, Math.min(100, value));
  return <i className={`executive-mini-bar ${tone}`}><em style={{ width: `${safe}%` }} /></i>;
}

export default function ExecutiveAssurancePanel({
  rows,
  lang,
  go,
}: {
  rows: AssuranceRow[];
  lang: "tr" | "en";
  go: (module: string) => void;
}) {
  const tr = lang === "tr";
  const view = useDashboardView();
  const panelOrder = view.preferences.order.filter(id => PANEL_ORDER.includes(id));
  const referenceLayout = panelOrder.every((id, index) => id === PANEL_ORDER[index]) && PANEL_ORDER.every(id => view.preferences.visible[id]);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [findingSummary, setFindingSummary] = useState<{open: number} | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [evidenceIntegrity, setEvidenceIntegrity] = useState<EvidenceIntegrityOverviewItem[]>([]);
  const assuranceRows = useMemo(() => applyEvidenceIntegrityOverview(rows, evidenceIntegrity), [rows, evidenceIntegrity]);
  const assurance = useMemo(() => buildExecutiveAssurance(assuranceRows), [assuranceRows]);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const refresh = async () => {
      const paths = ["/api/continuous-assurance/executive", "/api/evidence/history", "/api/findings"];
      const results = await Promise.allSettled(paths.map(async (path) => {
        const response = await fetch(withBasePath(path), { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }));
      if (!live) return;
      setNow(Date.now());
      setLoadError(results.some(result => result.status === "rejected"));
      const [executive, history, finding] = results;
      if (executive.status === "fulfilled") setOperations(executive.value);
      if (history.status === "fulfilled" && Array.isArray(history.value?.evidenceItems)) setEvidenceIntegrity(history.value.evidenceItems);
      if (finding.status === "fulfilled" && finding.value?.summary) setFindingSummary(finding.value.summary);
    };
    void refresh();
    const onRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(onRefresh, 60000);
    window.addEventListener("focus", onRefresh);
    return () => { live = false; controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", onRefresh); };
  }, [rows]);

  const risks = useMemo(() => rows.filter((row) => row.module === "Risk Assessment"), [rows]);
  const compliance = useMemo(() => rows.filter((row) => row.module === "Uyum"), [rows]);
  const audits = useMemo(() => rows.filter((row) => row.module === "Denetim Yönetimi"), [rows]);
  const findings = useMemo(() => rows.filter((row) => row.module === "Bulgular ve CAPA"), [rows]);

  const scoredRisks = useMemo(() => risks.flatMap((row) => { const score = assessedRiskScore(row.data); return score === null ? [] : [{ row, score }]; }), [risks]);
  const riskBands = useMemo(() => ({
    critical: scoredRisks.filter((item) => riskBand(item.score) === "critical").length,
    high: scoredRisks.filter((item) => riskBand(item.score) === "high").length,
    medium: scoredRisks.filter((item) => riskBand(item.score) === "medium").length,
    low: scoredRisks.filter((item) => riskBand(item.score) === "low").length,
  }), [scoredRisks]);
  const highRisks = riskBands.critical + riskBands.high;
  const percent = (value: number, total: number) => total ? `${Math.round(value)}%` : "—";
  const unassessedRisks = risks.length - scoredRisks.length;

  const openFindings = Math.max(
    assurance.openControlFindings,
    findingSummary?.open ?? findings.filter((row) => !isClosed(row.data.status)).length,
  );
  const overdueAuditRows = audits.filter((row) => {
    const due = clean(row.data.dueDate || row.data.targetDate || row.data.endDate);
    return Boolean(due) && dueTimestamp(due) < now && !isClosed(row.data.status);
  });
  const overdueAudits = overdueAuditRows.length;

  const complianceStats = useMemo(() => {
    const grouped = new Map<string, { total: number; compliant: number }>();
    compliance.forEach((row) => {
      const framework = frameworkName(row, tr ? "Genel Uyum" : "General Compliance");
      const current = grouped.get(framework) || { total: 0, compliant: 0 };
      current.total += 1;
      if (["uyumlu", "compliant", "implemented", "uygulandı", "onaylandı", "approved"].includes(normalized(row.data.status || row.data.implementation))) current.compliant += 1;
      grouped.set(framework, current);
    });
    return [...grouped.entries()]
      .map(([name, value]) => ({ name, total: value.total, score: value.total ? Math.round((value.compliant / value.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [compliance, tr]);

  const complianceTotal = compliance.length;
  const compliantTotal = compliance.filter((row) => ["uyumlu", "compliant", "implemented", "uygulandı", "onaylandı", "approved"].includes(normalized(row.data.status || row.data.implementation))).length;
  const complianceScore = complianceTotal ? Math.round((compliantTotal / complianceTotal) * 100) : 0;
  const ops = operations?.summary;
  const integrityPending = assurance.legacyEvidence + assurance.unavailableEvidence + assurance.integrityUnknownEvidence;
  const attentionTotal = (ops?.openEscalations || 0) + riskBands.critical + overdueAudits + openFindings;

  const riskRows: PanelRow[] = [
    { label: tr ? "Kritik" : "Critical", value: riskBands.critical, tone: "critical" },
    { label: tr ? "Yüksek" : "High", value: riskBands.high, tone: "warning" },
    { label: tr ? "Orta" : "Medium", value: riskBands.medium, tone: "neutral" },
    { label: tr ? "Düşük" : "Low", value: riskBands.low, tone: "positive" },
  ];

  const decisionItems = [
    {
      value: riskBands.critical,
      label: tr ? "Kritik risk kararı" : "Critical risk decisions",
      detail: tr ? "Kritik seviyedeki risk kayıtlarını incele" : "Review critical risk records",
      module: "Risk Assessment",
      tone: "critical",
    },
    {
      value: ops?.openEscalations || 0,
      label: tr ? "Güvence eskalasyonları" : "Assurance escalations",
      detail: tr ? "Sorumlu atamalarını ve yönetişim kuyruğunu incele" : "Clear owner and governance queues",
      module: "Kanıt Otomasyonu",
      tone: "warning",
    },
    {
      value: overdueAudits,
      label: tr ? "Geciken denetim" : "Overdue audits",
      detail: tr ? "Kanıt ve aksiyon tarihlerini gözden geçir" : "Review evidence and action dates",
      module: "Denetim Yönetimi",
      tone: "warning",
    },
    {
      value: openFindings,
      label: tr ? "Açık bulgu / CAPA" : "Open findings / CAPA",
      detail: tr ? "İyileştirme ve doğrulama akışını yönet" : "Manage remediation and verification",
      module: "Bulgular ve CAPA",
      tone: openFindings ? "critical" : "positive",
    },
  ];

  const recordDecisions = [
    ...scoredRisks.filter(item => item.score >= 10 && !isClosed(item.row.data.status)).sort((a, b) => b.score - a.score).map(({ row, score }) => ({ row, tone: score >= 17 ? "critical" : "warning", type: tr ? "Risk" : "Risk", reason: tr ? "Yüksek risk maruziyeti" : "High risk exposure" })),
    ...overdueAuditRows.map(row => ({ row, tone: "warning", type: tr ? "Denetim" : "Audit", reason: tr ? "Hedef tarihi geçti" : "Past due date" })),
    ...findings.filter(row => !isClosed(row.data.status)).map(row => ({ row, tone: "warning", type: tr ? "Bulgu" : "Finding", reason: tr ? "İyileştirme bekliyor" : "Remediation pending" })),
    ...compliance.filter(row => !["uyumlu", "compliant", "implemented", "uygulandı", "onaylandı", "approved"].includes(normalized(row.data.status || row.data.implementation))).map(row => ({ row, tone: "neutral", type: tr ? "Uyum" : "Compliance", reason: tr ? "Uyum açığı" : "Compliance gap" })),
  ].slice(0, 4);
  const formatDue = (row: AssuranceRow) => {
    const value = clean(row.data.dueDate || row.data.targetDate || row.data.endDate);
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString(tr ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  };

  const panels: Partial<Record<(typeof PANEL_ORDER)[number], React.ReactNode>> = {
    riskHeatmap: (<article className="executive-cockpit-panel risk-posture-panel">
          <header><span className="executive-panel-icon"><NavIcon module="Risk Assessment" /></span><div><small>{tr ? "RİSK GÖRÜNÜMÜ" : "RISK POSTURE"}</small><h3>{risks.length} {tr ? "risk" : "risks"} · {unassessedRisks} {tr ? "değerlendirme bekliyor" : "awaiting assessment"}</h3></div><button onClick={() => go("Risk Assessment")}>{tr ? "Risk Merkezi" : "Risk Center"} →</button></header>
          <div className="risk-posture-body">
            <div className="risk-segmented-bar" role="img" aria-label={riskRows.map(item => `${item.label}: ${item.value}`).join(", ")}>
              {riskRows.map(item => <i key={item.label} className={item.tone} style={{ width: `${scoredRisks.length ? item.value / scoredRisks.length * 100 : 0}%` }} />)}
            </div>
            <div className="risk-distribution">
              {riskRows.map(item => <span key={item.label}><i className={item.tone} />{item.label}<b>{percent(scoredRisks.length ? item.value / scoredRisks.length * 100 : 0, scoredRisks.length)}</b></span>)}
            </div>
          </div>
        </article>),
    frameworkReadiness: (<article className="executive-cockpit-panel compliance-portfolio-panel">
          <header><span className="executive-panel-icon"><NavIcon module="Uyum" /></span><div><small>{tr ? "UYUM PORTFÖYÜ" : "COMPLIANCE PORTFOLIO"}</small><h3>{tr ? "Çerçeve uygulama görünümü" : "Framework implementation posture"}</h3></div><button onClick={() => go("Uyum")}>{tr ? "Uyum Merkezi" : "Compliance"} →</button></header>
          <div className="compliance-framework-list">
            {complianceStats.length ? complianceStats.map((item) => <button type="button" key={item.name} onClick={() => go("Uyum")}><span><b>{item.name}</b><small>{item.total} {tr ? "gereksinim" : "requirements"}</small></span><strong>{item.score}%</strong><MiniBar value={item.score} tone={item.score >= 80 ? "positive" : item.score >= 60 ? "warning" : "critical"} /></button>) : <p>{tr ? "Henüz framework/uyum kaydı bulunmuyor." : "No framework/compliance records yet."}</p>}
          </div>
          <footer className="compliance-summary"><span>{tr ? "Toplam uyum" : "Overall compliance"}</span><b>{percent(complianceScore, complianceTotal)}</b><small>{compliantTotal}/{complianceTotal} {tr ? "gereksinim uyumlu" : "requirements compliant"}</small></footer>
        </article>),
    assuranceHealth: (<article className="executive-cockpit-panel continuous-assurance-panel">
          <header><span className="executive-panel-icon"><NavIcon module="Kanıtlar" /></span><div><small>{tr ? "SÜREKLİ GÜVENCE" : "CONTINUOUS ASSURANCE"}</small><h3>{tr ? "Kontrol ve kanıt güveni" : "Control & evidence confidence"}</h3></div><button onClick={() => go("Kanıt Otomasyonu")}>{tr ? "Operasyon" : "Operations"} →</button></header>
          <div className="assurance-score-row">
            <div><strong>{rows.length ? assurance.score : "—"}</strong><span> /100</span><MiniBar value={rows.length ? assurance.score : 0} /><small>{integrityPending} {tr ? "kanıt doğrulama bekliyor" : "evidence awaiting verification"}</small></div>
            <div className="assurance-score-bars">
              <label><span>{tr ? "Zincir bütünlüğü" : "Chain integrity"}<b>{percent(assurance.traceabilityScore, rows.length)}</b></span></label>
              <label><span>{tr ? "Kontrol güvencesi" : "Control assurance"}<b>{percent(assurance.controlScore, assurance.totalControls)}</b></span></label>
              <label><span>{tr ? "Kanıt güveni" : "Evidence confidence"}<b>{percent(assurance.evidenceScore, assurance.totalEvidence)}</b></span></label>
              <label><span>{tr ? "Başarısız test" : "Failed tests"}<b>{assurance.failedControlTests}</b></span></label>
            </div>
          </div>
        </article>),
    auditRemediation: (<article className="executive-cockpit-panel audit-remediation-panel">
          <header><span className="executive-panel-icon"><NavIcon module="Denetim Yönetimi" /></span><div><small>{tr ? "DENETİM VE İYİLEŞTİRME" : "AUDIT & REMEDIATION"}</small><h3>{tr ? "Denetim ve kapanış görünümü" : "Audit & closure posture"}</h3></div><button onClick={() => go("Denetim Yönetimi")}>{tr ? "Denetimler" : "Audits"} →</button></header>
          <div className="audit-remediation-metrics">
            <div><strong>{percent(assurance.auditScore, assurance.totalAudits)}</strong><span>{assurance.readyAudits}/{assurance.totalAudits} {tr ? "hazır denetim" : "ready audits"}</span><MiniBar value={assurance.totalAudits ? assurance.auditScore : 0} /></div>
            <button type="button" onClick={() => go("Bulgular ve CAPA")}><span>{tr ? "Açık bulgu" : "Open findings"}</span><b>{openFindings}</b></button>
            <button type="button" onClick={() => go("Denetim Yönetimi")}><span>{tr ? "Geciken denetim" : "Overdue audits"}</span><b>{overdueAudits}</b></button>
          </div>
        </article>)
  };

  const auditorPack = () => window.open(withBasePath(`/api/continuous-assurance/auditor-pack?lang=${lang}`), "_blank", "noopener,noreferrer");

  return (
    <section className={`executive-dashboard-reference${view.preferences.compact ? " is-compact" : ""}`} data-ui-revision="density-customize-v2" data-layout="calm-executive" aria-label={tr ? "Fornost GRC yönetici gösterge paneli" : "Fornost GRC executive dashboard"}>
      <header className="executive-dashboard-header">
        <div>
          <small>{tr ? "YÖNETİCİ GÜVENCE MERKEZİ" : "EXECUTIVE ASSURANCE CENTER"}</small>
          <h2>{tr ? "Kurumsal risk ve güvence görünümü" : "Enterprise risk & assurance posture"}</h2>
          <p>{tr ? "Risk, uyum, sürekli güvence, denetim ve iyileştirme durumunu tek karar ekranında yönetin." : "Manage risk, compliance, continuous assurance, audit and remediation from one decision surface."}</p>
        </div>
        <div className="executive-dashboard-header-actions">
          <DashboardCustomizer lang={lang} view={view} />
          <button type="button" onClick={auditorPack}>{tr ? "Denetçi Paketi" : "Auditor Pack"}<span>↗</span></button>
          <button type="button" className="primary" onClick={() => go("Raporlar")}>{tr ? "Yönetim Raporu" : "Executive Report"}<span>→</span></button>
        </div>
      </header>

      {loadError && <p role="status" className="executive-data-warning">{tr ? "Bazı operasyonel veriler yüklenemedi. Son alınan değerler gösteriliyor; eksik kaynaklar doğrulanmalıdır." : "Some operational data could not be loaded. Last received values are shown; missing sources need verification."}</p>}
      <div className="executive-dashboard-kpis">
        {[
          { label: tr ? "Kontrol Güvencesi" : "Control Assurance", value: percent(assurance.controlScore, assurance.totalControls), detail: `${assurance.healthyControls}/${assurance.totalControls} ${tr ? "sağlıklı" : "healthy"}`, tone: assurance.controlScore >= 80 ? "positive" : "warning", module: "Kontroller" },
          { label: tr ? "Denetim Hazırlığı" : "Audit Readiness", value: percent(assurance.auditScore, assurance.totalAudits), detail: `${assurance.readyAudits}/${assurance.totalAudits} ${tr ? "hazır" : "ready"}`, tone: assurance.auditScore >= 80 ? "positive" : "warning", module: "Denetim Yönetimi" },
          { label: tr ? "Zincir Kapsaması" : "Chain Coverage", value: percent(assurance.traceabilityScore, rows.length), detail: tr ? "Risk · kontrol · kanıt bağlantıları" : "Risk · control · evidence links", tone: assurance.traceabilityScore >= 80 ? "positive" : "warning", module: "Bağlantılı GRC" },
          { label: tr ? "Kanıt Güncelliği" : "Evidence Freshness", value: percent(assurance.freshnessScore, assurance.totalEvidence), detail: `${assurance.currentEvidence}/${assurance.totalEvidence} ${tr ? "güncel" : "current"}`, tone: assurance.evidenceScore >= 80 ? "positive" : "warning", module: "Kanıtlar" },
          { label: tr ? "Kritik + Yüksek Risk" : "Critical + High Risk", value: percent(scoredRisks.length ? highRisks / scoredRisks.length * 100 : 0, scoredRisks.length), detail: `${highRisks}/${scoredRisks.length} ${tr ? "değerlendirilen risk" : "assessed risks"}`, tone: highRisks ? "critical" : "positive", module: "Risk Assessment" },
          { label: tr ? "Uyum Sağlığı" : "Compliance Health", value: percent(complianceScore, complianceTotal), detail: `${compliantTotal}/${complianceTotal} ${tr ? "uyumlu" : "compliant"}`, tone: complianceScore >= 80 ? "positive" : "warning", module: "Uyum" },
        ].map((metric) => (
          <button type="button" className={`executive-kpi ${metric.tone}`} key={metric.label} onClick={() => go(metric.module)}>
            <span className="executive-kpi-label"><NavIcon module={metric.module} /><small>{metric.label}</small></span>
            <strong>{metric.value}</strong>
            <MiniBar value={Number.parseFloat(metric.value) || 0} />
            <em title={metric.detail}>{metric.detail}</em>
          </button>
        ))}
      </div>

      <section hidden={!view.preferences.visible.recentChanges} className={`executive-attention-band ${attentionTotal ? "active" : "clear"}`} aria-label={tr ? "Yönetim dikkati" : "Management attention"}>
        <span className="attention-icon"><NavIcon module="Risk Assessment" /></span>
        <span className="attention-copy">
          <small>{tr ? "YÖNETİM DİKKATİ" : "ATTENTION REQUIRED"}</small>
          <b>{attentionTotal ? (tr ? `${attentionTotal} öncelikli yönetim sinyali karar bekliyor` : `${attentionTotal} priority management signals need review`) : (tr ? "Kritik yönetim sinyali bulunmuyor" : "No critical management signals")}</b>
        </span>
        <div className="attention-breakdown">
          {decisionItems.filter(item => item.value > 0).slice(0, 3).map(item => <button type="button" key={item.module} onClick={() => go(item.module)}>
            <span className={`attention-signal-icon ${item.tone}`}><NavIcon module={item.module} /></span>
            <strong>{item.value}</strong><span><b>{item.label}</b><small>{tr ? "İnceleme bekliyor" : "Needs review"}</small></span><span aria-hidden="true">›</span>
          </button>)}
        </div>
      </section>

      <div className="executive-dashboard-grid" data-layout-mode={referenceLayout ? "reference" : "tiles"}>
        {panelOrder.filter(id => view.preferences.visible[id]).map(id => <Fragment key={id}>{panels[id]}</Fragment>)}
      </div>

      <section hidden={!view.preferences.visible.actionCenter} id="executive-decisions" className="executive-decision-board">
        <header><span className="executive-panel-icon"><NavIcon module="Ana Sayfa" /></span><div><small>{tr ? "YÖNETİCİ KARAR TABLOSU" : "EXECUTIVE DECISION BOARD"}</small><h3>{tr ? "Bugün yönetim kararı gerektiren işler" : "Items requiring management decisions today"}</h3></div><span>{decisionItems.reduce((sum, item) => sum + item.value, 0)} {tr ? "açık sinyal" : "open signals"}</span></header>
        {!recordDecisions.length && !decisionItems.some((item) => item.value > 0) && <p>{tr ? "Öncelikli karar bekleyen kayıt bulunmuyor." : "No priority decisions pending."}</p>}
        <div className="executive-decision-table-wrap" tabIndex={0} role="region" aria-label={tr ? "Yönetici karar tablosu" : "Executive decision table"}>
          <table className="executive-decision-table">
            <thead><tr>{(tr ? ["Tür", "Karar konusu", "Öncelik", "Sorumlu", "Hedef tarih", "Karar nedeni", "İşlem"] : ["Type", "Decision", "Priority", "Owner", "Due date", "Decision reason", "Action"]).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{recordDecisions.map(({ row, tone, type, reason }) => <tr key={row.id}>
              <td><span className={`executive-type-dot ${tone}`} />{type}</td>
              <td><div className="executive-record-title"><b>{row.code || "—"}</b><span title={connectedTitle(row)}>{connectedTitle(row)}</span></div></td>
              <td><span className={`executive-priority ${tone}`}>{tone === "critical" ? (tr ? "Kritik" : "Critical") : tone === "warning" ? (tr ? "Yüksek" : "High") : (tr ? "İncele" : "Review")}</span></td>
              <td>{clean(row.data.owner || row.data.responsible || row.data.auditOwner) || (tr ? "Atanmamış" : "Unassigned")}</td>
              <td>{formatDue(row)}</td>
              <td><span className={`executive-status ${tone}`}>{reason}</span></td>
              <td><button type="button" onClick={() => go(row.module)} aria-label={`${row.code || connectedTitle(row)} — ${tr ? "Modülde incele" : "Review in module"}`}>{tr ? "İncele" : "Review"} →</button></td>
            </tr>)}{decisionItems.filter((item) => item.value > 0).slice(0, 4).filter(item => item.module === "Kanıt Otomasyonu" || !recordDecisions.length).map(item => <tr key={item.label}>
              <td>{tr ? "Sinyal" : "Signal"}</td><td><b>{item.label}</b><small>{item.detail}</small></td>
              <td><span className={`executive-priority ${item.tone}`}>{tr ? "İncele" : "Review"}</span></td><td>—</td><td>—</td><td>{item.value} {tr ? "açık kayıt" : "open items"}</td>
              <td><button type="button" onClick={() => go(item.module)} aria-label={`${item.label} — ${tr ? "İncele" : "Review"}`}>{tr ? "İncele" : "Review"} →</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <footer className="executive-dashboard-footer"><span>{tr ? "Canlı GRC verisinden hesaplanır" : "Calculated from live GRC data"}</span><span>{assurance.totalControls} {tr ? "kontrol" : "controls"} · {assurance.totalEvidence} {tr ? "kanıt" : "evidence"} · {risks.length} {tr ? "risk" : "risks"} · {compliance.length} {tr ? "uyum maddesi" : "compliance requirements"}</span></footer>
    </section>
  );
}
