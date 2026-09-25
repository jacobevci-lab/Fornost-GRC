"use client";

import { useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./integrations-overview.css";

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
type Source = { id?: string; enabled?: boolean; lastTestStatus?: string };
type Rule = { id?: string; enabled?: boolean; controlRefs?: string; health?: string; autoFinding?: boolean };
type AutomationPayload = {
  sources?: Source[];
  rules?: Rule[];
  summary?: { healthy?: number; failing?: number; stale?: number; due?: number; openFindings?: number };
};
type HealthPayload = {
  health?: Record<string, { status?: string; detail?: string; testedAt?: string }>;
  available?: boolean;
};
type Tone = "healthy" | "watch" | "neutral";

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

export default function IntegrationsOverview({ lang }: { lang: Lang }) {
  const tr = lang === "tr";
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [automation, setAutomation] = useState<AutomationPayload>({});
  const [configAvailable, setConfigAvailable] = useState(true);
  const [healthAvailable, setHealthAvailable] = useState(true);
  const [automationAvailable, setAutomationAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

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
  const sources = automation.sources || [];
  const rules = automation.rules || [];
  const enabledRules = rules.filter((item) => item.enabled);
  const monitoredControls = new Set(enabledRules.flatMap((item) => splitRefs(item.controlRefs))).size;
  const riskAware = enabledRules.filter((item) => item.autoFinding !== false).length;
  const unhealthy = Number(automation.summary?.failing || 0) + Number(automation.summary?.stale || 0);

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
        ? `${sources.length} kaynak · ${monitoredControls} kontrol · ${riskAware} risk-aware kural`
        : `${sources.length} sources · ${monitoredControls} controls · ${riskAware} risk-aware rules`,
      status: !automationAvailable
        ? (tr ? "Sürekli güvence verisi alınamadı" : "Continuous assurance data unavailable")
        : !sources.length
          ? (tr ? "Kaynak bekliyor" : "No sources")
          : unhealthy
            ? (tr ? `${unhealthy} sinyal dikkat istiyor` : `${unhealthy} signals need attention`)
            : (tr ? "İzleme aktif" : "Monitoring active"),
      tone: (!automationAvailable || !sources.length ? "neutral" : unhealthy ? "watch" : "healthy") as Tone,
      metric: automationAvailable ? String(enabledRules.length) : "—",
      metricLabel: tr ? "aktif sürekli kontrol" : "active continuous controls",
      verifiedAt: "",
    },
  ];

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

      <footer>
        <span>{updatedAt ? `${tr ? "Son kontrol" : "Last check"}: ${updatedAt.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <button type="button" onClick={openConnectorWizard}>{tr ? "Yeni güvenlik connector'ı kur" : "Set up a security connector"} →</button>
      </footer>
    </section>
  );
}
