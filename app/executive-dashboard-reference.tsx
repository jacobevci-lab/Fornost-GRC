"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyEvidenceIntegrityOverview,
  buildExecutiveAssurance,
  type EvidenceIntegrityOverviewItem,
} from "./executive-assurance";
import type { AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
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

type DeliveryOps = {
  summary: {
    pending: number;
    sent: number;
    sent30d: number;
    failed: number;
    retryExhausted: number;
    attempts30d: number;
    deliveryRate30d: number;
    inAppOnly: number;
    slaBreaches: number;
  };
};

type EvidenceHistoryOverview = { evidenceItems?: EvidenceIntegrityOverviewItem[] };

type PanelRow = {
  label: string;
  value: number;
  detail?: string;
  tone?: "critical" | "warning" | "positive" | "neutral";
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const numberOf = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
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
const riskScore = (row: AssuranceRow) => {
  const direct = [
    row.data.residualRiskScore,
    row.data.residualScore,
    row.data.riskScore,
    row.data.score,
  ].map(numberOf).find((value) => value > 0);
  if (direct) return direct;
  const likelihood = numberOf(row.data.residualLikelihood || row.data.likelihood);
  const impact = numberOf(row.data.residualImpact || row.data.impact);
  return likelihood && impact ? likelihood * impact : 0;
};
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
  const [operations, setOperations] = useState<Operations | null>(null);
  const [delivery, setDelivery] = useState<DeliveryOps | null>(null);
  const [evidenceIntegrity, setEvidenceIntegrity] = useState<EvidenceIntegrityOverviewItem[]>([]);
  const assuranceRows = useMemo(() => applyEvidenceIntegrityOverview(rows, evidenceIntegrity), [rows, evidenceIntegrity]);
  const assurance = useMemo(() => buildExecutiveAssurance(assuranceRows), [assuranceRows]);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(withBasePath("/api/continuous-assurance/executive"), { cache: "no-store", headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : null),
      fetch(withBasePath("/api/continuous-assurance/notifications"), { cache: "no-store", headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : null),
      fetch(withBasePath("/api/evidence/history"), { cache: "no-store", headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : null),
    ]).then(([executive, notification, history]: [Operations | null, DeliveryOps | null, EvidenceHistoryOverview | null]) => {
      if (!live) return;
      if (executive) setOperations(executive);
      if (notification) setDelivery(notification);
      if (Array.isArray(history?.evidenceItems)) setEvidenceIntegrity(history.evidenceItems);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const risks = useMemo(() => rows.filter((row) => row.module === "Risk Assessment"), [rows]);
  const compliance = useMemo(() => rows.filter((row) => row.module === "Uyum"), [rows]);
  const audits = useMemo(() => rows.filter((row) => row.module === "Denetim Yönetimi"), [rows]);
  const findings = useMemo(() => rows.filter((row) => row.module === "Bulgular ve CAPA"), [rows]);
  const vendors = useMemo(() => rows.filter((row) => row.module === "Tedarikçiler"), [rows]);

  const scoredRisks = useMemo(() => risks.map((row) => ({ row, score: riskScore(row) })), [risks]);
  const riskBands = useMemo(() => ({
    critical: scoredRisks.filter((item) => riskBand(item.score) === "critical").length,
    high: scoredRisks.filter((item) => riskBand(item.score) === "high").length,
    medium: scoredRisks.filter((item) => riskBand(item.score) === "medium").length,
    low: scoredRisks.filter((item) => riskBand(item.score) === "low").length,
  }), [scoredRisks]);
  const highRisks = riskBands.critical + riskBands.high;

  const openFindings = Math.max(
    assurance.openControlFindings,
    findings.filter((row) => !isClosed(row.data.status)).length,
  );
  const overdueAudits = audits.filter((row) => {
    const due = clean(row.data.dueDate || row.data.targetDate || row.data.endDate);
    return Boolean(due) && new Date(due).getTime() < new Date().getTime() && !isClosed(row.data.status);
  }).length;
  const highRiskVendors = vendors.filter((row) => ["yüksek", "kritik", "high", "critical"].includes(normalized(row.data.riskLevel || row.data.riskRating))).length;

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
  const deliverySummary = delivery?.summary;
  const integrityPending = assurance.legacyEvidence + assurance.unavailableEvidence + assurance.integrityUnknownEvidence;
  const attentionTotal = (ops?.critical || 0) + riskBands.critical + overdueAudits + assurance.failedControlTests + integrityPending + (deliverySummary?.slaBreaches || 0);

  const riskRows: PanelRow[] = [
    { label: tr ? "Kritik" : "Critical", value: riskBands.critical, tone: "critical" },
    { label: tr ? "Yüksek" : "High", value: riskBands.high, tone: "warning" },
    { label: tr ? "Orta" : "Medium", value: riskBands.medium, tone: "neutral" },
    { label: tr ? "Düşük" : "Low", value: riskBands.low, tone: "positive" },
  ];
  const maxRiskBand = Math.max(1, ...riskRows.map((item) => item.value));

  const criticalRiskList = scoredRisks
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const decisionItems = [
    {
      value: riskBands.critical,
      label: tr ? "Kritik risk kararı" : "Critical risk decisions",
      detail: tr ? "Risk toleransı üzerindeki kayıtları incele" : "Review records above risk tolerance",
      module: "Risk Assessment",
      tone: "critical",
    },
    {
      value: ops?.openEscalations || 0,
      label: tr ? "Güvence escalation" : "Assurance escalations",
      detail: tr ? "Owner ve governance kuyruğunu temizle" : "Clear owner and governance queues",
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
      detail: tr ? "Remediation ve doğrulama akışını yönet" : "Manage remediation and verification",
      module: "Bulgular ve CAPA",
      tone: openFindings ? "critical" : "positive",
    },
  ];

  const auditorPack = () => window.open(withBasePath(`/api/continuous-assurance/auditor-pack?lang=${lang}`), "_blank", "noopener,noreferrer");

  return (
    <section className="executive-dashboard-reference" aria-label={tr ? "Fornost GRC yönetici gösterge paneli" : "Fornost GRC executive dashboard"}>
      <header className="executive-dashboard-header">
        <div>
          <small>{tr ? "YÖNETİCİ GÜVENCE MERKEZİ" : "EXECUTIVE ASSURANCE CENTER"}</small>
          <h2>{tr ? "Kurumsal risk ve güvence görünümü" : "Enterprise risk & assurance posture"}</h2>
          <p>{tr ? "Risk, uyum, sürekli güvence, denetim ve remediation durumunu tek karar ekranında yönetin." : "Manage risk, compliance, continuous assurance, audit and remediation from one decision surface."}</p>
        </div>
        <div className="executive-dashboard-header-actions">
          <button type="button" onClick={auditorPack}>{tr ? "Denetçi Paketi" : "Auditor Pack"}<span>↗</span></button>
          <button type="button" className="primary" onClick={() => go("Raporlar")}>{tr ? "Yönetim Raporu" : "Executive Report"}<span>→</span></button>
        </div>
      </header>

      <div className="executive-dashboard-kpis">
        {[
          { label: tr ? "Kontrol Kapsaması" : "Control Coverage", value: `${assurance.controlScore}%`, detail: `${assurance.healthyControls}/${assurance.totalControls} ${tr ? "sağlıklı" : "healthy"}`, tone: assurance.controlScore >= 80 ? "positive" : "warning", module: "Kontroller" },
          { label: tr ? "Denetim Hazırlığı" : "Audit Readiness", value: `${assurance.auditScore}%`, detail: `${assurance.readyAudits}/${assurance.totalAudits} ${tr ? "hazır" : "ready"}`, tone: assurance.auditScore >= 80 ? "positive" : "warning", module: "Denetim Yönetimi" },
          { label: tr ? "Açık Bulgular" : "Open Findings", value: openFindings, detail: `${assurance.failedControlTests} ${tr ? "başarısız test" : "failed tests"}`, tone: openFindings ? "critical" : "positive", module: "Bulgular ve CAPA" },
          { label: tr ? "Kanıt Güncelliği" : "Evidence Freshness", value: `${assurance.evidenceScore}%`, detail: `${assurance.currentEvidence}/${assurance.totalEvidence} ${tr ? "güncel" : "current"}`, tone: assurance.evidenceScore >= 80 ? "positive" : "warning", module: "Kanıtlar" },
          { label: tr ? "Kritik + Yüksek Risk" : "Critical + High Risk", value: highRisks, detail: `${riskBands.critical} ${tr ? "kritik" : "critical"}`, tone: highRisks ? "critical" : "positive", module: "Risk Assessment" },
          { label: tr ? "Uyum Sağlığı" : "Compliance Health", value: `${complianceScore}%`, detail: `${compliantTotal}/${complianceTotal} ${tr ? "uyumlu" : "compliant"}`, tone: complianceScore >= 80 ? "positive" : "warning", module: "Uyum" },
        ].map((metric) => (
          <button type="button" className={`executive-kpi ${metric.tone}`} key={metric.label} onClick={() => go(metric.module)}>
            <span><small>{metric.label}</small><i /></span>
            <strong>{metric.value}</strong>
            <em>{metric.detail}</em>
          </button>
        ))}
      </div>

      <button type="button" className={`executive-attention-band ${attentionTotal ? "active" : "clear"}`} onClick={() => go(attentionTotal ? "Bulgular ve CAPA" : "Bağlantılı GRC")}>
        <span className="attention-icon">!</span>
        <span className="attention-copy">
          <small>ATTENTION REQUIRED</small>
          <b>{attentionTotal ? (tr ? `${attentionTotal} öncelikli yönetim sinyali karar bekliyor` : `${attentionTotal} priority management signals need a decision`) : (tr ? "Kritik yönetim sinyali bulunmuyor" : "No critical management signals")}</b>
        </span>
        <span className="attention-breakdown">
          <em>{riskBands.critical} {tr ? "kritik risk" : "critical risk"}</em>
          <em>{ops?.critical || 0} escalation</em>
          <em>{overdueAudits} {tr ? "geciken denetim" : "overdue audit"}</em>
          <em>{integrityPending} {tr ? "kanıt doğrulama" : "evidence verification"}</em>
        </span>
        <strong>→</strong>
      </button>

      <div className="executive-dashboard-grid">
        <article className="executive-cockpit-panel risk-posture-panel">
          <header><div><small>RISK POSTURE</small><h3>{tr ? "Kurumsal risk maruziyeti" : "Enterprise risk exposure"}</h3></div><button onClick={() => go("Risk Assessment")}>{tr ? "Risk Merkezi" : "Risk Center"} →</button></header>
          <div className="risk-posture-body">
            <div className="risk-distribution">
              {riskRows.map((item) => <div key={item.label}><span><i className={item.tone} />{item.label}</span><b>{item.value}</b><em><i className={item.tone} style={{ width: `${(item.value / maxRiskBand) * 100}%` }} /></em></div>)}
            </div>
            <div className="risk-summary-dial"><strong>{risks.length}</strong><span>{tr ? "Toplam Risk" : "Total Risks"}</span><small>{highRisks} {tr ? "tolerans üzerinde" : "above tolerance"}</small></div>
          </div>
          <div className="executive-priority-list">
            {criticalRiskList.length ? criticalRiskList.map(({ row, score }) => <button type="button" key={row.id} onClick={() => go("Risk Assessment")}><span><b>{clean(row.data.title || row.data.name || row.code || row.id)}</b><small>{clean(row.data.owner || row.data.businessUnit) || (tr ? "Sahip belirtilmemiş" : "Owner not set")}</small></span><em className={riskBand(score)}>{score}</em></button>) : <p>{tr ? "Tolerans üzerinde risk bulunmuyor." : "No risks are above tolerance."}</p>}
          </div>
        </article>

        <article className="executive-cockpit-panel compliance-portfolio-panel">
          <header><div><small>COMPLIANCE PORTFOLIO</small><h3>{tr ? "Framework uygulama görünümü" : "Framework implementation posture"}</h3></div><button onClick={() => go("Uyum")}>{tr ? "Uyum Merkezi" : "Compliance"} →</button></header>
          <div className="compliance-score-strip"><strong>{complianceScore}%</strong><span>{tr ? "Toplam uyum sağlığı" : "Overall compliance health"}<small>{compliantTotal}/{complianceTotal} {tr ? "uyumlu gereksinim" : "compliant requirements"}</small></span></div>
          <div className="compliance-framework-list">
            {complianceStats.length ? complianceStats.map((item) => <button type="button" key={item.name} onClick={() => go("Uyum")}><span><b>{item.name}</b><small>{item.total} {tr ? "gereksinim" : "requirements"}</small></span><strong>{item.score}%</strong><MiniBar value={item.score} tone={item.score >= 80 ? "positive" : item.score >= 60 ? "warning" : "critical"} /></button>) : <p>{tr ? "Henüz framework/uyum kaydı bulunmuyor." : "No framework/compliance records yet."}</p>}
          </div>
        </article>

        <article className="executive-cockpit-panel continuous-assurance-panel">
          <header><div><small>CONTINUOUS ASSURANCE</small><h3>{tr ? "Kontrol ve kanıt güveni" : "Control & evidence confidence"}</h3></div><button onClick={() => go("Kanıt Otomasyonu")}>{tr ? "Operasyon" : "Operations"} →</button></header>
          <div className="assurance-score-row">
            <div><strong>{assurance.score}</strong><span>/100</span><small>{tr ? "Bütünleşik Güvence" : "Composite Assurance"}</small></div>
            <div className="assurance-score-bars">
              <label><span>{tr ? "Zincir bütünlüğü" : "Chain integrity"}<b>{assurance.traceabilityScore}%</b></span><MiniBar value={assurance.traceabilityScore} tone={assurance.traceabilityScore >= 80 ? "positive" : "warning"} /></label>
              <label><span>{tr ? "Kontrol güvencesi" : "Control assurance"}<b>{assurance.controlScore}%</b></span><MiniBar value={assurance.controlScore} tone={assurance.controlScore >= 80 ? "positive" : "warning"} /></label>
              <label><span>{tr ? "Kanıt güveni" : "Evidence confidence"}<b>{assurance.evidenceScore}%</b></span><MiniBar value={assurance.evidenceScore} tone={assurance.evidenceScore >= 80 ? "positive" : "warning"} /></label>
            </div>
          </div>
          <div className="continuous-assurance-signals">
            <button type="button" onClick={() => go("Kanıt Otomasyonu")} className={(ops?.critical || 0) ? "critical" : ""}><small>{tr ? "Açık Escalation" : "Open Escalations"}</small><b>{ops?.openEscalations || 0}</b><span>{ops?.critical || 0} C · {ops?.high || 0} H</span></button>
            <button type="button" onClick={() => go("Kanıtlar")} className={integrityPending ? "warning" : ""}><small>{tr ? "Doğrulama Bekleyen" : "Awaiting Verification"}</small><b>{integrityPending}</b><span>{assurance.brokenEvidence} {tr ? "bozuk zincir" : "broken chain"}</span></button>
            <button type="button" onClick={() => go("Kontroller")} className={assurance.failedControlTests ? "critical" : ""}><small>{tr ? "Kontrol Testleri" : "Control Tests"}</small><b>{assurance.failedControlTests + assurance.overdueControlTests}</b><span>{assurance.failedControlTests} {tr ? "başarısız" : "failed"}</span></button>
          </div>
        </article>

        <article className="executive-cockpit-panel audit-remediation-panel">
          <header><div><small>AUDIT &amp; REMEDIATION</small><h3>{tr ? "Denetim ve kapanış görünümü" : "Audit & closure posture"}</h3></div><button onClick={() => go("Denetim Yönetimi")}>{tr ? "Denetimler" : "Audits"} →</button></header>
          <div className="audit-remediation-metrics">
            <button type="button" onClick={() => go("Denetim Yönetimi")}><small>{tr ? "Hazır Denetim" : "Ready Audits"}</small><strong>{assurance.readyAudits}/{assurance.totalAudits}</strong><MiniBar value={assurance.auditScore} tone={assurance.auditScore >= 80 ? "positive" : "warning"} /></button>
            <button type="button" onClick={() => go("Bulgular ve CAPA")} className={openFindings ? "critical" : ""}><small>{tr ? "Açık Bulgu" : "Open Findings"}</small><strong>{openFindings}</strong><span>{tr ? "Remediation takibi" : "Remediation tracking"}</span></button>
            <button type="button" onClick={() => go("Denetim Yönetimi")} className={overdueAudits ? "warning" : ""}><small>{tr ? "Geciken" : "Overdue"}</small><strong>{overdueAudits}</strong><span>{tr ? "Hedef tarihi geçmiş" : "Past target date"}</span></button>
            <button type="button" onClick={() => go("Tedarikçiler")} className={highRiskVendors ? "warning" : ""}><small>{tr ? "Yüksek Riskli Tedarikçi" : "High-risk Vendors"}</small><strong>{highRiskVendors}</strong><span>{tr ? "TPRM kararı" : "TPRM decision"}</span></button>
          </div>
          <div className="delivery-health"><span><small>{tr ? "Bildirim delivery" : "Notification delivery"}</small><b>{deliverySummary?.deliveryRate30d ?? 0}%</b></span><MiniBar value={deliverySummary?.deliveryRate30d ?? 0} tone={(deliverySummary?.deliveryRate30d ?? 0) >= 95 ? "positive" : "warning"} /><em>{deliverySummary?.slaBreaches || 0} SLA {tr ? "ihlali" : "breaches"}</em></div>
        </article>
      </div>

      <section className="executive-decision-board">
        <header><div><small>EXECUTIVE DECISION BOARD</small><h3>{tr ? "Bugün yönetim kararı gerektiren işler" : "Items requiring management decisions today"}</h3></div><span>{decisionItems.reduce((sum, item) => sum + item.value, 0)} {tr ? "açık sinyal" : "open signals"}</span></header>
        <div>{decisionItems.map((item) => <button type="button" key={item.label} onClick={() => go(item.module)} className={item.tone}><strong>{item.value}</strong><span><b>{item.label}</b><small>{item.detail}</small></span><em>→</em></button>)}</div>
      </section>

      <footer className="executive-dashboard-footer"><span>{tr ? "Canlı GRC verisinden hesaplanır" : "Calculated from live GRC data"}</span><span>{assurance.totalControls} {tr ? "kontrol" : "controls"} · {assurance.totalEvidence} {tr ? "kanıt" : "evidence"} · {risks.length} {tr ? "risk" : "risks"} · {compliance.length} {tr ? "uyum maddesi" : "compliance requirements"}</span></footer>
    </section>
  );
}
