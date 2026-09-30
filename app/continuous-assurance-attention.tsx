"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import {
  capaGovernanceState,
  selectCapaWorkItem,
  type CapaGovernanceState,
  type CapaWorkItem,
} from "./continuous-assurance-attention-state";
import { navigateToFornost } from "./navigation-focus";
import "./continuous-assurance-attention.css";

type Lang = "tr" | "en";
type InsightState = "healthy" | "watch" | "critical" | "idle";
type InsightCode = "connector-errors" | "control-health" | "evidence-gap" | "due-backlog" | "no-active-rules";
type Insight = {
  sourceId?: string;
  sourceName?: string;
  vendor?: string;
  category?: string;
  state?: InsightState;
  code?: InsightCode;
  affectedRules?: number;
  evidenceGap?: number;
  dueRules?: number;
  errorRuns24h?: number;
  successRate24h?: number | null;
};
type InsightPayload = {
  available?: boolean;
  generatedAt?: string;
  state?: InsightState | "unknown";
  summary?: {
    enabledSources?: number;
    operationalRules?: number;
    healthyConnectors?: number;
    watchConnectors?: number;
    criticalConnectors?: number;
    idleConnectors?: number;
    attentionConnectors?: number;
    evidenceGapRules?: number;
    dueRules?: number;
    errorRuns24h?: number;
  } | null;
  insights?: Insight[];
};
type Source = { id?: string; name?: string; vendor?: string; enabled?: boolean };
type Rule = {
  id?: string;
  sourceId?: string;
  enabled?: boolean;
  controlRefs?: string;
  health?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastEvidenceAt?: string;
};
type Run = { ruleId?: string; status?: string; evidenceId?: string; createdAt?: string };
type Finding = {
  id?: string;
  ruleId?: string;
  evidenceId?: string;
  title?: string;
  severity?: string;
  owner?: string;
  dueDate?: string;
  detail?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
};
type AutomationPayload = { sources?: Source[]; rules?: Rule[]; runs?: Run[]; findings?: Finding[] };
type WorkPayload = { items?: CapaWorkItem[] };
type Chain = { sourceId: string; ruleId: string; controlRef: string; controlRefs: string[]; evidenceRef: string; findingRef: string };
type GovernanceForm = {
  findingId: string;
  reviewer: string;
  owner: string;
  dueDate: string;
  targetControlRef: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
};
type GovernanceNotice = { findingId: string; tone: "success" | "error"; message: string };

const clean = (value: unknown) => String(value ?? "").trim();
const timestamp = (value: unknown) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
};
const splitRefs = (value: unknown) => clean(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);
const chainKey = (sourceId: string, code: unknown) => `${sourceId}:${clean(code)}`;

function reasonCopy(insight: Insight, tr: boolean) {
  const affected = Number(insight.affectedRules || 0);
  const evidenceGap = Number(insight.evidenceGap || 0);
  const due = Number(insight.dueRules || 0);
  const errors = Number(insight.errorRuns24h || 0);
  switch (insight.code) {
    case "connector-errors":
      return {
        title: tr ? "Connector çalışma hatası" : "Connector execution error",
        detail: tr ? `Son 24 saatte ${errors} connector çalıştırma hatası oluştu.` : `${errors} connector execution error(s) were recorded in the last 24 hours.`,
      };
    case "control-health":
      return {
        title: tr ? "Continuous Control dikkat istiyor" : "Continuous controls need attention",
        detail: tr ? `${affected} aktif kural failing, stale veya missing durumda.` : `${affected} active rule(s) are failing, stale, or missing.`,
      };
    case "evidence-gap":
      return {
        title: tr ? "Kanıt kapsamı eksik" : "Evidence coverage is incomplete",
        detail: tr ? `${evidenceGap} aktif kural için henüz güncel kanıt yok.` : `${evidenceGap} active rule(s) do not yet have current evidence.`,
      };
    case "due-backlog":
      return {
        title: tr ? "Çalıştırılması gereken kontroller var" : "Continuous controls are due",
        detail: tr ? `${due} aktif kural çalışma zamanını geçti veya şimdi çalışmalı.` : `${due} active rule(s) are due for execution.`,
      };
    default:
      return {
        title: tr ? "Aktif Continuous Control Rule yok" : "No active continuous control",
        detail: tr ? "Connector etkin ancak aktif Continuous Control Rule bağlı değil." : "The connector is enabled but no active Continuous Control Rule is attached.",
      };
  }
}

