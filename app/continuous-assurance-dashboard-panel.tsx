"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import "./continuous-assurance-dashboard.css";

type Lang = "tr" | "en";
type Summary = {
  totalControls: number;
  healthy: number;
  failing: number;
  stale: number;
  expiring: number;
  due: number;
  openFindings: number;
  overdueRemediation: number;
  pendingReview: number;
  awaitingRetest: number;
  failedRetest: number;
  assuranceCoverage: number;
};
type Priority = {
  id: string;
  kind: "control" | "finding" | "work-item";
  priority: number;
  state: string;
  title: string;
  ruleId: string;
  ruleName: string;
  findingId: string;
  targetControlRef: string;
  owner: string;
  dueDate: string;
  reason: string;
  updatedAt: string;
};
type Dashboard = {
  summary: Summary;
  priorities: Priority[];
  generatedAt: string;
  dataQuality?: { rulesAvailable: boolean; findingsAvailable: boolean; workQueueAvailable: boolean };
};

const emptySummary: Summary = {
  totalControls: 0, healthy: 0, failing: 0, stale: 0, expiring: 0, due: 0,
  openFindings: 0, overdueRemediation: 0, pendingReview: 0, awaitingRetest: 0,
  failedRetest: 0, assuranceCoverage: 100,
};

function stateLabel(value: string, tr: boolean) {
  const labels: Record<string, [string, string]> = {
    healthy: ["Sağlıklı", "Healthy"], failing: ["Başarısız", "Failing"], stale: ["Kanıt eski", "Stale evidence"],
    missing: ["Kanıt eksik", "Missing evidence"], expiring: ["Kanıt süresi doluyor", "Evidence expiring"],
    "pending-review": ["İnceleme bekliyor", "Pending review"], "approved-awaiting-retest": ["Yeniden test bekliyor", "Awaiting retest"],
    "failed-retest": ["Yeniden test başarısız", "Retest failed"], "retest-error": ["Yeniden test hatası", "Retest error"],
    "overdue-remediation": ["Düzeltme gecikmiş", "Remediation overdue"], acknowledged: ["Sahiplenildi", "Acknowledged"], open: ["Açık", "Open"],
  };
  return labels[value]?.[tr ? 0 : 1] || value;
}

