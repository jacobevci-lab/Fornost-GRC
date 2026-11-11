"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "./base-path";
import { requestJsonWithDeadline } from "./bounded-json-request";
import { navigateToFornost } from "./navigation-focus";
import NavIcon from "./nav-icon";
import IntegrationsOverview from "./integrations-overview";
import ContinuousAssuranceAttention from "./continuous-assurance-attention";
import { accessFields, targetFields, ticketProviders, providerName, ticketDefaults, ticketConfigError, connectionState, type Connection, type ConnectionHealth, type TicketConfig } from "./integrations/ticketing-config";
import type { TargetCheck } from "./integrations/ticketing-test";
import "./integration-connection-desk.css";

type Lang = "tr" | "en";
type Event = { id: string; action: string; status: string; detail: string; actor: string; created_at: string };
type Draft = { provider: string; config: TicketConfig; secret: string; hasSecret: boolean; version: string; dirty: boolean; saved: boolean };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const statusLabels = {
  unknown: ["Durum bilinmiyor", "Status unknown"], empty: ["Henüz bağlantı yok", "No connection yet"],
  paused: ["Etkin değil", "Inactive"], untested: ["Test bekliyor", "Test pending"],
  error: ["Erişim kontrolü başarısız", "Access check failed"], stale: ["Test yenilenmeli", "Test is stale"],
  verified: ["Erişim doğrulandı", "Access verified"],
};
const eventLabels: Record<string, [string, string]> = { save: ["Ayarlar kaydedildi", "Settings saved"], test: ["Erişim kontrolü", "Access check"], enable: ["Etkinleştirme", "Activation"], pause: ["Duraklatma", "Pause"], disconnect: ["Bağlantı kaldırıldı", "Connection removed"], "create-ticket": ["İş kaydı oluşturma", "Create work item"] };