function governanceCopy(state: CapaGovernanceState, tr: boolean) {
  if (state === "pending-review") return tr ? "CAPA review bekliyor" : "CAPA review pending";
  if (state === "completed") return tr ? "CAPA oluşturuldu" : "CAPA promoted";
  if (state === "rejected") return tr ? "CAPA review reddedildi" : "CAPA review rejected";
  if (state === "ready") return tr ? "Governance review hazır" : "Ready for governance review";
  if (state === "unavailable") return tr ? "Governance durumu alınamadı" : "Governance state unavailable";
  if (state === "not-applicable") return tr ? "Teknik bulgu oluşmadı" : "No technical finding yet";
  return tr ? "Governance durumu izleniyor" : "Governance state monitored";
}

function candidateReasons(payload: Record<string, unknown>, tr: boolean) {
  const candidate = payload.candidate && typeof payload.candidate === "object" ? payload.candidate as { reasons?: unknown[] } : null;
  const reasons = Array.isArray(candidate?.reasons) ? candidate?.reasons.map(clean).filter(Boolean) : [];
  const labels: Record<string, [string, string]> = {
    "automation-finding-reference-required": ["Otomasyon bulgu referansı eksik", "Automation finding reference is missing"],
    "automation-rule-reference-required": ["Otomasyon kural referansı eksik", "Automation rule reference is missing"],
    "control-link-required": ["Kontrol bağlantısı eksik", "Control link is missing"],
    "risk-link-required": ["Risk bağlantısı eksik", "Risk link is missing"],
    "origin-evidence-integrity-required": ["Kaynak kanıt bütünlük hash'i eksik", "Origin evidence integrity hash is missing"],
    "independent-reviewer-required": ["Bağımsız reviewer zorunlu", "Independent reviewer is required"],
    "maker-checker-separation-required": ["Owner ve reviewer farklı olmalı", "Owner and reviewer must be different"],
  };
  return reasons.map((reason) => labels[reason]?.[tr ? 0 : 1] || reason).join(" · ");
}

