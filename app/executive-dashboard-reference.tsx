"use client";
import type { useExecutiveAssurance } from './use-executive-assurance';
import AuditReadinessPortfolioPanel from './audit-readiness-portfolio-panel';
import EvidenceAssuranceStatus from './evidence-assurance-status';
import { assessmentStateText } from './evidence/assessment-labels';
import { isOverdueAuditRequirement } from "./audit-overdue-requirements";

import { Fragment, useMemo, useRef, useState } from "react";
import {
  buildExecutiveAssurance,
} from "./executive-assurance";
import { assessedRiskScore } from "./risk-methodology";
import type { AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import NavIcon from "./nav-icon";
import ExecutiveDecisionQueue, { orderDecisions, type DecisionQueueHandle } from "./executive-decision-queue";
import { useDashboardDecisionCounts } from "./use-dashboard-decision-counts";
import DashboardCustomizer, { useDashboardView, PANEL_ORDER } from "./dashboard-customizer";
import "./executive-assurance.css";
import "./executive-decision-workspace.css";

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
  evidenceState,
  lang,
  go,
}: {
  rows: AssuranceRow[];
  evidenceState: ReturnType<typeof useExecutiveAssurance>;
  lang: "tr" | "en";
  go: (module: string) => void;
}) {
  const tr = lang === "tr";
  const view = useDashboardView();
  const panelOrder = view.preferences.order.filter(id => PANEL_ORDER.includes(id));
  const referenceLayout = panelOrder.every((id, index) => id === PANEL_ORDER[index]) && PANEL_ORDER.every(id => view.preferences.visible[id]);
  const { counts, asOf, retry } = useDashboardDecisionCounts(rows);
  const [openedAt] = useState(() => Date.now());
  const now = asOf ?? openedAt;
  const assurance = useMemo(() => buildExecutiveAssurance(evidenceState.rows, evidenceState.generatedAt, evidenceState.auditPortfolio), [evidenceState.rows, evidenceState.generatedAt, evidenceState.auditPortfolio]);

  const risks = useMemo(() => rows.filter((row) => row.module === "Risk Assessment"), [rows]);
  const compliance = useMemo(() => rows.filter((row) => row.module === "Uyum"), [rows]);
  const audits = useMemo(() => rows.filter((row) => row.module === "Denetim Yönetimi"), [rows]);

  const scoredRisks = useMemo(() => risks.flatMap((row) => { const score = assessedRiskScore(row.data); return score === null ? [] : [{ row, score }]; }), [risks]);
  const riskBands = useMemo(() => ({
    critical: scoredRisks.filter((item) => riskBand(item.score) === "critical").length,
    high: scoredRisks.filter((item) => riskBand(item.score) === "high").length,
    medium: scoredRisks.filter((item) => riskBand(item.score) === "medium").length,
    low: scoredRisks.filter((item) => riskBand(item.score) === "low").length,
  }), [scoredRisks]);
  const highRisks = riskBands.critical + riskBands.high;
  const percent = (value: number | null, total: number) => total && value !== null ? `${Math.round(value)}%` : "—";
  const confidencePercent = (value: number | null, total: number, ready = evidenceState.evidenceReady) => ready ? percent(value, total) : "—";
  const unassessedRisks = risks.length - scoredRisks.length;

  const openFindings = typeof counts.findings === "number"
    ? Math.max(assurance.openControlFindings, counts.findings) : null;
  const openEscalations = typeof counts.escalations === "number" ? counts.escalations : null;
  const decisionQueue = useRef<DecisionQueueHandle>(null);
  const overdueAuditRows = audits.filter(row => isOverdueAuditRequirement(row.data, now));
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
  const integrityPending = assurance.legacyEvidence + assurance.unavailableEvidence + assurance.integrityUnknownEvidence;
  const countsComplete = openEscalations !== null && openFindings !== null;
  const failedSources = [
    ...(counts.escalations === "unavailable" ? [tr ? "Güvence eskalasyonları" : "Assurance escalations"] : []),
    ...(counts.findings === "unavailable" ? [tr ? "Açık bulgular" : "Open findings"] : []),
  ];

  const riskRows: PanelRow[] = [
    { label: tr ? "Kritik" : "Critical", value: riskBands.critical, tone: "critical" },
    { label: tr ? "Yüksek" : "High", value: riskBands.high, tone: "warning" },
    { label: tr ? "Orta" : "Medium", value: riskBands.medium, tone: "neutral" },
    { label: tr ? "Düşük" : "Low", value: riskBands.low, tone: "positive" },
  ];

  const decisionItems = [
    {
      value: scoredRisks.filter(({row, score}) => score >= 17 && !isClosed(row.data.status)).length,
      label: tr ? "Kritik risk kararı" : "Critical risk decisions",
      detail: tr ? "Kritik seviyedeki risk kayıtlarını incele" : "Review critical risk records",
      module: "Risk Assessment",
      tone: "critical",
    },
    {
      value: openEscalations,
      label: tr ? "Güvence eskalasyonları" : "Assurance escalations",
      detail: tr ? "Sorumlu atamalarını ve yönetişim kuyruğunu incele" : "Clear owner and governance queues",
      module: "Kanıt Otomasyonu",
      tone: "warning",
    },
    {
      value: overdueAudits,
      label: tr ? "Geciken denetim maddesi" : "Overdue audit requirements",
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

  const knownSignals = decisionItems.filter(item => item.value !== null && item.value > 0);
  const knownTotal = knownSignals.reduce((total, item) => total + (item.value ?? 0), 0);
  const totalAvailable = countsComplete || knownTotal > 0;
  const signalDescription = knownTotal > 0
    ? (tr ? "yönetim sinyali karar bekliyor" : "management signals need review")
    : countsComplete
      ? (tr ? "Kritik yönetim sinyali bulunmuyor" : "No critical management signals")
      : (tr ? "Yönetim sinyallerinin toplamı henüz doğrulanamadı" : "Management signal total is unconfirmed");

  const recordDecisions = orderDecisions([
    ...scoredRisks.filter(({ row, score }) => score >= 10 && !isClosed(row.data.status))
      .map(({ row, score }) => ({ row, score, reason: score >= 17 ? "critical" as const : "high" as const })),
    ...overdueAuditRows.map(row => ({ row, reason: "overdue" as const })),
    ...compliance.filter(row => !["uyumlu", "compliant", "implemented", "uygulandı", "onaylandı", "approved", "uygulanamaz", "not applicable", "n/a"].includes(normalized(row.data.status || row.data.implementation)))
      .map(row => ({ row, reason: "compliance" as const })),
  ]);

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
            <div><strong>{rows.length && evidenceState.ready && assurance.score !== null ? assurance.score : "—"}</strong><span> /100</span><MiniBar value={rows.length && evidenceState.ready ? assurance.score ?? 0 : 0} /><small>{evidenceState.evidenceReady ? integrityPending : "—"} {tr ? "kanıt doğrulama bekliyor" : "evidence awaiting verification"}</small></div>
            <div className="assurance-score-bars">
              <label><span>{tr ? "Zincir bütünlüğü" : "Chain integrity"}<b>{percent(assurance.traceabilityScore, rows.length)}</b></span></label>
              <label><span>{tr ? "Kontrol güvencesi" : "Control assurance"}<b>{confidencePercent(assurance.controlScore, assurance.totalControls)}</b></span></label>
              <label><span>{tr ? "Kanıt güveni" : "Evidence confidence"}<b>{confidencePercent(assurance.evidenceScore, assurance.totalEvidence)}</b></span></label>
              <label><span>{tr ? "Başarısız test" : "Failed tests"}<b>{assurance.failedControlTests}</b></span></label>
            </div>
          </div>
        </article>),
    auditRemediation: (<article className="executive-cockpit-panel audit-remediation-panel">
          <header><span className="executive-panel-icon"><NavIcon module="Denetim Yönetimi" /></span><div><small>{tr ? "DENETİM VE İYİLEŞTİRME" : "AUDIT & REMEDIATION"}</small><h3>{tr ? "Denetim ve kapanış görünümü" : "Audit & closure posture"}</h3></div><button onClick={() => go("Denetim Yönetimi")}>{tr ? "Denetimler" : "Audits"} →</button></header>
          <div className="audit-remediation-metrics">
            <div><strong>{confidencePercent(assurance.auditScore, assurance.totalAudits, evidenceState.auditReady)}</strong><span>{evidenceState.auditReady ? assurance.readyAudits : "—"}/{assurance.totalAudits} {tr ? "hazır denetim" : "ready audits"}</span><MiniBar value={evidenceState.auditReady && assurance.totalAudits ? assurance.auditScore ?? 0 : 0} /></div>
            <button type="button" onClick={() => go("Bulgular ve CAPA")}><span>{tr ? "Açık bulgu" : "Open findings"}</span><b>{openFindings ?? "—"}</b></button>
            <button type="button" aria-controls="executive-decisions" onClick={event => decisionQueue.current?.openOverdue(event.currentTarget)}><span>{tr ? "Geciken denetim maddesi" : "Overdue audit requirements"}</span><b>{overdueAudits}</b></button>
          </div>
        </article>)
  };

  const auditorPack = () => window.open(withBasePath(`/api/continuous-assurance/auditor-pack?lang=${lang}`), "_blank", "noopener,noreferrer");

  return (
    <section className={`executive-dashboard-reference${view.preferences.compact ? " is-compact" : ""}`} data-ui-revision="density-customize-v2" data-layout="calm-executive" aria-label={tr ? "Fornost GRC yönetici gösterge paneli" : "Fornost GRC executive dashboard"}>
      <header className="executive-dashboard-header">
        <div>
          <h2>{tr ? "Yönetici özeti" : "Executive overview"}</h2>

        </div>
        <div className="executive-dashboard-header-actions">
          <DashboardCustomizer lang={lang} view={view} />
          <button type="button" onClick={auditorPack}>{tr ? "Denetçi Paketi" : "Auditor Pack"}<span>↗</span></button>
          <button type="button" className="primary" onClick={() => go("Raporlar")}>{tr ? "Yönetim Raporu" : "Executive Report"}<span>→</span></button>
        </div>
      </header>

      {failedSources.length > 0 && <div role="status" className="executive-data-warning">
        <span>{tr ? "Yüklenemeyen göstergeler" : "Unavailable indicators"} · {failedSources.join(", ")}. </span>
        <button type="button" onClick={retry}>{tr ? "Yeniden dene" : "Retry"}</button>
      </div>}
      <div className="executive-action-workspace">
        <ExecutiveDecisionQueue controls={decisionQueue} portfolio={evidenceState.auditPortfolio} entries={recordDecisions} lang={lang}
          hidden={!view.preferences.visible.actionCenter} completeAndClear={countsComplete && !knownSignals.length} />
        <section hidden={!view.preferences.visible.recentChanges} className="executive-attention-band decision-signals" aria-labelledby="decision-signals-heading">
          <h3 id="decision-signals-heading">{tr ? "Yönetim sinyalleri" : "Management signals"}</h3>
          <p className="decision-signal-total">
            <span>{!countsComplete && knownTotal > 0 && (tr ? "En az " : "At least ")}<strong>{totalAvailable ? knownTotal : "—"}</strong></span>{" "}
            <span>{signalDescription}</span>
          </p>
          <ul>{decisionItems.map(item => <li key={item.module}>
            <button type="button" aria-controls={item.module === "Denetim Yönetimi" ? "executive-decisions" : undefined} onClick={event => item.module === "Denetim Yönetimi" ? decisionQueue.current?.openOverdue(event.currentTarget) : go(item.module)}>
              <span>{item.label}</span><strong>{item.value ?? "—"}</strong><span aria-hidden="true">›</span>
            </button>
          </li>)}</ul>
        </section>
      </div>

      <EvidenceAssuranceStatus state={evidenceState} lang={lang} />
      <AuditReadinessPortfolioPanel portfolio={evidenceState.auditPortfolio} lang={lang} />
      {evidenceState.evidenceReady && assurance.assessmentIssues.length > 0 && <ul className="executive-assessment-issues">{assurance.assessmentIssues.map(issue => <li key={issue.reason}>{issue.count} · {assessmentStateText[issue.reason]?.[lang] || issue.reason}</li>)}</ul>}
      <div className="executive-dashboard-kpis">
        {[
          { label: tr ? "Kontrol Güvencesi" : "Control Assurance", value: confidencePercent(assurance.controlScore, assurance.totalControls), detail: `${evidenceState.evidenceReady ? assurance.healthyControls : "—"}/${assurance.totalControls} ${tr ? "sağlıklı" : "healthy"}`, tone: evidenceState.evidenceReady && assurance.controlScore >= 80 ? "positive" : "warning", module: "Kontroller" },
          { label: tr ? "Denetim Hazırlığı" : "Audit Readiness", value: confidencePercent(assurance.auditScore, assurance.totalAudits, evidenceState.auditReady), detail: `${evidenceState.auditReady ? assurance.readyAudits : "—"}/${assurance.totalAudits} ${tr ? "hazır" : "ready"}`, tone: evidenceState.auditReady && (assurance.auditScore ?? -1) >= 80 ? "positive" : "warning", module: "Denetim Yönetimi" },
          { label: tr ? "Zincir Kapsaması" : "Chain Coverage", value: percent(assurance.traceabilityScore, rows.length), detail: tr ? "Risk · kontrol · kanıt bağlantıları" : "Risk · control · evidence links", tone: assurance.traceabilityScore >= 80 ? "positive" : "warning", module: "Bağlantılı GRC" },
          { label: tr ? "Kanıt Güncelliği" : "Evidence Freshness", value: confidencePercent(assurance.freshnessScore, assurance.totalEvidence), detail: `${evidenceState.evidenceReady ? assurance.currentEvidence : "—"}/${assurance.totalEvidence} ${tr ? "güncel" : "current"}`, tone: evidenceState.evidenceReady && assurance.evidenceScore >= 80 ? "positive" : "warning", module: "Kanıtlar" },
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

      <div className="executive-dashboard-grid" data-layout-mode={referenceLayout ? "reference" : "tiles"}>
        {panelOrder.filter(id => view.preferences.visible[id]).map(id => <Fragment key={id}>{panels[id]}</Fragment>)}
      </div>

      <footer className="executive-dashboard-footer"><span>{tr ? "Canlı GRC verisinden hesaplanır" : "Calculated from live GRC data"}</span><span>{assurance.totalControls} {tr ? "kontrol" : "controls"} · {assurance.totalEvidence} {tr ? "kanıt" : "evidence"} · {risks.length} {tr ? "risk" : "risks"} · {compliance.length} {tr ? "uyum maddesi" : "compliance requirements"}</span></footer>
    </section>
  );
}
