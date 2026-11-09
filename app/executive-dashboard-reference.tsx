"use client";
import type { useExecutiveAssurance } from './use-executive-assurance';
import AuditReadinessPortfolioPanel from './audit-readiness-portfolio-panel';
import EvidenceAssuranceStatus from './evidence-assurance-status';
import { assessmentStateText } from './evidence/assessment-labels';
import { isOverdueAuditRequirement } from "./audit-overdue-requirements";

import { useMemo, useRef, useState } from "react";
import {
  buildExecutiveAssurance,
} from "./executive-assurance";
import { assessedRiskScore } from "./risk-methodology";
import type { AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import NavIcon from "./nav-icon";
import ExecutiveDecisionQueue, { orderDecisions, type DecisionQueueHandle } from "./executive-decision-queue";
import { useDashboardDecisionCounts } from "./use-dashboard-decision-counts";
import DashboardHeaderActions, { useDashboardView, PANEL_ORDER } from "./dashboard-customizer";
import { RenewalChart, ReportMatrix } from "./executive-report-charts";
import { reportRiskBand } from "./executive-report-data";
import { peekPendingFornostFocus } from "./navigation-focus";
import "./executive-assurance.css";
import "./executive-report.css";
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
const riskBand = reportRiskBand;
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
  const details = useRef<HTMLDetailsElement>(null);
  const [returning] = useState(() => peekPendingFornostFocus()?.kind === "executive-decisions");
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

  function showOverdue(button: HTMLButtonElement) {
    if (details.current) details.current.open = true;
    decisionQueue.current?.openOverdue(button);
  }
  const summaries = {
    riskHeatmap: {module:"Risk Assessment",style:"risk-posture-panel", title:tr?"Risk görünümü":"Risk posture",
      line:`${riskBands.high} ${tr?"yüksek":"high"} · ${riskBands.critical} ${tr?"kritik":"critical"}`,
      note:`${scoredRisks.length} ${tr?"değerlendirilen risk":"assessed risks"} · ${unassessedRisks} ${tr?"bekleyen":"pending"}`},
    frameworkReadiness: {module:"Uyum",style:"compliance-portfolio-panel",title:tr?"Uyum portföyü":"Compliance portfolio",
      line:complianceStats[0]?.name || (tr?"Çerçeve kaydı yok":"No frameworks recorded"),
      note:`${compliantTotal}/${complianceTotal} ${tr?"gereksinim uyumlu":"requirements compliant"}`},
    assuranceHealth: {module:"Kanıt Otomasyonu",style:"continuous-assurance-panel",title:tr?"Sürekli güvence":"Continuous assurance",
      line:`${evidenceState.evidenceReady?integrityPending:"—"} ${tr?"kanıt doğrulama bekliyor":"evidence awaiting verification"}`,
      note:tr?"Kontrol ve kanıt güveni":"Control and evidence confidence"},
    auditRemediation: {module:"Denetim Yönetimi",style:"audit-remediation-panel", title:tr?"Denetim ve iyileştirme":"Audit and remediation",line:"",note:""},
  };
  const auditorPack = () => window.open(withBasePath(`/api/continuous-assurance/auditor-pack?lang=${lang}`), "_blank", "noopener,noreferrer");

  return (
    <section className={`executive-dashboard-reference${view.preferences.compact ? " is-compact" : ""}`} data-ui-revision="period-report-v1" data-layout="period-report" aria-label={tr ? "Fornost GRC yönetici gösterge paneli" : "Fornost GRC executive dashboard"}>
      <header className="executive-dashboard-header">
        <div>
          <h2>{tr ? "Yönetici özeti" : "Executive overview"}</h2>

        </div>
        <span className="report-period">{tr?"Dönem raporu":"Period report"} · {new Intl.DateTimeFormat(tr?"tr-TR":"en-GB",{dateStyle:"long",timeZone:"UTC"}).format(now)}</span>
        <DashboardHeaderActions lang={lang} view={view} onAuditorPack={auditorPack} onReport={() => go("Raporlar")} />
      </header>

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

      <div className="report-chart-grid">
        <RenewalChart rows={evidenceState.rows} now={now} ready={evidenceState.evidenceReady} loading={evidenceState.loading} retry={evidenceState.refresh} tr={tr}/>
        <ReportMatrix risks={risks} tr={tr}/>
      </div>
      <div className="executive-dashboard-grid report-domains" data-layout-mode={referenceLayout ? "reference" : "tiles"}>
        {panelOrder.filter(id=>view.preferences.visible[id]).map(id=>{
          const summary = summaries[id as keyof typeof summaries];
          return <article key={id} className={"report-domain "+summary.style}>
            <button className="domain-link" onClick={()=>go(summary.module)}><NavIcon module={summary.module}/><strong>{summary.title}</strong></button>
            {id==="auditRemediation"?<div className="audit-remediation-metrics report-audit-links">
              <button onClick={()=>go("Bulgular ve CAPA")}>{tr?"Açık bulgu":"Open findings"} <b>{openFindings??"—"}</b></button>
              <button aria-controls="executive-decisions" onClick={e=>showOverdue(e.currentTarget)}>{tr?"Geciken denetim maddesi":"Overdue audit requirements"} <b>{overdueAudits}</b></button>
            </div>:<><p>{summary.line}</p><small>{summary.note}</small></>}
          </article>;
        })}
      </div>
      <details className="report-details" ref={details} open={returning || undefined}>
        <summary>{tr?"Değerlendirme ayrıntıları":"Assessment details"}</summary>
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
      </details>
      <footer className="executive-dashboard-footer"><span>{tr ? "Canlı GRC verisinden hesaplanır" : "Calculated from live GRC data"}</span><span>{assurance.totalControls} {tr ? "kontrol" : "controls"} · {assurance.totalEvidence} {tr ? "kanıt" : "evidence"} · {risks.length} {tr ? "risk" : "risks"} · {compliance.length} {tr ? "uyum maddesi" : "compliance requirements"}</span></footer>
    </section>
  );
}
