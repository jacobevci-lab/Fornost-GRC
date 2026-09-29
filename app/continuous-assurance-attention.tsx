"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
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
type Finding = { id?: string; ruleId?: string; evidenceId?: string; status?: string; updatedAt?: string; createdAt?: string };
type AutomationPayload = { sources?: Source[]; rules?: Rule[]; runs?: Run[]; findings?: Finding[] };
type Chain = { sourceId: string; ruleId: string; controlRef: string; evidenceRef: string; findingRef: string };

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

export default function ContinuousAssuranceAttention({ lang }: { lang: Lang }) {
  const tr = lang === "tr";
  const [insights, setInsights] = useState<InsightPayload | null>(null);
  const [automation, setAutomation] = useState<AutomationPayload>({});
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insightResponse, automationResponse] = await Promise.all([
        fetch(withBasePath("/api/evidence-automation/operations-insights"), { cache: "no-store" }),
        fetch(withBasePath("/api/evidence-automation"), { cache: "no-store" }),
      ]);
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
      chains.set(chainKey(sourceId, insight.code), {
        sourceId,
        ruleId,
        controlRef: splitRefs(focusRule?.controlRefs)[0] || "",
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

  function exportReport(format: "html" | "csv" | "json") {
    const url = withBasePath(`/api/evidence-automation/operations-report?format=${format}&lang=${lang}`);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const surfaceState = !loaded ? "loading" : available ? clean(insights?.state) || "healthy" : "unknown";

  return (
    <section className={`ca-attention ${surfaceState}`} aria-label={tr ? "Continuous Assurance dikkat görünümü" : "Continuous Assurance attention view"}>
      <header className="ca-attention-head">
        <div>
          <small>CONTINUOUS ASSURANCE HEALTH</small>
          <h3>{tr ? "Dikkat Gerektirenler" : "Attention Required"}</h3>
          <p>{tr ? "Connector, continuous control, kanıt ve bulgu sinyallerini tek operasyon kuyruğunda birleştirir." : "Combines connector, continuous-control, evidence, and finding signals into one operational queue."}</p>
        </div>
        <div className="ca-attention-actions">
          <button type="button" className="ca-report-button" disabled={!loaded || !available} onClick={() => exportReport("html")}>HTML</button>
          <button type="button" className="ca-report-button" disabled={!loaded || !available} onClick={() => exportReport("csv")}>CSV</button>
          <button type="button" className="ca-report-button" disabled={!loaded || !available} onClick={() => exportReport("json")}>JSON</button>
          <button type="button" className="ca-refresh-button" disabled={loading} onClick={() => void load()} aria-label={tr ? "Yenile" : "Refresh"}>{loading ? "…" : "↻"}</button>
        </div>
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
                const chain = chainByInsight.get(chainKey(sourceId, insight.code)) || { sourceId, ruleId: "", controlRef: "", evidenceRef: "", findingRef: "" };
                const copy = reasonCopy(insight, tr);
                return (
                  <article key={`${sourceId}:${clean(insight.code)}:${index}`} className={`ca-attention-row ${clean(insight.state) || "watch"}`}>
                    <div className="ca-attention-copy">
                      <small>{clean(insight.category) || clean(insight.vendor) || "SECURITY CONNECTOR"}</small>
                      <b>{clean(insight.sourceName) || clean(insight.vendor) || sourceId}</b>
                      <strong>{copy.title}</strong>
                      <span>{copy.detail}</span>
                    </div>
                    <div className="ca-attention-chain">
                      <small>{tr ? "Kaynak → Kural → Kontrol → Kanıt → Bulgu" : "Source → Rule → Control → Evidence → Finding"}</small>
                      <div>
                        <button type="button" disabled={!chain.sourceId} onClick={() => openAutomationRef("source", chain.sourceId)}>{tr ? "Kaynak" : "Source"}</button>
                        <button type="button" disabled={!chain.ruleId} onClick={() => openAutomationRef("rule", chain.ruleId)}>{tr ? "Kural" : "Rule"}</button>
                        <button type="button" disabled={!chain.controlRef} onClick={() => openControl(chain.controlRef)}>{tr ? "Kontrol" : "Control"}</button>
                        <button type="button" disabled={!chain.evidenceRef} onClick={() => openEvidence(chain.evidenceRef)}>{tr ? "Kanıt" : "Evidence"}</button>
                        <button type="button" disabled={!chain.findingRef} onClick={() => openAutomationRef("finding", chain.findingRef)}>{tr ? "Bulgu" : "Finding"}</button>
                      </div>
                    </div>
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
