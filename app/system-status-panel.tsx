"use client";
import { useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import { parseIntegrationStatus, parseSystemStatus, type ProbeState } from "./system-status";

export default function SystemStatusPanel({ lang }: { lang: "tr" | "en" }) {
  const tr = lang === "tr";
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<unknown>(null);
  const [integrations, setIntegrations] = useState<unknown>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    const read = async (path: string, allowDegraded = false) => {
      const response = await fetch(withBasePath(path), { cache: "no-store", signal: controller.signal });
      if (!response.ok && !(allowDegraded && response.status === 503)) throw new Error("Unavailable");
      return response.json() as Promise<unknown>;
    };
    Promise.allSettled([read("/api/health", true), read("/api/integrations/health")]).then(([system, integration]) => {
      if (!active) return;
      setHealth(system.status === "fulfilled" ? system.value : null);
      setIntegrations(integration.status === "fulfilled" ? integration.value : null);
      setCheckedAt(new Date().toISOString()); setLoading(false);
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [revision]);
  const status = parseSystemStatus(health);
  const label = (state: ProbeState) => loading ? (tr ? "Kontrol ediliyor…" : "Checking…") : state === "ok" ? (tr ? "Başarılı" : "Passed") : state === "error" ? (tr ? "Sorun var" : "Failed") : (tr ? "Doğrulanamadı" : "Unverified");
  const date = (value: string) => new Date(value).toLocaleString(tr ? "tr-TR" : "en-US");
  return <section className="settings-status-panel" aria-busy={loading}>
    <header><div><h3>{tr ? "Sistem Durumu" : "System Status"}</h3><p>{tr ? "Veritabanı ve kanıt deposuna salt okunur erişim kontrolü." : "Read-only access checks for the database and evidence store."}</p></div><button type="button" onClick={() => { setLoading(true); setHealth(null); setIntegrations(null); setCheckedAt(null); setRevision(value => value + 1); }} disabled={loading}>{tr ? "Yenile" : "Refresh"}</button></header>
    <div className="settings-status-grid" aria-live="polite">
      {([["database", tr ? "Veritabanı" : "Database"], ["bucket", tr ? "Kanıt Deposu" : "Evidence Store"]] as const).map(([key, title]) => <article key={key}><b>{title}</b><span data-state={status[key]}>{label(status[key])}</span><small>{tr ? "Bu sonuç yedekleme veya geri yükleme doğrulaması değildir." : "This does not verify backups or restoration."}</small></article>)}
    </div>
    {checkedAt && <p className="settings-status-time">{tr ? "Kontrol zamanı" : "Check time"}: {date(checkedAt)}</p>}
    <h3>{tr ? "Entegrasyonların Son Testleri" : "Last Integration Tests"}</h3>
    <p>{tr ? "Kayıtlı test geçmişidir; anlık bağlantı durumunu göstermez. Yeni test için ilgili ayar sayfasını kullanın." : "Recorded test history, not current connectivity. Run a new test from the corresponding settings page."}</p>
    <div className="settings-status-grid">
      {([["identity", tr ? "Kimlik ve Erişim" : "Identity & Access"], ["ticketing", tr ? "İş Akışı Entegrasyonları" : "Workflow Integrations"], ["email", tr ? "E-posta ve Bildirimler" : "Email & Notifications"]] as const).map(([kind, title]) => {
        const item = parseIntegrationStatus(integrations, kind);
        return <article key={kind}><b>{title}</b><span data-state={item.state}>{label(item.state)}</span><small>{item.testedAt ? date(item.testedAt) : tr ? "Geçerli test kaydı okunamadı." : "No verified test record available."}</small></article>;
      })}
    </div>
  </section>;
}