export default function IntegrationConnectionDesk({ lang }: { lang: Lang }) {
  const tr = lang === "tr";
  const t = (a: string, b: string) => tr ? a : b;
  const [row, setRow] = useState<Connection>();
  const [health, setHealth] = useState<ConnectionHealth>();
  const [events, setEvents] = useState<Event[]>([]);
  const [available, setAvailable] = useState(false);
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snapshotTime, setSnapshotTime] = useState(0);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const [tab, setTab] = useState<"connections" | "history" | "assurance">("connections");
  const [draft, setDraft] = useState<Draft>();
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<TargetCheck[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [discard, setDiscard] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const editorTitle = useRef<HTMLHeadingElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current; setLoading(true);
    async function read(path: string) {
      const { response, body } = await requestJsonWithDeadline(withBasePath(path), { cache: "no-store", signal: current.signal }, fetch, 10_000);
      if (!response.ok) throw new Error("Read failed"); return body;
    }
    const results = await Promise.allSettled([read("/api/integrations"), read("/api/integrations/health"), read("/api/integrations?view=history")]);
    if (current.signal.aborted || controller.current !== current) return;
    const config = results[0].status === "fulfilled" ? results[0].value : null;
    const valid = Array.isArray(config?.integrations) && config.integrations.every(item => object(item) && typeof item.kind === "string" && typeof item.id === "string" && typeof item.provider === "string" && typeof item.enabled === "boolean" && object(item.config) && typeof item.updated_at === "string");
    setAvailable(valid);
    if (valid) setRow((config!.integrations as (Connection & { kind: string })[]).find(item => item.kind === "ticketing"));
    const h = results[1].status === "fulfilled" ? results[1].value : null;
    const validHealth = Boolean(h && h.available !== false && object(h.health));
    setHealthAvailable(validHealth);
    setHealth(validHealth && object((h!.health as Record<string, unknown>).ticketing) ? (h!.health as Record<string, ConnectionHealth>).ticketing : undefined);
    const history = results[2].status === "fulfilled" ? results[2].value : null;
    const validHistory = Array.isArray(history?.events) && history.events.every(item => object(item) && ["id", "action", "status", "detail", "actor", "created_at"].every(key => typeof item[key] === "string"));
    setHistoryAvailable(validHistory);
    if (validHistory) setEvents(history!.events as Event[]);
    setSnapshotTime(Date.now()); setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { window.clearTimeout(timer); controller.current?.abort(); }; }, [load]);
  const editing = Boolean(draft);
  useEffect(() => { if (editing) editorTitle.current?.focus(); }, [editing, step]);
  useEffect(() => {
    if (!draft) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || writing.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (draft.dirty) setDiscard(true); else { setDraft(undefined); setTimeout(() => editTrigger.current?.focus(), 0); }
    };
    window.addEventListener("keydown", escape, true);
    const unload = (event: BeforeUnloadEvent) => { if (draft.dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("beforeunload", unload); };
  }, [draft]);

  const state = connectionState(row, health, available && healthAvailable, snapshotTime);
  const label = statusLabels[state][tr ? 0 : 1];
  const time = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(tr ? "tr-TR" : "en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
  function edit() {
    if (!available || loading || busy) return;
    setDraft({ provider: row?.provider || "jira", config: { ...(row?.config || ticketDefaults("jira")) }, secret: "", hasSecret: Boolean(row?.hasSecret), version: row?.updated_at || "", dirty: false, saved: Boolean(row) });
    setStep(0); setChecks([]); setNotice(undefined); setDiscard(false); setDisconnect(false);
  }
  function update(key: string, value: string) { setDraft(d => d ? { ...d, dirty: true, config: { ...d.config, [key]: value } } : d); setChecks([]); setNotice(undefined); }
  function closeEditor() { if (draft?.dirty) setDiscard(true); else { setDraft(undefined); setTimeout(() => editTrigger.current?.focus(), 0); } }
  async function mutate(name: string, method: string, body: Record<string, unknown>) {
    if (writing.current) return null;
    writing.current = true; setBusy(name); setNotice(undefined);
    try {
      const result = await requestJsonWithDeadline(withBasePath("/api/integrations"), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, fetch, 30_000);
      if (!result.response.ok) throw new Error(String(result.body.error || t("İşlem tamamlanamadı.", "The action could not be completed.")));
      return result.body;
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error && error.message !== "Request interrupted" ? error.message : t("Yanıt alınamadı. İşlem gerçekleşmiş olabilir; tekrar göndermeden önce yenileyin.", "No response received. The operation may have completed; refresh before resubmitting.") });
      await load(); return null;
    } finally { writing.current = false; setBusy(""); }
  }
  async function saveDraft() {
    if (!draft) return;
    const result = await mutate("save", "PUT", { kind: "ticketing", provider: draft.provider, config: draft.config, secret: draft.secret, enabled: false, expectedUpdatedAt: draft.version });
    if (!result) return;
    setDraft(d => d ? { ...d, secret: "", hasSecret: Boolean(result.hasSecret), version: String(result.updatedAt), dirty: false, saved: true } : d);
    setChecks([]); await load();
    setNotice({ error: false, text: t("Taslak kaydedildi. Bağlantı etkin değil; erişimi kontrol edip etkinleştirin.", "Draft saved. The connection is inactive; check access, then activate it.") });
  }
  async function testConnection() {
    if (!row) return;
    const result = await mutate("test", "POST", { kind: "ticketing", action: "test", expectedUpdatedAt: row.updated_at });
    if (result) { setChecks(Array.isArray(result.checks) ? result.checks as TargetCheck[] : []); setNotice({ error: false, text: t("Erişim kontrolü tamamlandı. Gerçek iş kaydı oluşturulmadı.", "Access checks completed. No work item was created.") }); await load(); }
  }
  async function toggle() {
    if (!row) return;
    const result = await mutate("toggle", "PUT", { kind: "ticketing", provider: row.provider, config: row.config, enabled: !row.enabled, expectedUpdatedAt: row.updated_at });
    if (result) { setDraft(undefined); await load(); setNotice({ error: false, text: row.enabled ? t("Bağlantı duraklatıldı.", "Connection paused.") : t("Bağlantı etkinleştirildi.", "Connection activated.") }); }
  }
  async function remove() {
    if (!row) return;
    const result = await mutate("remove", "DELETE", { kind: "ticketing", expectedUpdatedAt: row.updated_at });
    if (result) { setDisconnect(false); await load(); setNotice({ error: false, text: t("Bağlantı kaldırıldı. Geçmiş ve dış iş kayıtları korundu.", "Connection removed. History and external work items were retained.") }); }
  }
  const disabled = Boolean(busy) || loading || !available;
  const draftError = draft ? ticketConfigError(draft.provider, draft.config, Boolean(draft.secret || draft.hasSecret), tr, true) : "";
  const searchMatch = row && [providerName(row.provider), ...Object.values(row.config)].join(" ").toLocaleLowerCase(lang).includes(query.toLocaleLowerCase(lang));
  const visible = searchMatch && (filter === "all" || (filter === "active" ? row?.enabled : !row?.enabled));
  const verificationReady = healthAvailable && health?.status === "success" && Number.isFinite(Date.parse(health.testedAt || "")) && Date.parse(health.testedAt || "") <= snapshotTime + 60_000 && snapshotTime - Date.parse(health.testedAt || "") < 7 * 86400_000;
  const categories = [
    ["İş Akışı Entegrasyonları", t("İş takibi", "Work tracking")], ["Kimlik ve Erişim", t("Kimlik ve erişim", "Identity & access")],
    ["E-posta ve Bildirimler", t("Bildirimler", "Notifications")], ["Kanıt Otomasyonu", t("Kanıt kaynakları", "Evidence sources")],
  ];
  return <section className="icd" aria-label={t("Entegrasyon Merkezi", "Integration Center")} aria-busy={loading}>
    <nav className="icd-categories" aria-label={t("Entegrasyon kategorileri", "Integration categories")}>{categories.map(([module, name], index) => <button type="button" key={module} disabled={Boolean(draft) || Boolean(busy)} aria-current={index === 0 ? "page" : undefined} onClick={() => index ? navigateToFornost(module) : setTab("connections")}><NavIcon module={module}/>{name}</button>)}</nav>
    <div className="icd-toolbar"><nav aria-label={t("İş takibi görünümleri", "Work tracking views")}>{(["connections", "history", "assurance"] as const).map(value => <button type="button" key={value} disabled={Boolean(draft) || Boolean(busy)} aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}>{value === "connections" ? t("Bağlantılar", "Connections") : value === "history" ? t("Bağlantı geçmişi", "Connection history") : t("Sürekli güvence", "Continuous assurance")}</button>)}</nav><div><button type="button" disabled={loading || Boolean(busy) || Boolean(draft)} onClick={() => void load()}>{t("Yenile", "Refresh")}</button><button ref={editTrigger} type="button" className="primary" disabled={disabled || Boolean(draft)} onClick={edit}>{row ? t("Bağlantıyı düzenle", "Edit connection") : t("Bağlantı kur", "Set up connection")}</button></div></div>
    {notice && <div className={"icd-notice " + (notice.error ? "error" : "")} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
    {!available && !loading && <div className="icd-notice error" role="alert">{t("Bağlantı bilgileri alınamadı. Ayarları değiştirmeden önce yeniden deneyin.", "Connection information is unavailable. Retry before changing settings.")} <button type="button" onClick={() => void load()}>{t("Yeniden dene", "Retry")}</button></div>}
    {loading && <p role="status">{t("Bağlantı bilgileri okunuyor…", "Loading connection information…")}</p>}
    {draft ? <section className="icd-editor" aria-label={t("Bağlantı kurulumu", "Connection setup")}>
      <header><div><small>{t("YÖNLENDİRMELİ KURULUM", "GUIDED SETUP")}</small><h3 ref={editorTitle} tabIndex={-1}>{providerName(draft.provider)} · {t("Bağlantı kurulumu", "Connection setup")}</h3></div><button type="button" disabled={Boolean(busy)} onClick={closeEditor}>{t("Kapat", "Close")}</button></header>
      {discard && <div className="icd-notice" role="alert">{t("Kaydedilmemiş değişiklikler var.", "You have unsaved changes.")} <button type="button" onClick={() => { setDraft(undefined); setDiscard(false); setTimeout(() => editTrigger.current?.focus(), 0); }}>{t("Değişiklikleri bırak", "Discard changes")}</button><button type="button" onClick={() => setDiscard(false)}>{t("Düzenlemeye dön", "Keep editing")}</button></div>}
      <ol className="icd-steps">{[t("Sağlayıcı", "Provider"), t("Erişim", "Access"), t("Hedef", "Target"), t("Doğrulama", "Verification")].map((name, index) => <li key={name}><button type="button" disabled={Boolean(busy)} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{name}</button></li>)}</ol>
      <div className="icd-setup-body"><div>
        {step === 0 && <><h4>{t("İş takibi sağlayıcısını seçin", "Choose your work tracking provider")}</h4><p>{t("Bu kurulumda tek iş takibi profili kullanılır. Sağlayıcı değiştirildiğinde mevcut profil güncellenir.", "This installation uses one work tracking profile. Changing provider replaces that profile.")}</p><label>{t("Sağlayıcı", "Provider")}<select value={draft.provider} disabled={Boolean(busy)} onChange={e => { setDraft({ ...draft, provider: e.target.value, config: ticketDefaults(e.target.value), secret: "", hasSecret: false, dirty: true }); setChecks([]); }}>{ticketProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p>{t("Jira Cloud: servis hesabı ve API anahtarı. Data Center: kişisel erişim anahtarı (PAT).", "Jira Cloud: service account and API token. Data Center: personal access token (PAT).")}</p></>}
        {step === 1 && <><h4>{t("Bağlantı ve erişim bilgileri", "Connection and access details")}</h4><div className="icd-fields"><label>{t("Bağlantı adı", "Connection name")}<input disabled={Boolean(busy)} value={String(draft.config.name || "")} onChange={e => update("name", e.target.value)} maxLength={120}/></label><label>{t("Sorumlu ekip", "Responsible team")}<input disabled={Boolean(busy)} value={String(draft.config.owner || "")} onChange={e => update("owner", e.target.value)} maxLength={120}/></label>{(accessFields[draft.provider] || []).map(field => <label key={field.key}>{tr ? field.tr : field.en}<input disabled={Boolean(busy)} value={String(draft.config[field.key] || "")} placeholder={field.placeholder} onChange={e => update(field.key, e.target.value)} autoComplete="off"/></label>)}<label>{draft.provider === "jira-dc" ? "Personal Access Token (PAT)" : t("API anahtarı / parola", "API key / password")}<input disabled={Boolean(busy)} type="password" autoComplete="new-password" value={draft.secret} onChange={e => { setDraft({ ...draft, secret: e.target.value, dirty: true }); setChecks([]); }} placeholder={draft.hasSecret ? t("Mevcut anahtarı korumak için boş bırakın", "Leave blank to keep the saved key") : t("Anahtar girin", "Enter key")}/></label></div><p>{t("Anahtar kaydedildikten sonra görüntülenmez. Sağlayıcı değişirse yeni anahtar gerekir.", "Keys are never shown after saving. Changing provider requires a new key.")}</p></>}
        {step === 2 && <><h4>{t("GRC aksiyonlarının hedefi", "Destination for GRC actions")}</h4><div className="icd-fields">{(targetFields[draft.provider] || []).map(field => <label key={field.key}>{tr ? field.tr : field.en}<input disabled={Boolean(busy)} value={String(draft.config[field.key] || "")} placeholder={field.placeholder} onChange={e => update(field.key, e.target.value)}/></label>)}</div><p>{t("İş kaydı oluşturulurken başlık ve açıklama gönderilir. Ek dosya aktarımı ve durumları geri okuma bu bağlantıda kullanılmaz.", "Creating a work item sends its title and description. This connection does not transfer attachments or read status updates back.")}</p><p>{t("Hedefin zorunlu özel alanları veya iş akışı kuralları, kayıt oluşturmayı ayrıca etkileyebilir.", "Required custom fields and workflow rules at the destination may also affect work item creation.")}</p></>}
        {step === 3 && <><h4>{t("Kaydedin, kontrol edin, etkinleştirin", "Save, check, then activate")}</h4><p>{t("Taslak kaydetmek mevcut bağlantıyı duraklatır. Kaydedilen bilgiler test edilir; test gerçek iş kaydı oluşturmaz.", "Saving a draft pauses the existing connection. Tests use the saved configuration and do not create a work item.")}</p>{draftError && <p className="icd-validation">{draftError}</p>}<dl><dt>{t("Kaydedilen durum", "Saved state")}</dt><dd>{draft.dirty ? t("Kaydedilmemiş değişiklikler", "Unsaved changes") : draft.saved ? t("Kaydedildi", "Saved") : t("Henüz kaydedilmedi", "Not saved yet")}</dd><dt>{t("Son kontrol", "Last check")}</dt><dd>{!draft.dirty && healthAvailable ? (health?.status === "success" ? t("Erişim doğrulandı", "Access verified") : health?.status === "error" ? t("Başarısız", "Failed") : t("Test bekliyor", "Test pending")) : t("Doğrulanmadı", "Not verified")}</dd></dl><div className="icd-actions"><button type="button" disabled={disabled || Boolean(draftError) || draft.dirty || !draft.saved} onClick={() => void testConnection()}>{busy === "test" ? t("Kontrol ediliyor…", "Checking…") : t("Erişimi kontrol et", "Check access")}</button><button type="button" className="primary" disabled={disabled || draft.dirty || !draft.saved || Boolean(draftError) || !verificationReady || Boolean(row?.enabled)} onClick={() => void toggle()}>{t("Etkinleştir", "Activate")}</button></div>{checks.length > 0 && <ul className="icd-checks">{checks.map(check => <li key={check.name}><strong>{check.status === "passed" ? t("Doğrulandı", "Verified") : t("Kapsam sınırı", "Scope limit")}</strong> {checkText(check, tr)}</li>)}</ul>}</>}
      </div><section className="icd-setup-summary" aria-label={t("Bağlantı özeti", "Connection summary")}><h4>{t("Bağlantı özeti", "Connection summary")}</h4><dl><dt>{t("Sağlayıcı", "Provider")}</dt><dd>{providerName(draft.provider)}</dd><dt>{t("İşlem", "Operation")}</dt><dd>{t("İş kaydı oluşturma", "Create work item")}</dd><dt>{t("Paylaşım", "Shared data")}</dt><dd>{t("Başlık ve açıklama", "Title and description")}</dd></dl><p>{t("İş kaydının kapanması GRC doğrulamasını otomatik tamamlamaz.", "Closing a work item does not automatically complete GRC verification.")}</p></section></div>
      <footer><button type="button" disabled={Boolean(busy) || step === 0} onClick={() => setStep(v => v - 1)}>{t("Geri", "Back")}</button><div><button type="button" disabled={disabled || (!draft.dirty && draft.saved)} onClick={() => void saveDraft()}>{busy === "save" ? t("Kaydediliyor…", "Saving…") : t("Taslak kaydet", "Save draft")}</button>{step < 3 && <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => setStep(v => v + 1)}>{t("Devam et", "Continue")}</button>}</div></footer>
    </section> : tab === "assurance" ? <><ContinuousAssuranceAttention lang={lang}/><details className="icd-assurance"><summary>{t("Kaynak ve kontrol ayrıntıları", "Source and control details")}</summary><IntegrationsOverview lang={lang}/></details></> : tab === "history" ? <section className="icd-history"><h3>{t("Bağlantı geçmişi", "Connection history")}</h3><p>{t("En son 100 yönetim ve bağlantı işlemi. Dış sistemdeki tüm iş kayıtlarının listesi değildir.", "The latest 100 connection and management events. This is not a register of every external work item.")}</p><History events={events} available={historyAvailable} tr={tr} time={time}/></section> : available && !loading && <>
      {!row ? <div className="icd-empty"><small>{t("İZLEME BAŞLAMADI", "MONITORING HAS NOT STARTED")}</small><h3>{t("İlk iş takibi bağlantınızı kurun", "Set up your first work tracking connection")}</h3><p>{t("GRC aksiyonlarını Jira, ServiceNow, Azure DevOps veya GitHub'a göndermek için bir sağlayıcı seçin.", "Choose a provider to send GRC actions to Jira, ServiceNow, Azure DevOps or GitHub.")}</p><button type="button" className="primary" onClick={edit}>{t("Kuruluma başla", "Start setup")}</button><p>{t("Henüz bağlantı kurulmadı. Operasyonel sağlık değerlendirilmedi.", "No connection is configured. Operational health has not been assessed.")}</p></div> : <>
        <div className={"icd-status " + state}><strong>{label}</strong><span>{t("Tek iş takibi profili", "One work tracking profile")} · {t("Son kontrol", "Last check")}: {time(health?.testedAt)}</span></div>
        <div className="icd-workspace"><div className="icd-register"><div className="icd-filters"><input aria-label={t("Bağlantı ara", "Search connections")} placeholder={t("Bağlantı, sağlayıcı veya sorumlu ara…", "Search connection, provider or owner…")} value={query} onChange={e => setQuery(e.target.value)}/><select aria-label={t("Bağlantı durumu", "Connection status")} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("Tüm durumlar", "All states")}</option><option value="active">{t("Etkin", "Active")}</option><option value="inactive">{t("Etkin değil", "Inactive")}</option></select></div>
          {visible ? <div className="icd-table-scroll"><table><thead><tr><th>{t("Bağlantı", "Connection")}</th><th>{t("İşlem", "Operation")}</th><th>{t("Son kontrol", "Last check")}</th><th>{t("Durum", "State")}</th></tr></thead><tbody><tr><td><strong>{providerName(row.provider)}</strong><span>{String(row.config.name || t("İş takibi", "Work tracking"))}</span></td><td>{t("İş kaydı oluşturma", "Create work item")}</td><td>{time(health?.testedAt)}</td><td><span className={"icd-badge " + state}>{label}</span></td></tr></tbody></table></div> : <p className="icd-no-match">{t("Filtreyle eşleşen bağlantı yok.", "No connections match the filter.")} <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>{t("Filtreleri temizle", "Clear filters")}</button></p>}
          <div className="icd-recent"><h3>{t("Son işlemler", "Recent activity")}</h3><History events={events.slice(0, 4)} available={historyAvailable} tr={tr} time={time}/></div>
        </div><section className="icd-detail" aria-label={t("Bağlantı ayrıntıları", "Connection details")}><header><h3>{providerName(row.provider)}</h3><button type="button" disabled={disabled} onClick={edit}>{t("Düzenle", "Edit")}</button></header><dl><dt>{t("Sorumlu", "Owner")}</dt><dd>{String(row.config.owner || "—")}</dd><dt>{t("Hedef", "Destination")}</dt><dd>{String(row.config.projectKey || row.config.repository || row.config.project || row.config.table || row.config.endpoint || "—")}</dd><dt>{t("Güncelleyen", "Updated by")}</dt><dd>{row.updated_by || "—"}</dd><dt>{t("Son güncelleme", "Last update")}</dt><dd>{time(row.updated_at)}</dd></dl><h4>{t("Bağlantı kapsamı", "Connection scope")}</h4><p>{t("İş kaydı oluşturma. Ek dosya aktarımı ve durumları geri okuma yok.", "Work item creation. No attachment transfer or inbound status synchronization.")}</p><p>{t("Erişim testi, tüm özel alan ve iş akışı kurallarının karşılandığını kanıtlamaz.", "An access test does not prove that all custom fields and workflow rules are satisfied.")}</p>{checks.length > 0 && <ul className="icd-checks">{checks.map(check => <li key={check.name}>{checkText(check, tr)}</li>)}</ul>}<div className="icd-actions"><button type="button" disabled={disabled} onClick={() => void testConnection()}>{busy === "test" ? t("Kontrol ediliyor…", "Checking…") : t("Erişimi kontrol et", "Check access")}</button><button type="button" disabled={disabled || (!row.enabled && !verificationReady)} onClick={() => void toggle()}>{row.enabled ? t("Duraklat", "Pause") : t("Etkinleştir", "Activate")}</button></div><button className="icd-remove" type="button" disabled={disabled} onClick={() => setDisconnect(true)}>{t("Bağlantıyı kaldır", "Disconnect")}</button>{disconnect && <div className="icd-confirm" role="alert"><strong>{t("Bu bağlantı kaldırılsın mı?", "Remove this connection?")}</strong><p>{t("Yeni iş kaydı gönderimi durur ve saklanan anahtar silinir. Dış kayıtlar ve denetim geçmişi korunur.", "New work item submissions stop and the stored key is removed. External records and audit history are retained.")}</p><button type="button" disabled={disabled} onClick={() => setDisconnect(false)}>{t("Vazgeç", "Cancel")}</button><button type="button" disabled={disabled} onClick={() => void remove()}>{t("Kaldırmayı onayla", "Confirm disconnect")}</button></div>}</section></div>
      </>}
      <p className="icd-footnote">{t("Dış iş kaydının kapanması, GRC kaydının bağımsız doğrulamasını otomatik tamamlamaz.", "Closing an external work item does not automatically complete independent verification of the GRC record.")}</p>
    </>}
  </section>;
}
function History({ events, available, tr, time }: { events: Event[]; available: boolean; tr: boolean; time: (v?: string) => string }) {
  if (!available) return <p role="status">{tr ? "Geçmiş alınamadı. Yenile düğmesiyle tekrar deneyin." : "History is unavailable. Use Refresh to retry."}</p>;
  if (!events.length) return <p>{tr ? "Henüz işlem geçmişi yok." : "No activity recorded yet."}</p>;
  return <ul className="icd-events">{events.map(event => <li key={event.id}><div><strong>{eventLabels[event.action]?.[tr ? 0 : 1] || event.action}</strong><span>{event.actor}</span></div><span className={event.status === "success" ? "" : "icd-event-error"}>{event.status === "success" ? (tr ? "Tamamlandı" : "Completed") : (tr ? "Başarısız" : "Failed")}</span><time>{time(event.created_at)}</time>{event.status !== "success" && <details><summary>{tr ? "Hata ayrıntısı" : "Error details"}</summary><p>{event.detail}</p></details>}</li>)}</ul>;
}
function checkText(check: TargetCheck, tr: boolean) {
  if (!tr) return check.detail;
  const labels: Record<string, string> = { account: "Hesaba erişim doğrulandı.", project: "Hedef projeye erişim doğrulandı.", fields: "Kayıt türü, zorunlu özel alanlar ve iş akışı kuralları gerçek kayıt oluşturulurken değerlendirilir.", repository: "Depoya erişim ve Issues özelliği doğrulandı.", table: "Hedef tablo okunabiliyor.", write: "İş kaydı oluşturma yetkisi bu testle doğrulanmadı.", endpoint: "Adres HEAD isteğine yanıt veriyor. POST işleme davranışı doğrulanmadı." };
  return labels[check.name] || check.detail;
}