export default function ContinuousAssuranceAttention({ lang }: { lang: Lang }) {
  const tr = lang === "tr";
  const [insights, setInsights] = useState<InsightPayload | null>(null);
  const [automation, setAutomation] = useState<AutomationPayload>({});
  const [workItems, setWorkItems] = useState<CapaWorkItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [governanceAvailable, setGovernanceAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeGovernanceFinding, setActiveGovernanceFinding] = useState("");
  const [governanceForm, setGovernanceForm] = useState<GovernanceForm | null>(null);
  const [submittingFinding, setSubmittingFinding] = useState("");
  const [governanceNotice, setGovernanceNotice] = useState<GovernanceNotice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insightResponse, automationResponse, workResponse] = await Promise.all([
        fetch(withBasePath("/api/evidence-automation/operations-insights"), { cache: "no-store" }),
        fetch(withBasePath("/api/evidence-automation"), { cache: "no-store" }),
        fetch(withBasePath("/api/continuous-assurance"), { cache: "no-store", headers: { accept: "application/json" } }),
      ]);

      if (workResponse.ok) {
        const workPayload = await workResponse.json() as WorkPayload;
        setWorkItems(Array.isArray(workPayload.items) ? workPayload.items : []);
        setGovernanceAvailable(true);
      } else {
        setWorkItems([]);
        setGovernanceAvailable(false);
      }

      if (!insightResponse.ok || !automationResponse.ok) {
        setAvailable(false);
        setInsights(null);
        return;
      }
      const insightPayload = await insightResponse.json() as InsightPayload;
      const automationPayload = await automationResponse.json() as AutomationPayload;
      if (insightPayload.available === false) {
        setAvailable(false);
        setInsights(insightPayload);
        return;
      }
      setAutomation(automationPayload);
      setInsights(insightPayload);
      setAvailable(true);
    } catch {
      setAvailable(false);
      setGovernanceAvailable(false);
      setInsights(null);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const findingById = useMemo(() => {
    const map = new Map<string, Finding>();
    for (const finding of automation.findings || []) {
      const id = clean(finding.id);
      if (id) map.set(id, finding);
    }
    return map;
  }, [automation.findings]);

  const chainByInsight = useMemo(() => {
    const sources = automation.sources || [];
    const rules = automation.rules || [];
    const runs = automation.runs || [];
    const findings = automation.findings || [];
    const insightRows = insights?.insights || [];
    const snapshotNow = timestamp(insights?.generatedAt);
    const chains = new Map<string, Chain>();

    for (const insight of insightRows) {
      const sourceId = clean(insight.sourceId);
      if (!sourceId || chains.has(chainKey(sourceId, insight.code))) continue;
      const source = sources.find((item) => clean(item.id) === sourceId);
      const activeRules = source?.enabled
        ? rules.filter((rule) => rule.enabled && clean(rule.sourceId) === sourceId)
        : [];
      const activeRuleIds = new Set(activeRules.map((rule) => clean(rule.id)).filter(Boolean));
      const latestActiveRule = [...activeRules].sort((a, b) => timestamp(b.lastRunAt) - timestamp(a.lastRunAt))[0];
      const latestErrorRun = runs
        .filter((run) => clean(run.status) === "error" && activeRuleIds.has(clean(run.ruleId)))
        .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))[0];
      const unhealthyRule = [...activeRules]
        .filter((rule) => ["failing", "stale", "missing"].includes(clean(rule.health)))
        .sort((a, b) => timestamp(b.lastRunAt) - timestamp(a.lastRunAt))[0];
      const evidenceGapRule = [...activeRules]
        .filter((rule) => !clean(rule.lastEvidenceAt))
        .sort((a, b) => timestamp(b.lastRunAt) - timestamp(a.lastRunAt))[0];
      const dueRule = [...activeRules]
        .filter((rule) => !clean(rule.nextRunAt) || (snapshotNow > 0 && timestamp(rule.nextRunAt) > 0 && timestamp(rule.nextRunAt) <= snapshotNow))
        .sort((a, b) => timestamp(a.nextRunAt) - timestamp(b.nextRunAt))[0];

      const preferredRuleId = insight.code === "connector-errors"
        ? clean(latestErrorRun?.ruleId)
        : insight.code === "control-health"
          ? clean(unhealthyRule?.id)
          : insight.code === "evidence-gap"
            ? clean(evidenceGapRule?.id)
            : insight.code === "due-backlog"
              ? clean(dueRule?.id)
              : "";
      const focusRule = activeRules.find((rule) => clean(rule.id) === preferredRuleId) || (insight.code === "no-active-rules" ? undefined : latestActiveRule);
      const ruleId = clean(focusRule?.id);
      const latestFinding = findings
        .filter((finding) => ruleId && clean(finding.ruleId) === ruleId && clean(finding.status) !== "closed")
        .sort((a, b) => timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt))[0];
      const latestRun = runs
        .filter((run) => ruleId && clean(run.ruleId) === ruleId)
        .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))[0];
      const controlRefs = splitRefs(focusRule?.controlRefs);
      chains.set(chainKey(sourceId, insight.code), {
        sourceId,
        ruleId,
        controlRef: splitRefs(focusRule?.controlRefs)[0] || "",
        controlRefs,
        evidenceRef: latestFinding ? clean(latestFinding.evidenceId) : clean(latestRun?.evidenceId),
        findingRef: clean(latestFinding?.id),
      });
    }
    return chains;
  }, [automation, insights]);

  const attention = useMemo(() => (insights?.insights || []).filter((item) => item.state !== "healthy"), [insights]);
  const summary = insights?.summary;

  function openAutomationRef(kind: "source" | "rule" | "finding", id: string) {
    const ref = clean(id);
    if (!ref) return;
    const filter: Record<string, string> = kind === "source" ? { sourceRef: ref } : kind === "rule" ? { ruleRef: ref } : { findingRef: ref };
    navigateToFornost({ module: "Kanıt Otomasyonu", ref, kind, source: "continuous-assurance-attention", filter });
  }

  function openControl(id: string) {
    const controlRef = clean(id);
    if (!controlRef) return;
    navigateToFornost({ module: "Kontroller", ref: controlRef, kind: "control", source: "continuous-assurance-attention", filter: { controlRef } });
  }

  function openEvidence(id: string) {
    const evidenceRef = clean(id);
    if (!evidenceRef) return;
    navigateToFornost({ module: "Kanıtlar", ref: evidenceRef, kind: "evidence", source: "continuous-assurance-attention", filter: { evidenceRef } });
  }

  function openEnterpriseFinding(id: string) {
    const findingRef = clean(id);
    if (!findingRef) return;
    navigateToFornost({ module: "Bulgular ve CAPA", ref: findingRef, kind: "finding", source: "continuous-assurance-attention", filter: { findingRef } });
  }

  function startGovernance(chain: Chain) {
    if (!chain.findingRef || !governanceAvailable) return;
    const finding = findingById.get(chain.findingRef);
    setActiveGovernanceFinding(chain.findingRef);
    setGovernanceNotice(null);
    setGovernanceForm({
      findingId: chain.findingRef,
      reviewer: "",
      owner: clean(finding?.owner),
      dueDate: clean(finding?.dueDate),
      targetControlRef: chain.controlRefs.length === 1 ? chain.controlRefs[0] : "",
      rootCause: "",
      correctiveAction: "",
      preventiveAction: "",
    });
  }

  function closeGovernance() {
    if (submittingFinding) return;
    setActiveGovernanceFinding("");
    setGovernanceForm(null);
  }

  async function queueCapa(chain: Chain) {
    const form = governanceForm;
    if (!form || form.findingId !== chain.findingRef) return;
    const required = [form.reviewer, form.owner, form.dueDate, form.targetControlRef, form.rootCause, form.correctiveAction, form.preventiveAction].every((value) => clean(value));
    if (!required) {
      setGovernanceNotice({ findingId: form.findingId, tone: "error", message: tr ? "Reviewer, owner, tarih, hedef kontrol, kök neden ve CAPA aksiyonları zorunludur." : "Reviewer, owner, due date, target control, root cause and CAPA actions are required." });
      return;
    }
    if (clean(form.reviewer).toLowerCase() === clean(form.owner).toLowerCase()) {
      setGovernanceNotice({ findingId: form.findingId, tone: "error", message: tr ? "Maker-checker için owner ve reviewer farklı olmalıdır." : "Owner and reviewer must be different for maker-checker separation." });
      return;
    }

    setSubmittingFinding(form.findingId);
    setGovernanceNotice(null);
    try {
      const response = await fetch(withBasePath("/api/continuous-assurance"), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          action: "queue-capa-promotion",
          findingId: form.findingId,
          reviewer: form.reviewer,
          owner: form.owner,
          dueDate: form.dueDate,
          targetControlRef: form.targetControlRef,
          rootCause: form.rootCause,
          correctiveAction: form.correctiveAction,
          preventiveAction: form.preventiveAction,
        }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const reasons = candidateReasons(payload, tr);
        const message = clean(payload.error) || (tr ? "CAPA governance işi oluşturulamadı." : "CAPA governance work item could not be created.");
        setGovernanceNotice({ findingId: form.findingId, tone: "error", message: reasons ? `${message} ${reasons}` : message });
        return;
      }
      setActiveGovernanceFinding("");
      setGovernanceForm(null);
      setGovernanceNotice({ findingId: form.findingId, tone: "success", message: clean(payload.message) || (tr ? "CAPA governance işi review kuyruğuna alındı." : "CAPA governance work item was queued for review.") });
      await load();
    } catch {
      setGovernanceNotice({ findingId: form.findingId, tone: "error", message: tr ? "Governance servisine ulaşılamadı; kayıt gönderilmedi." : "Governance service is unavailable; nothing was submitted." });
    } finally {
      setSubmittingFinding("");
    }
  }

  const surfaceState = !loaded ? "loading" : available ? clean(insights?.state) || "healthy" : "unknown";

  return (
    <section className={`ca-attention ${surfaceState}`} aria-label={tr ? "Continuous Assurance dikkat görünümü" : "Continuous Assurance attention view"}>
      <header className="ca-attention-head">
        <div>
          <small>CONTINUOUS ASSURANCE HEALTH</small>
          <h3>{tr ? "Dikkat Gerektirenler" : "Attention Required"}</h3>
          <p>{tr ? "Connector, continuous control, kanıt, bulgu ve governance durumunu tek operasyon kuyruğunda birleştirir." : "Combines connector, continuous-control, evidence, finding, and governance state in one operational queue."}</p>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()}>{loading ? "…" : "↻"}</button>
      </header>

      {!loaded ? (
        <div className="ca-attention-loading" role="status">
          <b>{tr ? "Continuous Assurance durumu okunuyor" : "Reading Continuous Assurance state"}</b>
          <span>{tr ? "Operasyonel durum doğrulanana kadar sağlıklı veya sorunlu olarak işaretlenmez." : "The surface is not marked healthy or unhealthy until operational state is verified."}</span>
        </div>
      ) : !available ? (
        <div className="ca-attention-unavailable" role="status">
          <b>{tr ? "Operasyonel insight verisi alınamadı" : "Operational insight data unavailable"}</b>
          <span>{tr ? "Bu durum sağlıklı olarak yorumlanmaz; veri tekrar okunana kadar durum bilinmiyor." : "This is not treated as healthy; state remains unknown until data can be read again."}</span>
        </div>
      ) : (
        <>
          <div className="ca-attention-summary" aria-label={tr ? "Continuous Assurance özeti" : "Continuous Assurance summary"}>
            <span className="critical"><strong>{summary?.criticalConnectors ?? 0}</strong><small>{tr ? "kritik connector" : "critical connectors"}</small></span>
            <span className="watch"><strong>{summary?.watchConnectors ?? 0}</strong><small>{tr ? "izlenecek connector" : "watch connectors"}</small></span>
            <span><strong>{summary?.evidenceGapRules ?? 0}</strong><small>{tr ? "kanıt açığı" : "evidence gaps"}</small></span>
            <span><strong>{summary?.dueRules ?? 0}</strong><small>{tr ? "zamanı gelen kural" : "due rules"}</small></span>
            <span><strong>{summary?.errorRuns24h ?? 0}</strong><small>{tr ? "24s connector hatası" : "24h connector errors"}</small></span>
          </div>

          {!attention.length ? (
            <div className="ca-attention-clear" role="status">
              <b>{tr ? "Aksiyon gerektiren Continuous Assurance sinyali yok" : "No Continuous Assurance signal currently requires action"}</b>
              <span>{tr ? "Etkin connector ve kuralların mevcut operasyonel görünümü sağlıklı." : "The current operational posture of enabled connectors and rules is healthy."}</span>
            </div>
          ) : (
            <div className="ca-attention-list">
              {attention.map((insight, index) => {
                const sourceId = clean(insight.sourceId);
                const chain = chainByInsight.get(chainKey(sourceId, insight.code)) || { sourceId, ruleId: "", controlRef: "", controlRefs: [], evidenceRef: "", findingRef: "" };
                const copy = reasonCopy(insight, tr);
                const workItem = selectCapaWorkItem(workItems, chain.findingRef);
                const governanceState = capaGovernanceState(Boolean(chain.findingRef), governanceAvailable, workItem);
                const formOpen = activeGovernanceFinding === chain.findingRef && governanceForm?.findingId === chain.findingRef;
                const notice = governanceNotice?.findingId === chain.findingRef ? governanceNotice : null;
                return (
                  <article key={`${sourceId}:${clean(insight.code)}:${index}`} className={`ca-attention-row ${clean(insight.state) || "watch"}`}>
                    <div className="ca-attention-copy">
                      <small>{clean(insight.category) || clean(insight.vendor) || "SECURITY CONNECTOR"}</small>
                      <b>{clean(insight.sourceName) || clean(insight.vendor) || sourceId}</b>
                      <strong>{copy.title}</strong>
                      <span>{copy.detail}</span>
                    </div>
                    <div className="ca-attention-chain">
                      <small>{tr ? "Kaynak → Kural → Kontrol → Kanıt → Bulgu → Governance" : "Source → Rule → Control → Evidence → Finding → Governance"}</small>
                      <div>
                        <button type="button" disabled={!chain.sourceId} onClick={() => openAutomationRef("source", chain.sourceId)}>{tr ? "Kaynak" : "Source"}</button>
                        <button type="button" disabled={!chain.ruleId} onClick={() => openAutomationRef("rule", chain.ruleId)}>{tr ? "Kural" : "Rule"}</button>
                        <button type="button" disabled={!chain.controlRef} onClick={() => openControl(chain.controlRef)}>{tr ? "Kontrol" : "Control"}</button>
                        <button type="button" disabled={!chain.evidenceRef} onClick={() => openEvidence(chain.evidenceRef)}>{tr ? "Kanıt" : "Evidence"}</button>
                        <button type="button" disabled={!chain.findingRef} onClick={() => openAutomationRef("finding", chain.findingRef)}>{tr ? "Bulgu" : "Finding"}</button>
                      </div>
                      <div className={`ca-attention-governance-state ${governanceState}`}>
                        <span>{governanceCopy(governanceState, tr)}</span>
                        {(governanceState === "ready" || governanceState === "rejected") && (
                          <button type="button" onClick={() => startGovernance(chain)}>{governanceState === "rejected" ? (tr ? "Yeniden hazırla" : "Prepare again") : (tr ? "CAPA review" : "CAPA review")}</button>
                        )}
                        {governanceState === "completed" && workItem?.resultRef && (
                          <button type="button" onClick={() => openEnterpriseFinding(workItem.resultRef || "")}>{workItem.resultCode || (tr ? "CAPA kaydı" : "CAPA record")}</button>
                        )}
                      </div>
                    </div>

                    {notice && <div className={`ca-attention-governance-notice ${notice.tone}`} role="status">{notice.message}</div>}

                    {formOpen && governanceForm && (
                      <form className="ca-attention-governance-form" onSubmit={(event) => { event.preventDefault(); void queueCapa(chain); }}>
                        <header>
                          <div>
                            <small>{tr ? "GOVERNED CAPA PROMOTION" : "GOVERNED CAPA PROMOTION"}</small>
                            <b>{findingById.get(chain.findingRef)?.title || chain.findingRef}</b>
                            <span>{tr ? "Bu işlem doğrudan enterprise finding oluşturmaz; bağımsız review kuyruğuna gönderir." : "This does not directly create an enterprise finding; it queues an independent review."}</span>
                          </div>
                          <button type="button" onClick={closeGovernance} disabled={Boolean(submittingFinding)} aria-label={tr ? "Formu kapat" : "Close form"}>×</button>
                        </header>
                        <div className="ca-attention-governance-grid">
                          <label><span>{tr ? "Owner" : "Owner"}</span><input value={governanceForm.owner} onChange={(event) => setGovernanceForm({ ...governanceForm, owner: event.target.value })} required /></label>
                          <label><span>{tr ? "Bağımsız reviewer" : "Independent reviewer"}</span><input value={governanceForm.reviewer} onChange={(event) => setGovernanceForm({ ...governanceForm, reviewer: event.target.value })} placeholder="reviewer@company.com" required /></label>
                          <label><span>{tr ? "Due date" : "Due date"}</span><input type="date" value={governanceForm.dueDate} onChange={(event) => setGovernanceForm({ ...governanceForm, dueDate: event.target.value })} required /></label>
                          <label><span>{tr ? "Hedef kontrol" : "Target control"}</span>
                            {chain.controlRefs.length > 1 ? (
                              <select value={governanceForm.targetControlRef} onChange={(event) => setGovernanceForm({ ...governanceForm, targetControlRef: event.target.value })} required>
                                <option value="">{tr ? "Kontrol seç" : "Select control"}</option>
                                {chain.controlRefs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
                              </select>
                            ) : <input value={governanceForm.targetControlRef} readOnly placeholder={tr ? "Bağlı kontrol yok" : "No mapped control"} required />}
                          </label>
                          <label className="wide"><span>{tr ? "Kök neden" : "Root cause"}</span><textarea value={governanceForm.rootCause} onChange={(event) => setGovernanceForm({ ...governanceForm, rootCause: event.target.value })} required /></label>
                          <label className="wide"><span>{tr ? "Düzeltici aksiyon" : "Corrective action"}</span><textarea value={governanceForm.correctiveAction} onChange={(event) => setGovernanceForm({ ...governanceForm, correctiveAction: event.target.value })} required /></label>
                          <label className="wide"><span>{tr ? "Önleyici aksiyon" : "Preventive action"}</span><textarea value={governanceForm.preventiveAction} onChange={(event) => setGovernanceForm({ ...governanceForm, preventiveAction: event.target.value })} required /></label>
                        </div>
                        <footer>
                          <span>{tr ? "Maker-checker ve duplicate kontrolü server tarafında uygulanır." : "Maker-checker and duplicate controls are enforced server-side."}</span>
                          <div><button type="button" onClick={closeGovernance} disabled={Boolean(submittingFinding)}>{tr ? "Vazgeç" : "Cancel"}</button><button className="primary" type="submit" disabled={submittingFinding === chain.findingRef}>{submittingFinding === chain.findingRef ? (tr ? "Gönderiliyor…" : "Submitting…") : (tr ? "Review kuyruğuna gönder" : "Queue for review")}</button></div>
                        </footer>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
