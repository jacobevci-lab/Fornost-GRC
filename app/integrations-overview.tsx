"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./integrations-overview.css";
import "./integrations-overview-run-now.css";

type Lang = "tr" | "en";
type Integration = {
  kind?: string;
  provider?: string;
  enabled?: boolean;
  configured?: boolean;
  hasSecret?: boolean;
  lastTestStatus?: string;
  lastTestAt?: string;
};
type Source = {
  id?: string;
  name?: string;
  vendor?: string;
  category?: string;
  driver?: string;
  enabled?: boolean;
  hasSecret?: boolean;
  lastTestStatus?: string;
  lastTestAt?: string;
};
type Rule = {
  id?: string;
  name?: string;
  sourceId?: string;
  enabled?: boolean;
  controlRefs?: string;
  health?: string;
  autoFinding?: boolean;
  schedule?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastEvidenceAt?: string;
  freshness?: string;
};
type Run = {
  id?: string;
  ruleId?: string;
  ruleName?: string;
  sourceName?: string;
  status?: string;
  evidenceId?: string;
  createdAt?: string;
};
type Finding = {
  id?: string;
  ruleId?: string;
  evidenceId?: string;
  title?: string;
  severity?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
};
type AutomationPayload = {
  sources?: Source[];
  rules?: Rule[];
  runs?: Run[];
  findings?: Finding[];
  summary?: { healthy?: number; failing?: number; stale?: number; due?: number; openFindings?: number };
};
type HealthPayload = {
  health?: Record<string, { status?: string; detail?: string; testedAt?: string }>;
  available?: boolean;
};
type Tone = "healthy" | "watch" | "neutral";
type NoticeTone = "success" | "error";
type RunActionNotice = {
  ruleId: string;
  tone: NoticeTone;
  text: string;
};
type BulkRunNotice = {
  tone: NoticeTone;
  text: string;
};

const clean = (value: unknown) => String(value ?? "").trim();
const splitRefs = (value: unknown) => clean(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);
const VERIFICATION_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

function verificationAgeMs(item: Integration | undefined) {
  const testedAt = clean(item?.lastTestAt);
  if (!testedAt) return null;
  const timestamp = Date.parse(testedAt);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Date.now() - timestamp);
}

function relativeVerificationAge(item: Integration | undefined, tr: boolean) {
  const age = verificationAgeMs(item);
  if (age === null) return "";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return tr ? "az önce" : "just now";
  if (minutes < 60) return tr ? `${minutes} dk önce` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr ? `${hours} sa önce` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return tr ? `${days} gün önce` : `${days}d ago`;
}

function timestamp(value: unknown) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeAutomationTime(value: unknown, nowMs: number, tr: boolean) {
  const target = timestamp(value);
  if (!target || !nowMs) return "";
  const diffMs = target - nowMs;
  const future = diffMs > 0;
  const minutes = Math.max(0, Math.round(Math.abs(diffMs) / 60_000));
  if (minutes < 1) return tr ? "şimdi" : "now";
  const amount = minutes < 60
    ? minutes
    : minutes < 1440
      ? Math.round(minutes / 60)
      : Math.round(minutes / 1440);
  const unit = minutes < 60
    ? (tr ? "dk" : "m")
    : minutes < 1440
      ? (tr ? "sa" : "h")
      : (tr ? "gün" : "d");
  return future
    ? (tr ? `${amount} ${unit} sonra` : `in ${amount}${unit}`)
    : (tr ? `${amount} ${unit} önce` : `${amount}${unit} ago`);
}