export default function ContinuousAssuranceDashboardPanel({
  lang,
  onOpenModule,
}: {
  lang: Lang;
  currentUser?: { role: string };
  onOpenModule?: (module: string) => void;
}) {
  const tr = lang === "tr";
  const [dashboard, setDashboard] = useState<Dashboard>({ summary: emptySummary, priorities: [], generatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "governance" | "controls" | "remediation">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(withBasePath("/api/continuous-assurance/dashboard"), { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as Dashboard & { error?: string };
      if (!response.ok) throw new Error(body.error || (tr ? "Güvence özeti alınamadı." : "Unable to load assurance dashboard."));
      setDashboard(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (tr ? "Güvence özeti alınamadı." : "Unable to load assurance dashboard."));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => { void load(); }, [load]);

  const priorities = useMemo(() => dashboard.priorities.filter((item) => {
    if (filter === "all") return true;
    if (filter === "governance") return item.kind === "work-item";
    if (filter === "controls") return item.kind === "control";
    return item.kind === "finding" || item.state === "overdue-remediation";
  }).slice(0, 30), [dashboard.priorities, filter]);

  const scoreState = dashboard.summary.assuranceCoverage >= 85 ? "healthy" : dashboard.summary.assuranceCoverage >= 65 ? "attention" : "critical";
  const open = (item: Priority) => {
    if (!onOpenModule) return;
    if (item.kind === "control") onOpenModule("Kanıt Otomasyonu");
    else if (item.kind === "finding") onOpenModule("Bulgular ve CAPA");
    else onOpenModule(item.reason.includes("retest") ? "Kanıt Otomasyonu" : "Bulgular ve CAPA");
  };

  return <section className="ca-dashboard" aria-label={tr ? "Sürekli güvence merkezi" : "Continuous Assurance center"}>
    <header className="ca-dashboard-head">
      <div>
        <small>{tr ? "CONNECTED GRC · CONTINUOUS ASSURANCE" : "CONNECTED GRC · CONTINUOUS ASSURANCE"}</small>
        <h3>{tr ? "Sürekli Güvence Merkezi" : "Continuous Assurance Center"}</h3>
        <p>{tr ? "Kontrol sağlığı, kanıt tazeliği, CAPA yönetişimi, yeniden test ve düzeltme borcunu tek aksiyon kuyruğunda birleştirir." : "Unifies control health, evidence freshness, CAPA governance, retest and remediation debt in one action queue."}</p>
      </div>
      <div className={`ca-score ${scoreState}`}><strong>{dashboard.summary.assuranceCoverage}<sup>%</sup></strong><span>{tr ? "güvence kapsaması" : "assurance coverage"}</span></div>
    </header>

    {error && <div className="ca-error"><span>{error}</span><button type="button" onClick={() => void load()}>{tr ? "Tekrar dene" : "Retry"}</button></div>}

    <div className="ca-metrics">
      <Metric value={dashboard.summary.healthy} total={dashboard.summary.totalControls} label={tr ? "Sağlıklı kontrol" : "Healthy controls"} />
      <Metric value={dashboard.summary.failing} label={tr ? "Başarısız kontrol" : "Failing controls"} danger={dashboard.summary.failing > 0} />
      <Metric value={dashboard.summary.stale} label={tr ? "Eski / eksik kanıt" : "Stale / missing evidence"} danger={dashboard.summary.stale > 0} />
      <Metric value={dashboard.summary.pendingReview} label={tr ? "İnceleme bekleyen" : "Pending review"} />
      <Metric value={dashboard.summary.awaitingRetest} label={tr ? "Yeniden test bekleyen" : "Awaiting retest"} />
      <Metric value={dashboard.summary.overdueRemediation} label={tr ? "Geciken düzeltme" : "Overdue remediation"} danger={dashboard.summary.overdueRemediation > 0} />
    </div>

    <div className="ca-work-head">
      <div><small>{tr ? "ÖNCELİKLİ İŞ KUYRUĞU" : "PRIORITY WORK QUEUE"}</small><h4>{tr ? "İnsan aksiyonu gereken güvence işleri" : "Assurance work requiring human action"}</h4></div>
      <div className="ca-filter" role="group" aria-label={tr ? "Kuyruk filtresi" : "Queue filter"}>
        {(["all", "governance", "controls", "remediation"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? (tr ? "Tümü" : "All") : value === "governance" ? (tr ? "Yönetişim" : "Governance") : value === "controls" ? (tr ? "Kontroller" : "Controls") : (tr ? "Düzeltme" : "Remediation")}</button>)}
        <button type="button" className="refresh" onClick={() => void load()} disabled={loading}>{loading ? "…" : "↻"}</button>
      </div>
    </div>

    <div className="ca-work-list">
      {priorities.length ? priorities.map((item) => <article key={item.id} className={`ca-work-item ${item.state}`}>
        <div className="ca-priority"><b>{item.priority}</b><span>{tr ? "öncelik" : "priority"}</span></div>
        <div className="ca-work-copy">
          <div><span className="ca-state">{stateLabel(item.state, tr)}</span>{item.targetControlRef && <b>{item.targetControlRef}</b>}</div>
          <h5>{item.title}</h5>
          <p>{item.ruleName}{item.owner ? ` · ${item.owner}` : ""}</p>
        </div>
        <div className="ca-work-meta">
          <span><b>{item.kind === "work-item" ? (tr ? "Yönetişim" : "Governance") : item.kind === "finding" ? "CAPA" : (tr ? "Kontrol" : "Control")}</b>{tr ? "iş türü" : "work type"}</span>
          <span><b>{item.dueDate || "—"}</b>{tr ? "termin / çalışma" : "due / run"}</span>
          <span><b>{item.reason}</b>{tr ? "neden" : "reason"}</span>
        </div>
        {onOpenModule && <button type="button" className="ca-open" onClick={() => open(item)}>{tr ? "Kayda git" : "Open record"}<span>→</span></button>}
      </article>) : <div className="ca-empty"><b>{tr ? "Aksiyon bekleyen güvence işi yok." : "No assurance work requires action."}</b><span>{tr ? "Kontrol, kanıt ve düzeltme sağlığı izlenmeye devam ediyor." : "Control, evidence and remediation health remain monitored."}</span></div>}
    </div>
  </section>;
}

function Metric({ value, total, label, danger = false }: { value: number; total?: number; label: string; danger?: boolean }) {
  return <div className={danger ? "danger" : ""}><strong>{value}{typeof total === "number" && <sup>/{total}</sup>}</strong><span>{label}</span></div>;
}
