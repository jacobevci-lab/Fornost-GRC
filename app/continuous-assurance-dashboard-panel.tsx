"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import EvidenceHistoryPanel from "./evidence-history-panel";
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
type ReviewDraft = { item: Priority; decision: "approve" | "reject"; note: string };

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
  currentUser,
  onOpenModule,
}: {
  lang: Lang;
  currentUser?: { role: string };
  onOpenModule?: (module: string) => void;
}) {
  const tr = lang === "tr";
  const role = currentUser?.role || "Viewer";
  const canReview = role === "Admin";
  const canRunRetest = role === "Admin" || role === "Editor";
  const [dashboard, setDashboard] = useState<Dashboard>({ summary: emptySummary, priorities: [], generatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<"all" | "governance" | "controls" | "remediation">("all");
  const [review, setReview] = useState<ReviewDraft | null>(null);

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

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    fetch(withBasePath("/api/continuous-assurance/dashboard"), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as Dashboard & { error?: string };
        if (!response.ok) throw new Error(body.error || (tr ? "Güvence özeti alınamadı." : "Unable to load assurance dashboard."));
        return body;
      })
      .then((body) => {
        if (!live) return;
        setDashboard(body);
        setError("");
      })
      .catch((cause) => {
        if (!live || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : (tr ? "Güvence özeti alınamadı." : "Unable to load assurance dashboard."));
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [tr]);

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

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!review) return;
    if (review.decision === "reject" && review.note.trim().length < 10) {
      setMessage(tr ? "Ret kararı için en az 10 karakter açıklama girin." : "Enter at least 10 characters for a rejection reason.");
      return;
    }
    const workItemId = review.item.id.replace(/^work:/, "");
    setBusy(`review:${workItemId}`);
    setMessage("");
    try {
      const response = await fetch(withBasePath("/api/continuous-assurance"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review-work-item", workItemId, decision: review.decision, note: review.note.trim() }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || (tr ? "Güvence kararı uygulanamadı." : "Unable to apply assurance decision."));
      setMessage(body.message || (review.decision === "approve" ? (tr ? "Güvence işi onaylandı." : "Assurance work approved.") : (tr ? "Güvence işi reddedildi." : "Assurance work rejected.")));
      setReview(null);
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : (tr ? "Güvence kararı uygulanamadı." : "Unable to apply assurance decision."));
    } finally {
      setBusy("");
    }
  }

  async function runRetest(item: Priority) {
    if (!item.ruleId) return;
    setBusy(`retest:${item.id}`);
    setMessage("");
    try {
      const response = await fetch(withBasePath("/api/evidence-automation"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run-rule", ruleId: item.ruleId }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error || (tr ? "Yeniden test çalıştırılamadı." : "Unable to run retest."));
      setMessage(body.message || (tr ? "Kontrol yeniden testi çalıştırıldı." : "Control retest executed."));
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : (tr ? "Yeniden test çalıştırılamadı." : "Unable to run retest."));
    } finally {
      setBusy("");
    }
  }

  return <section className="ca-dashboard" aria-label={tr ? "Sürekli güvence merkezi" : "Continuous Assurance center"}>
    <header className="ca-dashboard-head">
      <div>
        <small>CONNECTED GRC · CONTINUOUS ASSURANCE</small>
        <h3>{tr ? "Sürekli Güvence Merkezi" : "Continuous Assurance Center"}</h3>
        <p>{tr ? "Kontrol sağlığı, kanıt tazeliği, CAPA yönetişimi, yeniden test ve düzeltme borcunu tek aksiyon kuyruğunda birleştirir." : "Unifies control health, evidence freshness, CAPA governance, retest and remediation debt in one action queue."}</p>
      </div>
      <div className={`ca-score ${scoreState}`}><strong>{dashboard.summary.assuranceCoverage}<sup>%</sup></strong><span>{tr ? "güvence kapsaması" : "assurance coverage"}</span></div>
    </header>

    {error && <div className="ca-error"><span>{error}</span><button type="button" onClick={() => void load()}>{tr ? "Tekrar dene" : "Retry"}</button></div>}
    {message && <div className="ca-message" role="status"><span>{message}</span><button type="button" aria-label={tr ? "Mesajı kapat" : "Dismiss message"} onClick={() => setMessage("")}>×</button></div>}

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
        <div className="ca-actions">
          {item.kind === "work-item" && item.state === "pending-review" && canReview && <>
            <button type="button" className="approve" disabled={!!busy} onClick={() => setReview({ item, decision: "approve", note: "" })}>{tr ? "Onayla" : "Approve"}</button>
            <button type="button" className="reject" disabled={!!busy} onClick={() => setReview({ item, decision: "reject", note: "" })}>{tr ? "Reddet" : "Reject"}</button>
          </>}
          {item.kind === "work-item" && item.state === "approved-awaiting-retest" && canRunRetest && <button type="button" className="approve" disabled={!!busy} onClick={() => void runRetest(item)}>{busy === `retest:${item.id}` ? "…" : (tr ? "Yeniden testi çalıştır" : "Run retest")}</button>}
          {onOpenModule && <button type="button" className="ca-open" onClick={() => open(item)}>{tr ? "Kayda git" : "Open record"}<span>→</span></button>}
        </div>
      </article>) : <div className="ca-empty"><b>{tr ? "Aksiyon bekleyen güvence işi yok." : "No assurance work requires action."}</b><span>{tr ? "Kontrol, kanıt ve düzeltme sağlığı izlenmeye devam ediyor." : "Control, evidence and remediation health remain monitored."}</span></div>}
    </div>

    <EvidenceHistoryPanel lang={lang} currentUser={currentUser} />

    {review && <div className="ca-overlay" onMouseDown={() => !busy && setReview(null)}>
      <form className="ca-review-modal" onSubmit={submitReview} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>{tr ? "MAKER-CHECKER YÖNETİŞİMİ" : "MAKER-CHECKER GOVERNANCE"}</small><h4>{review.decision === "approve" ? (tr ? "Güvence işini onayla" : "Approve assurance work") : (tr ? "Güvence işini reddet" : "Reject assurance work")}</h4></div><button type="button" aria-label={tr ? "Pencereyi kapat" : "Close dialog"} onClick={() => setReview(null)}>×</button></header>
        <div className="ca-review-context"><b>{review.item.targetControlRef || review.item.ruleName}</b><span>{review.item.title}</span><small>{stateLabel(review.item.state, tr)}</small></div>
        <label>{review.decision === "reject" ? (tr ? "Ret gerekçesi" : "Rejection reason") : (tr ? "Reviewer notu" : "Reviewer note")}<textarea required={review.decision === "reject"} minLength={review.decision === "reject" ? 10 : undefined} value={review.note} onChange={(event) => setReview({ ...review, note: event.target.value })} placeholder={review.decision === "reject" ? (tr ? "En az 10 karakter açıklama…" : "At least 10 characters…") : (tr ? "Opsiyonel onay notu…" : "Optional approval note…")} /></label>
        <p>{tr ? "Sunucu maker-checker kuralını tekrar doğrular; işi kuyruğa alan kullanıcı kendi kaydını onaylayamaz." : "The server revalidates maker-checker separation; the queue actor cannot approve their own item."}</p>
        <footer><button type="button" onClick={() => setReview(null)} disabled={!!busy}>{tr ? "Vazgeç" : "Cancel"}</button><button type="submit" className={review.decision === "reject" ? "reject" : "approve"} disabled={!!busy}>{busy ? "…" : review.decision === "approve" ? (tr ? "Onayı uygula" : "Apply approval") : (tr ? "Reddet" : "Reject")}</button></footer>
      </form>
    </div>}
  </section>;
}

function Metric({ value, total, label, danger = false }: { value: number; total?: number; label: string; danger?: boolean }) {
  return <div className={danger ? "danger" : ""}><strong>{value}{typeof total === "number" && <sup>/{total}</sup>}</strong><span>{label}</span></div>;
}