export default function IntegrationsOverview({ lang }: { lang: Lang }) {
  const tr = lang === "tr";
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [automation, setAutomation] = useState<AutomationPayload>({});
  const [configAvailable, setConfigAvailable] = useState(true);
  const [healthAvailable, setHealthAvailable] = useState(true);
  const [automationAvailable, setAutomationAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [runningRuleId, setRunningRuleId] = useState("");
  const [runNotice, setRunNotice] = useState<RunActionNotice | null>(null);
  const [runningDue, setRunningDue] = useState(false);
  const [bulkRunNotice, setBulkRunNotice] = useState<BulkRunNotice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const integrationResponse = await fetch(withBasePath("/api/integrations"), { cache: "no-store" });
      setConfigAvailable(integrationResponse.ok);
      const integrationBody = integrationResponse.ok
        ? await integrationResponse.json() as { integrations?: Integration[] }
        : { integrations: [] as Integration[] };
      const baseIntegrations = Array.isArray(integrationBody.integrations) ? integrationBody.integrations : [];

      const [healthResult, automationResult] = await Promise.allSettled([
        fetch(withBasePath("/api/integrations/health"), { cache: "no-store" }).then(async (response) => {
          if (!response.ok) return { health: {}, available: false } as HealthPayload;
          const body = await response.json() as HealthPayload;
          return { ...body, available: body.available !== false };
        }),
        fetch(withBasePath("/api/evidence-automation"), { cache: "no-store" }).then(async (response) => {
          if (!response.ok) return { available: false } as AutomationPayload & { available: boolean };
          return { ...(await response.json() as AutomationPayload), available: true } as AutomationPayload & { available: boolean };
        }),
      ]);

      const healthPayload = healthResult.status === "fulfilled"
        ? healthResult.value as HealthPayload
        : { health: {}, available: false } as HealthPayload;
      const health = healthPayload.health || {};
      setHealthAvailable(healthPayload.available !== false);
      setIntegrations(baseIntegrations.map((item) => {
        const snapshot = health[clean(item.kind)];
        return {
          ...item,
          lastTestStatus: clean(snapshot?.status) || undefined,
          lastTestAt: clean(snapshot?.testedAt) || undefined,
        };
      }));

      if (automationResult.status === "fulfilled") {
        const payload = automationResult.value as AutomationPayload & { available?: boolean };
        const available = payload.available !== false;
        setAutomationAvailable(available);
        if (available) setAutomation(payload);
      } else {
        setAutomationAvailable(false);
      }
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const workflow = integrations.find((item) => item.kind === "ticketing");
  const email = integrations.find((item) => item.kind === "email");
  const identity = integrations.find((item) => item.kind === "identity");
  const sources = useMemo(() => automation.sources || [], [automation.sources]);
  const rules = useMemo(() => automation.rules || [], [automation.rules]);
  const runs = useMemo(() => automation.runs || [], [automation.runs]);
  const findings = useMemo(() => automation.findings || [], [automation.findings]);
  const snapshotNow = updatedAt?.getTime() || 0;
  const enabledSources = sources.filter((item) => item.enabled);
  const enabledSourceIds = new Set(enabledSources.map((item) => clean(item.id)).filter(Boolean));
  const operationalRules = rules.filter((item) => item.enabled && enabledSourceIds.has(clean(item.sourceId)));
  const operationalDueRules = operationalRules.filter((item) => {
    const nextRunAt = clean(item.nextRunAt);
    if (!nextRunAt) return true;
    const nextRun = timestamp(nextRunAt);
    return snapshotNow > 0 && nextRun > 0 && nextRun <= snapshotNow;
  });
  const operationalDueRuleIds = operationalDueRules.map((item) => clean(item.id)).filter(Boolean);
  const operationalRuleSourceIds = new Set(operationalRules.map((item) => clean(item.sourceId)).filter(Boolean));
  const monitoredControls = new Set(operationalRules.flatMap((item) => splitRefs(item.controlRefs))).size;
  const riskAware = operationalRules.filter((item) => item.autoFinding !== false).length;
  const operationalUnhealthy = operationalRules.filter((item) => ["failing", "stale", "missing"].includes(clean(item.health))).length;
  const pendingRuleRuns = operationalRules.filter((item) => !clean(item.lastRunAt)).length;
  const sourcesWithoutActiveRules = enabledSources.filter((item) => {
    const sourceId = clean(item.id);
    return !sourceId || !operationalRuleSourceIds.has(sourceId);
  }).length;
  const assuranceTone: Tone = !automationAvailable || !sources.length || !enabledSources.length
    ? "neutral"
    : operationalUnhealthy || pendingRuleRuns || sourcesWithoutActiveRules
      ? "watch"
      : operationalRules.length
        ? "healthy"
        : "neutral";
  const assuranceStatus = !automationAvailable
    ? (tr ? "Sürekli güvence verisi alınamadı" : "Continuous assurance data unavailable")
    : !sources.length
      ? (tr ? "Kaynak bekliyor" : "No sources")
      : !enabledSources.length
        ? (tr ? "Etkin güvenlik kaynağı yok" : "No enabled security sources")
        : operationalUnhealthy
          ? (tr ? `${operationalUnhealthy} aktif kontrol dikkat istiyor` : `${operationalUnhealthy} active controls need attention`)
          : pendingRuleRuns
            ? (tr ? `${pendingRuleRuns} kontrol ilk çalıştırmayı bekliyor` : `${pendingRuleRuns} controls await first run`)
            : sourcesWithoutActiveRules
              ? (tr ? `${sourcesWithoutActiveRules} kaynakta aktif kural yok` : `${sourcesWithoutActiveRules} sources have no active rule`)
              : operationalRules.length
                ? (tr ? "İzleme aktif" : "Monitoring active")
                : (tr ? "Aktif sürekli kontrol yok" : "No active continuous controls");

  const configured = (item: Integration | undefined) => Boolean(item?.enabled && (item.configured !== false));
  const tone = (item: Integration | undefined): Tone => {
    if (!configAvailable || !configured(item) || !healthAvailable) return "neutral";
    if (item?.lastTestStatus === "error") return "watch";
    if (item?.lastTestStatus !== "success") return "neutral";
    const age = verificationAgeMs(item);
    if (age === null) return "neutral";
    return age > VERIFICATION_FRESHNESS_MS ? "watch" : "healthy";
  };
  const statusLabel = (item: Integration | undefined) => {
    if (!configAvailable) return tr ? "Yapılandırma verisi alınamadı" : "Configuration unavailable";
    if (!configured(item)) return tr ? "Yapılandırılmadı" : "Not configured";
    if (!healthAvailable) return tr ? "Sağlık verisi alınamadı" : "Health telemetry unavailable";
    if (item?.lastTestStatus === "error") return tr ? "Bağlantı testi başarısız" : "Connection test failed";
    if (item?.lastTestStatus === "success") {
      const age = verificationAgeMs(item);
      if (age === null) return tr ? "Doğrulandı · zaman bilinmiyor" : "Verified · time unknown";
      if (age > VERIFICATION_FRESHNESS_MS) return tr ? "Doğrulama yenilenmeli" : "Verification is stale";
      return tr ? "Bağlantı doğrulandı" : "Connection verified";
    }
    return tr ? "Etkin · test bekliyor" : "Enabled · test pending";
  };
  const verifiedAtLabel = (item: Integration | undefined) => {
    if (!configAvailable || !healthAvailable) return "";
    const relative = relativeVerificationAge(item, tr);
    if (!relative) return "";
    return tr ? `Son doğrulama: ${relative}` : `Last verified: ${relative}`;
  };

  const cards = [
    {
      key: "ticketing",
      module: "İş Akışı Entegrasyonları",
      eyebrow: "WORKFLOW",
      title: tr ? "İş Takibi / Ticketing" : "Work Tracking / Ticketing",
      detail: workflow?.provider ? clean(workflow.provider) : "Jira, ServiceNow, Azure DevOps, GitHub",
      status: statusLabel(workflow),
      tone: tone(workflow),
      metric: !configAvailable ? "—" : configured(workflow) ? "1" : "0",
      metricLabel: tr ? "aktif profil" : "active profile",
      verifiedAt: verifiedAtLabel(workflow),
    },
    {
      key: "identity",
      module: "Kimlik ve Erişim",
      eyebrow: "IAM / SSO",
      title: tr ? "Kimlik Federasyonu" : "Identity Federation",
      detail: identity?.provider ? clean(identity.provider) : "Entra, Okta, OIDC, SAML, LDAP/LDAPS",
      status: statusLabel(identity),
      tone: tone(identity),
      metric: !configAvailable ? "—" : configured(identity) ? "1" : "0",
      metricLabel: tr ? "aktif profil" : "active profile",
      verifiedAt: verifiedAtLabel(identity),
    },
    {
      key: "email",
      module: "E-posta ve Bildirimler",
      eyebrow: "NOTIFICATION",
      title: tr ? "E-posta ve Bildirim" : "Email & Notification",
      detail: email?.provider ? clean(email.provider) : (tr ? "SMTP bridge, Graph Mail veya Email API" : "SMTP bridge, Graph Mail or Email API"),
      status: statusLabel(email),
      tone: tone(email),
      metric: !configAvailable ? "—" : configured(email) ? "1" : "0",
      metricLabel: tr ? "aktif kanal" : "active channel",
      verifiedAt: verifiedAtLabel(email),
    },
    {
      key: "assurance",
      module: "Kanıt Otomasyonu",
      eyebrow: "CONTINUOUS ASSURANCE",
      title: tr ? "Kanıt / Güvenlik Connector'ları" : "Evidence / Security Connectors",
      detail: tr
        ? `${enabledSources.length} aktif kaynak · ${monitoredControls} kontrol · ${riskAware} risk-aware kural`
        : `${enabledSources.length} active sources · ${monitoredControls} controls · ${riskAware} risk-aware rules`,
      status: assuranceStatus,
      tone: assuranceTone,
      metric: automationAvailable ? String(operationalRules.length) : "—",
      metricLabel: tr ? "aktif sürekli kontrol" : "active continuous controls",
      verifiedAt: "",
    },
  ];

  const connectorRows = useMemo(() => sources.map((source) => {
    const sourceId = clean(source.id);
    const linkedRules = rules.filter((item) => clean(item.sourceId) === sourceId);
    const activeRules = source.enabled ? linkedRules.filter((item) => item.enabled) : [];
    const controlRefs = [...new Set(activeRules.flatMap((item) => splitRefs(item.controlRefs)))];
    const ruleIds = new Set(linkedRules.map((item) => clean(item.id)).filter(Boolean));
    const activeRuleIds = new Set(activeRules.map((item) => clean(item.id)).filter(Boolean));
    const latestActiveRule = [...activeRules]
      .sort((a, b) => timestamp(b.lastRunAt) - timestamp(a.lastRunAt))[0];
    const hasActiveRunHistory = activeRules.some((item) => Boolean(clean(item.lastRunAt)));
    const latestRunAt = clean(latestActiveRule?.lastRunAt);
    const evidenceReadyCount = activeRules.filter((item) => Boolean(clean(item.lastEvidenceAt))).length;
    const scheduledRules = activeRules
      .filter((item) => Boolean(clean(item.nextRunAt)))
      .sort((a, b) => timestamp(a.nextRunAt) - timestamp(b.nextRunAt));
    const dueRuleCount = snapshotNow
      ? scheduledRules.filter((item) => {
        const next = timestamp(item.nextRunAt);
        return next > 0 && next <= snapshotNow;
      }).length
      : 0;
    const nextActiveRule = snapshotNow
      ? scheduledRules.find((item) => timestamp(item.nextRunAt) > snapshotNow)
      : scheduledRules[0];
    const nextRunAt = clean(nextActiveRule?.nextRunAt);
    const openFindings = findings
      .filter((item) => clean(item.id) && clean(item.status) !== "closed" && ruleIds.has(clean(item.ruleId)))
      .sort((a, b) => timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt));
    const activeRuns = runs
      .filter((item) => clean(item.ruleId) && activeRuleIds.has(clean(item.ruleId)))
      .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
    const latestActiveRun = activeRuns[0];
    const latestFinding = openFindings[0];
    const focusRuleId = clean(latestFinding?.ruleId || latestActiveRun?.ruleId || latestActiveRule?.id);
    const focusRule = linkedRules.find((item) => clean(item.id) === focusRuleId) || latestActiveRule || linkedRules[0];
    const actionRuleId = activeRuleIds.has(focusRuleId) ? focusRuleId : clean(latestActiveRule?.id);
    const focusControl = splitRefs(focusRule?.controlRefs)[0] || "";
    const focusEvidenceId = latestFinding
      ? clean(latestFinding.evidenceId)
      : clean(latestActiveRun?.ruleId) === clean(focusRule?.id)
        ? clean(latestActiveRun?.evidenceId)
        : "";
    const focusFindingId = clean(latestFinding?.id);
    const warningRules = activeRules.filter((item) => ["failing", "stale", "missing"].includes(clean(item.health)));
    const sourceTone: Tone = !source.enabled
      ? "neutral"
      : source.lastTestStatus === "error" || warningRules.length || openFindings.length
        ? "watch"
        : activeRules.length && !hasActiveRunHistory
          ? "watch"
          : activeRules.length && source.lastTestStatus === "success"
            ? "healthy"
            : "neutral";
    const status = !source.enabled
      ? (tr ? "Devre dışı" : "Disabled")
      : source.lastTestStatus === "error"
        ? (tr ? "Bağlantı hatası" : "Connection error")
        : warningRules.length
          ? (tr ? `${warningRules.length} kontrol dikkat istiyor` : `${warningRules.length} controls need attention`)
          : openFindings.length
            ? (tr ? `${openFindings.length} açık bulgu` : `${openFindings.length} open findings`)
            : activeRules.length && !hasActiveRunHistory
              ? (tr ? "İlk kontrol çalıştırması bekliyor" : "First control run pending")
              : activeRules.length
                ? (tr ? "İzleme aktif" : "Monitoring active")
                : (tr ? "Kural bekliyor" : "No active rules");
    return {
      source,
      sourceId,
      activeRules,
      controlRefs,
      focusRule,
      actionRuleId,
      focusControl,
      focusEvidenceId,
      focusFindingId,
      latestRunAt,
      nextRunAt,
      dueRuleCount,
      evidenceReadyCount,
      openFindingCount: openFindings.length,
      tone: sourceTone,
      status,
    };
  }), [findings, rules, runs, snapshotNow, sources, tr]);

  const readyCount = cards.filter((card) => card.tone === "healthy").length;
  const attentionCount = cards.filter((card) => card.tone === "watch").length;

  function openConnectorWizard() {
    navigateToFornost("Kanıt Otomasyonu");
    let attempts = 0;
    const open = () => {
      attempts += 1;
      const launch = document.querySelector<HTMLButtonElement>("main .cow-launch");
      if (launch) {
        launch.click();
        return;
      }
      if (attempts < 24) window.setTimeout(open, 90);
    };
    window.setTimeout(open, 0);
  }

  function openAutomationRef(kind: "source" | "rule" | "finding", id: string) {
    const ref = clean(id);
    if (!ref) return;
    const filter: Record<string, string> = kind === "source"
      ? { sourceRef: ref }
      : kind === "rule"
        ? { ruleRef: ref }
        : { findingRef: ref };
    navigateToFornost({ module: "Kanıt Otomasyonu", ref, kind, source: "integrations-overview", filter });
  }

  function openControl(ref: string) {
    const controlRef = clean(ref);
    if (!controlRef) return;
    navigateToFornost({ module: "Kontroller", ref: controlRef, kind: "control", source: "integrations-overview", filter: { controlRef } });
  }

  function openEvidence(id: string) {
    const evidenceRef = clean(id);
    if (!evidenceRef) return;
    navigateToFornost({ module: "Kanıtlar", ref: evidenceRef, kind: "evidence", source: "integrations-overview", filter: { evidenceRef } });
  }

  async function runContinuousControl(ruleId: string) {
    const ref = clean(ruleId);
    if (!ref || runningRuleId || runningDue) return;
    setRunningRuleId(ref);
    setRunNotice(null);
    setBulkRunNotice(null);
    try {
      const response = await fetch(withBasePath("/api/evidence-automation"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run-rule", ruleId: ref }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(clean(payload.error) || (tr ? "Kontrol çalıştırılamadı." : "Control run failed."));

      const status = clean(payload.status) || "unknown";
      const isExecutionError = status === "error";
      setRunNotice({
        ruleId: ref,
        tone: isExecutionError ? "error" : "success",
        text: status === "success"
          ? (tr ? "Kontrol çalıştı; kanıt ve bulgular yenilendi." : "Control ran; evidence and findings refreshed.")
          : isExecutionError
            ? (tr ? "Çalıştırma tamamlandı ancak connector hatası oluştu; telemetri yenilendi." : "Run completed with a connector error; telemetry was refreshed.")
            : (tr ? `Çalıştırma tamamlandı: ${status}. Telemetri yenilendi.` : `Run completed: ${status}. Telemetry refreshed.`),
      });
      await load();
    } catch (caught) {
      setRunNotice({
        ruleId: ref,
        tone: "error",
        text: caught instanceof Error ? caught.message : (tr ? "Kontrol çalıştırılamadı." : "Control run failed."),
      });
    } finally {
      setRunningRuleId("");
    }
  }

  async function runDueControls() {
    if (!operationalDueRuleIds.length || runningDue || runningRuleId) return;
    const dueRuleIds = [...operationalDueRuleIds];
    setRunningDue(true);
    setRunNotice(null);
    setBulkRunNotice(null);
    let completed = 0;
    let connectorErrors = 0;
    try {
      for (const ruleId of dueRuleIds) {
        const response = await fetch(withBasePath("/api/evidence-automation"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "run-rule", ruleId }),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok) throw new Error(clean(payload.error) || (tr ? "Zamanı gelen kontroller çalıştırılamadı." : "Due controls could not be run."));
        completed += 1;
        if (clean(payload.status) === "error") connectorErrors += 1;
      }
      setBulkRunNotice({
        tone: connectorErrors ? "error" : "success",
        text: connectorErrors
          ? (tr ? `${completed} kontrol çalıştı; ${connectorErrors} connector hatası oluştu.` : `${completed} controls ran; ${connectorErrors} connector errors occurred.`)
          : (tr ? `${completed} zamanı gelen kontrol çalıştırıldı; telemetri yenilendi.` : `${completed} due controls ran; telemetry refreshed.`),
      });
      await load();
    } catch (caught) {
      await load();
      setBulkRunNotice({
        tone: "error",
        text: completed
          ? (tr ? `${completed} kontrol çalıştı; kalan işlem durdu. ${caught instanceof Error ? caught.message : ""}`.trim() : `${completed} controls ran; remaining execution stopped. ${caught instanceof Error ? caught.message : ""}`.trim())
          : (caught instanceof Error ? caught.message : (tr ? "Zamanı gelen kontroller çalıştırılamadı." : "Due controls could not be run.")),
      });
    } finally {
      setRunningDue(false);
    }
  }

  return (
    <section className="integrations-overview" aria-label={tr ? "Entegrasyon genel görünümü" : "Integrations overview"}>
      <header className="iov-head">
        <div>
          <small>CONNECTED PLATFORM</small>
          <h2>{tr ? "Entegrasyonlar" : "Integrations"}</h2>
          <p>{tr ? "İş akışı, kimlik, bildirim ve sürekli güvence bağlantılarını tek yerden gör; yapılandırmayı ilgili uzman ekranda yap." : "See workflow, identity, notification and continuous-assurance connections in one place; configure them in the relevant specialist workspace."}</p>
        </div>
        <div className="iov-summary">
          <span><strong>{readyCount}</strong><small>{tr ? "doğrulanmış alan" : "verified areas"}</small></span>
          <span className={attentionCount ? "watch" : ""}><strong>{attentionCount}</strong><small>{tr ? "dikkat" : "attention"}</small></span>
          <button type="button" disabled={loading} onClick={() => void load()}>{loading ? "…" : "↻"}</button>
        </div>
      </header>

      <div className="iov-grid">
        {cards.map((card) => (
          <button type="button" key={card.key} className={`iov-card ${card.tone}`} onClick={() => navigateToFornost(card.module)}>
            <span className="iov-card-copy">
              <small>{card.eyebrow}</small>
              <b>{card.title}</b>
              <em>{card.detail}</em>
            </span>
            <span className="iov-card-state">
              <i>{card.status}</i>
              <strong>{card.metric}</strong>
              <small>{card.metricLabel}</small>
              {card.verifiedAt && <small>{card.verifiedAt}</small>}
              <b>→</b>
            </span>
          </button>
        ))}
      </div>

      {automationAvailable && connectorRows.length > 0 && (
        <section className="iov-connector-ops" aria-label={tr ? "Connector operasyon görünümü" : "Connector operations view"}>
          <header>
            <div><small>OPERATIONAL HANDOFF</small><b>{tr ? "Güvenlik connector'ları" : "Security connectors"}</b></div>
            <div className="iov-ops-actions">
              <span>{tr ? "Kaynak → Kural → Kontrol → Kanıt → Bulgu" : "Source → Rule → Control → Evidence → Finding"}</span>
              <button
                className="iov-run-due"
                type="button"
                disabled={!operationalDueRuleIds.length || runningDue || Boolean(runningRuleId)}
                onClick={() => void runDueControls()}
              >
                {runningDue
                  ? (tr ? "Çalıştırılıyor…" : "Running due…")
                  : (tr ? `Zamanı gelenleri çalıştır (${operationalDueRuleIds.length})` : `Run due (${operationalDueRuleIds.length})`)}
              </button>
              {bulkRunNotice && <span className={`iov-bulk-feedback ${bulkRunNotice.tone}`} role="status">{bulkRunNotice.text}</span>}
            </div>
          </header>
          <div className="iov-connector-list">
            {connectorRows.map((row) => {
              const focusRuleId = clean(row.focusRule?.id);
              const notice = runNotice?.ruleId === row.actionRuleId ? runNotice : null;
              return (
                <article key={row.sourceId || clean(row.source.name)} className={`iov-connector-row ${row.tone}`}>
                  <div className="iov-connector-copy">
                    <small>{clean(row.source.category) || "SECURITY CONNECTOR"}</small>
                    <b>{clean(row.source.name) || clean(row.source.vendor) || row.sourceId}</b>
                    <span>{row.status}</span>
                  </div>
                  <div className="iov-connector-health">
                    <div className="iov-connector-metrics">
                      <span><strong>{row.activeRules.length}</strong><small>{tr ? "aktif kural" : "active rules"}</small></span>
                      <span><strong>{row.controlRefs.length}</strong><small>{tr ? "kontrol" : "controls"}</small></span>
                      <span><strong>{row.openFindingCount}</strong><small>{tr ? "açık bulgu" : "open findings"}</small></span>
                    </div>
                    <div className="iov-connector-runtime" aria-label={tr ? "Çalışma zamanlaması" : "Runtime schedule"}>
                      <span title={row.latestRunAt || undefined}>
                        <small>{tr ? "Son çalışma" : "Last run"}</small>
                        <b>{row.latestRunAt ? relativeAutomationTime(row.latestRunAt, snapshotNow, tr) || "—" : "—"}</b>
                      </span>
                      <span title={row.nextRunAt || undefined}>
                        <small>{tr ? "Sıradaki" : "Next"}</small>
                        <b>{row.dueRuleCount
                          ? (tr ? `${row.dueRuleCount} çalışma zamanı geldi` : `${row.dueRuleCount} due now`)
                          : row.nextRunAt
                            ? relativeAutomationTime(row.nextRunAt, snapshotNow, tr) || "—"
                            : row.activeRules.length
                              ? (tr ? "Planlanmadı" : "Not scheduled")
                              : "—"}</b>
                      </span>
                      <span>
                        <small>{tr ? "Kanıt kapsamı" : "Evidence coverage"}</small>
                        <b>{row.activeRules.length ? `${row.evidenceReadyCount}/${row.activeRules.length}` : "—"}</b>
                      </span>
                    </div>
                  </div>
                  <div className="iov-connector-actions">
                    <button
                      className="iov-run-now"
                      type="button"
                      disabled={!row.actionRuleId || Boolean(runningRuleId) || runningDue}
                      onClick={() => void runContinuousControl(row.actionRuleId)}
                      title={row.actionRuleId ? (tr ? "Aktif Continuous Control Rule'u şimdi çalıştır" : "Run the active Continuous Control Rule now") : undefined}
                    >
                      {runningRuleId === row.actionRuleId ? (tr ? "Çalışıyor…" : "Running…") : (tr ? "Şimdi çalıştır" : "Run now")}
                    </button>
                    {notice && <span className={`iov-run-feedback ${notice.tone}`} role="status">{notice.text}</span>}
                    <div className="iov-connector-links" aria-label={tr ? "Bağlı kayıtlar" : "Linked records"}>
                      <button type="button" disabled={!row.sourceId} onClick={() => openAutomationRef("source", row.sourceId)}>{tr ? "Kaynak" : "Source"}</button>
                      <button type="button" disabled={!focusRuleId} onClick={() => openAutomationRef("rule", focusRuleId)}>{tr ? "Kural" : "Rule"}</button>
                      <button type="button" disabled={!row.focusControl} onClick={() => openControl(row.focusControl)}>{tr ? "Kontrol" : "Control"}</button>
                      <button type="button" disabled={!row.focusEvidenceId} onClick={() => openEvidence(row.focusEvidenceId)}>{tr ? "Kanıt" : "Evidence"}</button>
                      <button type="button" disabled={!row.focusFindingId} onClick={() => openAutomationRef("finding", row.focusFindingId)}>{tr ? "Bulgu" : "Finding"}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <footer>
        <span>{updatedAt ? `${tr ? "Son kontrol" : "Last check"}: ${updatedAt.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <button type="button" onClick={openConnectorWizard}>{tr ? "Yeni güvenlik connector'ı kur" : "Set up a security connector"} →</button>
      </footer>
    </section>
  );
}