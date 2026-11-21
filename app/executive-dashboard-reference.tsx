"use client";
import type { useExecutiveAssurance } from './use-executive-assurance';
import AuditReadinessPortfolioPanel from './audit-readiness-portfolio-panel';
import EvidenceAssuranceStatus from './evidence-assurance-status';
import { assessmentStateText } from './evidence/assessment-labels';
import { isOverdueAuditRequirement } from "./audit-overdue-requirements";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ReportMatrix } from "./executive-report-charts";
import { DashboardActionQueue } from "./dashboard-action-queue";
import { frameworkPortfolio } from "./dashboard-actions";
import { usePosture } from "./framework-posture/client";
import type { Overview } from "./framework-posture/types";
import type { DashboardRoutes } from "./executive-assurance-panel";
import { reportRiskBand, validMatrixCoordinates } from "./executive-report-data";
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
function MiniBar({ value, tone = "neutral" }: { value: number; tone?: PanelRow["tone"] }) {
  const safe = Math.max(0, Math.min(100, value));
  return <i className={`executive-mini-bar ${tone}`}><em style={{ width: `${safe}%` }} /></i>;
}

export default function ExecutiveAssurancePanel({
  rows,
  evidenceState,
  lang,
  go, drill, upload,
}: DashboardRoutes & {
  rows: AssuranceRow[];
  evidenceState: ReturnType<typeof useExecutiveAssurance>;
  lang: "tr" | "en";
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

  const scoredRisks = useMemo(() => risks.flatMap((row) => { const score = assessedRiskScore(row.data); return score === null || !validMatrixCoordinates(row.data) ? [] : [{ row, score }]; }), [risks]);
  const riskBands = useMemo(() => ({
    critical: scoredRisks.filter((item) => riskBand(item.score) === "critical").length,
    high: scoredRisks.filter((item) => riskBand(item.score) === "high").length,
    medium: scoredRisks.filter((item) => riskBand(item.score) === "medium").length,
    low: scoredRisks.filter((item) => riskBand(item.score) === "low").length,
  }), [scoredRisks]);
  const highRisks = riskBands.critical + riskBands.high;
  const percent = (value: number | null, total: number) => total && value !== null ? new Intl.NumberFormat(tr?"tr-TR":"en-GB",{style:"percent",maximumFractionDigits:0}).format(value/100) : "—";
  const confidencePercent = (value: number | null, total: number, ready = evidenceState.evidenceReady) => ready ? percent(value, total) : "—";
  const assessedAudits = evidenceState.auditPortfolio?.audits.filter(audit => audit.verified && audit.gate !== "empty").length ?? 0;
  const freshnessKnown = evidenceState.evidenceReady && evidenceState.rows.filter(row => row.module === "Kanıtlar")
    .every(row => Boolean(String(row.data.status ?? "").trim()));
  const unassessedRisks = risks.length - scoredRisks.length;

  const openFindings = typeof counts.findings === "number"
    ? Math.max(assurance.openControlFindings, counts.findings) : null;
  const openEscalations = typeof counts.escalations === "number" ? counts.escalations : null;
  const details = useRef<HTMLDetailsElement>(null);
  const [returning] = useState(() => peekPendingFornostFocus()?.kind === "executive-decisions");
  const decisionQueue = useRef<DecisionQueueHandle>(null);
  const overdueAuditRows = audits.filter(row => isOverdueAuditRequirement(row.data, now));
  const overdueAudits = overdueAuditRows.length;

  const [overviewRevision,refreshOverview]=useState(0);
  const overview=usePosture<Overview>({overview:"1"},overviewRevision);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") refreshOverview(n => n + 1); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);
  const portfolio=frameworkPortfolio(overview.data);
  const complianceHint=portfolio?.score != null ? `${portfolio.compliant}/${portfolio.scope} ${tr?"madde uyumlu":"requirements compliant"}` : "—";
  const worst=portfolio?.lowest;
  const showScore=(ready:boolean,n:number,d:number)=>ready && d>0 ? n+"/"+d : "—";
  const integrityPending = assurance.legacyEvidence + assurance.unavailableEvidence + assurance.integrityUnknownEvidence;
  const countsComplete = openEscalations !== null && openFindings !== null && unassessedRisks === 0;
  const failedSources = [
    ...(counts.escalations === "unavailable" ? [tr ? "Güvence eskalasyonları" : "Assurance escalations"] : []),
    ...(counts.findings === "unavailable" ? [tr ? "Açık bulgular" : "Open findings"] : []),
  ];

  const decisionItems = [
    {
      value: scoredRisks.length || !risks.length ? scoredRisks.filter(({row, score}) => score >= 17 && !isClosed(row.data.status)).length : null,
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

  const summaries = {
    riskHeatmap: {module:"Risk Assessment",style:"risk-posture-panel", title:tr?"Risk görünümü":"Risk posture",
      line:!scoredRisks.length?"—":`${riskBands.high} ${tr?"yüksek":"high"} · ${riskBands.critical} ${tr?"kritik":"critical"}`,
      note:`${scoredRisks.length} ${tr?"değerlendirilen risk":"assessed risks"} · ${unassessedRisks} ${tr?"bekleyen":"pending"}`},
    frameworkReadiness: {module:"Uyum",style:"compliance-portfolio-panel",title:tr?"Uyum portföyü":"Compliance portfolio",
      line:portfolio?`${portfolio.count} ${tr?"aktif çerçeve":"active frameworks"}`:"—",
      note:portfolio?.score != null ? complianceHint + " · " + percent(portfolio.score,1) : complianceHint},
    assuranceHealth: {module:"Kanıt Otomasyonu",style:"continuous-assurance-panel",title:tr?"Sürekli güvence":"Continuous assurance",
      line:`${evidenceState.evidenceReady?integrityPending:"—"} ${tr?"kanıt doğrulama bekliyor":"evidence awaiting verification"}`,
      note:tr?"Kontrol ve kanıt güveni":"Control and evidence confidence"},
    auditRemediation: {module:"Denetim Yönetimi",style:"audit-remediation-panel", title:tr?"Denetim ve iyileştirme":"Audit and remediation",line:showScore(evidenceState.auditReady && assessedAudits>0,assurance.readyAudits,assurance.totalAudits),note:tr?"hazır denetim":"audits ready"},
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
          { label: tr ? "Kontrol Güvencesi" : "Control Assurance", value: confidencePercent(assurance.controlScore, assurance.connectedControls || assurance.automationCoveredControls), detail: `${showScore(evidenceState.evidenceReady && !!(assurance.connectedControls || assurance.automationCoveredControls),assurance.healthyControls,assurance.totalControls)} ${tr ? "sağlıklı" : "healthy"}`, tone: evidenceState.evidenceReady && assurance.controlScore >= 80 ? "positive" : "warning", module: "Kontroller" },
          { label: tr ? "Denetim Hazırlığı" : "Audit Readiness", value: confidencePercent(assurance.auditScore, assessedAudits, evidenceState.auditReady), detail: `${showScore(evidenceState.auditReady && assessedAudits>0,assurance.readyAudits,assurance.totalAudits)} ${tr ? "hazır" : "ready"}`, tone: evidenceState.auditReady && (assurance.auditScore ?? -1) >= 80 ? "positive" : "warning", module: "Denetim Yönetimi" },
          { label: tr ? "Zincir Kapsaması" : "Chain Coverage", value: percent(assurance.traceabilityScore, assurance.completeChains + assurance.partialChains), detail: tr ? "Risk · kontrol · kanıt bağlantıları" : "Risk · control · evidence links", tone: assurance.traceabilityScore >= 80 ? "positive" : "warning", module: "Bağlantılı GRC" },
          { label: tr ? "Kanıt Güncelliği" : "Evidence Freshness", value: confidencePercent(assurance.freshnessScore, assurance.totalEvidence, freshnessKnown), detail: `${showScore(freshnessKnown,assurance.currentEvidence,assurance.totalEvidence)} ${tr ? "güncel" : "current"}`, tone: evidenceState.evidenceReady && assurance.evidenceScore >= 80 ? "positive" : "warning", module: "Kanıtlar" },
          { label: tr ? "Yüksek & Kritik Risk" : "High & Critical Risk", value: scoredRisks.length ? `${highRisks} / ${scoredRisks.length}` : "—", badge:scoredRisks.length?percent(highRisks/scoredRisks.length*100,scoredRisks.length):undefined, detail:tr?"Değerlendirilen riskler içinde":"Of assessed risks", tone:riskBands.critical?"risk-critical":highRisks?"warning":"neutral", module:"Risk Assessment" },
          { label: tr ? "Uyum Sağlığı" : "Compliance Health", value: percent(portfolio?.score??null,portfolio?.scope??0), detail:complianceHint, tone:portfolio?.score==null?"neutral":portfolio.score>=80?"positive":"warning", module:"Uyum" },
        ].map((metric) => (
          <button type="button" className={`executive-kpi ${metric.tone}`} key={metric.label} onClick={() => drill(metric.module,metric.module==="Uyum"?worst?.name:undefined)}>
            <span className="executive-kpi-label"><NavIcon module={metric.module} /><small>{metric.label}</small><i aria-hidden="true" className="kpi-arrow">↗</i></span>
            <strong>{metric.value} {metric.badge && <small className="kpi-percent">{metric.badge}</small>}</strong>
            {metric.value!=="—" && <MiniBar value={Number.parseFloat((metric.badge??metric.value).replace("%",""))} />}
            <em title={metric.detail}>{metric.detail}</em>
          </button>
        ))}
      </div>

      <div className="report-chart-grid">
        <DashboardActionQueue rows={rows} assessedRows={evidenceState.evidenceReady ? evidenceState.rows : undefined} now={now} tr={tr} upload={upload}/>
        <ReportMatrix risks={risks} tr={tr}/>
      </div>
      <div className="executive-dashboard-grid report-domains" data-layout-mode={referenceLayout ? "reference" : "tiles"}>
        {panelOrder.filter(id=>view.preferences.visible[id]).map(id=>{
          const summary = summaries[id as keyof typeof summaries];
          return <article key={id} className={"report-domain "+summary.style}>
            <h3><button className="domain-link" onClick={()=>id==="frameworkReadiness"?drill("Uyum",worst?.name):go(summary.module)}><NavIcon module={summary.module}/>{summary.title}</button></h3>
            <p>{summary.line}</p><small>{summary.note}</small>
            {id==="frameworkReadiness" && worst && <small className={worst.rate<1?"portfolio-warning":"portfolio-lowest"}>{tr?"En düşük uyum":"Lowest compliance"} · {worst.name} ({percent(worst.rate*100,1)})</small>}
            {id==="frameworkReadiness" && (overview.error || (overview.data && (!portfolio || portfolio.scope===null))) && <button onClick={()=>refreshOverview(v=>v+1)}>{tr?"Uyum verisini yeniden yükle":"Retry compliance data"}</button>}
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
      <footer className="executive-dashboard-footer"><span>{tr ? "Canlı GRC verisinden hesaplanır" : "Calculated from live GRC data"}</span><span>{assurance.totalControls} {tr ? "kontrol" : "controls"} · {assurance.totalEvidence} {tr ? "kanıt" : "evidence"} · {risks.length} {tr ? "risk" : "risks"} · {portfolio?.scope ?? "—"} {tr ? "uyum maddesi" : "compliance requirements"}</span></footer>
    </section>
  );
}
