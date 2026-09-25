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
type Tone = "healthy" | "watch" | "neutral";

const clean = (value: unknown) => String(value ?? "").trim();
const splitRefs = (value: unknown) => clean(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);

export default function IntegrationsOverview({ lang }: { lang: Lang }) {
  const tr = lang === "tr";
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [automation, setAutomation] = useState<AutomationPayload>({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [integrationResult, automationResult] = await Promise.allSettled([
        fetch(withBasePath("/api/integrations"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : {}),
        fetch(withBasePath("/api/evidence-automation"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : {}),
      ]);
      if (integrationResult.status === "fulfilled") {
        const body = integrationResult.value as { integrations?: Integration[] };
        setIntegrations(Array.isArray(body.integrations) ? body.integrations : []);
      }
      if (automationResult.status === "fulfilled") setAutomation(automationResult.value as AutomationPayload);
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
  const tone = (item: Integration | undefined): Tone => !configured(item) ? "neutral" : item?.lastTestStatus === "error" ? "watch" : "healthy";
  const statusLabel = (item: Integration | undefined) => {
    if (!configured(item)) return tr ? "Yapılandırılmadı" : "Not configured";
    if (item?.lastTestStatus === "error") return tr ? "Bağlantı hatası" : "Connection issue";
    if (item?.lastTestStatus === "success") return tr ? "Doğrulandı" : "Verified";
    return tr ? "Etkin" : "Enabled";
  };

  const cards = [
    {
      key: "ticketing",
      module: "İş Akışı Entegrasyonları",
      eyebrow: tr ? "WORKFLOW" : "WORKFLOW",
      title: tr ? "İş Takibi / Ticketing" : "Work Tracking / Ticketing",
      detail: workflow?.provider ? clean(workflow.provider) : (tr ? "Jira, ServiceNow, Azure DevOps, GitHub" : "Jira, ServiceNow, Azure DevOps, GitHub"),
      status: statusLabel(workflow),
      tone: tone(workflow),
      metric: configured(workflow) ? "1" : "0",
      metricLabel: tr ? "aktif profil" : "active profile",
    },
    {
      key: "identity",
      module: "Kimlik ve Erişim",
      eyebrow: "IAM / SSO",
      title: tr ? "Kimlik Federasyonu" : "Identity Federation",
      detail: identity?.provider ? clean(identity.provider) : (tr ? "Entra, Okta, OIDC, SAML, LDAP/LDAPS" : "Entra, Okta, OIDC, SAML, LDAP/LDAPS"),
      status: statusLabel(identity),
      tone: tone(identity),
      metric: configured(identity) ? "1" : "0",
      metricLabel: tr ? "aktif profil" : "active profile",
    },
    {
      key: "email",
      module: "E-posta ve Bildirimler",
      eyebrow: tr ? "NOTIFICATION" : "NOTIFICATION",
      title: tr ? "E-posta ve Bildirim" : "Email & Notification",
      detail: email?.provider ? clean(email.provider) : (tr ? "SMTP bridge, Graph Mail veya Email API" : "SMTP bridge, Graph Mail or Email API"),
      status: statusLabel(email),
      tone: tone(email),
      metric: configured(email) ? "1" : "0",
      metricLabel: tr ? "aktif kanal" : "active channel",
    },
    {
      key: "assurance",
      module: "Kanıt Otomasyonu",
      eyebrow: tr ? "CONTINUOUS ASSURANCE" : "CONTINUOUS ASSURANCE",
      title: tr ? "Kanıt / Güvenlik Connector'ları" : "Evidence / Security Connectors",
      detail: tr
        ? `${sources.length} kaynak · ${monitoredControls} kontrol · ${riskAware} risk-aware kural`
        : `${sources.length} sources · ${monitoredControls} controls · ${riskAware} risk-aware rules`,
      status: !sources.length ? (tr ? "Kaynak bekliyor" : "No sources") : unhealthy ? (tr ? `${unhealthy} sinyal dikkat istiyor` : `${unhealthy} signals need attention`) : (tr ? "İzleme aktif" : "Monitoring active"),
      tone: (!sources.length ? "neutral" : unhealthy ? "watch" : "healthy") as Tone,
      metric: String(enabledRules.length),
      metricLabel: tr ? "aktif sürekli kontrol" : "active continuous controls",
    },
  ];

  const readyCount = cards.filter((card) => card.tone === "healthy").length;
  const attentionCount = cards.filter((card) => card.tone === "watch").length;

  return (
    <section className="integrations-overview" aria-label={tr ? "Entegrasyon genel görünümü" : "Integrations overview"}>
      <header className="iov-head">
        <div>
          <small>{tr ? "CONNECTED PLATFORM" : "CONNECTED PLATFORM"}</small>
          <h2>{tr ? "Entegrasyonlar" : "Integrations"}</h2>
          <p>{tr ? "İş akışı, kimlik, bildirim ve sürekli güvence bağlantılarını tek yerden gör; yapılandırmayı ilgili uzman ekranda yap." : "See workflow, identity, notification and continuous-assurance connections in one place; configure them in the relevant specialist workspace."}</p>
        </div>
        <div className="iov-summary">
          <span><strong>{readyCount}</strong><small>{tr ? "sağlıklı alan" : "healthy areas"}</small></span>
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
              <b>→</b>
            </span>
          </button>
        ))}
      </div>

      <footer>
        <span>{updatedAt ? `${tr ? "Son kontrol" : "Last check"}: ${updatedAt.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <button type="button" onClick={() => navigateToFornost("Kanıt Otomasyonu")}>{tr ? "Yeni güvenlik connector'ı kur" : "Set up a security connector"} →</button>
      </footer>
    </section>
  );
}
