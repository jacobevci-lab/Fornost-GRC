"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";

type User = { name?: string; email: string; role: "Admin" | "Editor" | "Viewer" };
type Status = { configured: boolean; enabled: boolean; provider: string | null; model: string | null; mode: string };
type Source = { id: string; module: string; title: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };
type AuditLog = { id:string;actor:string;action:string;provider:string;model:string;promptHash:string|null;contextRefs:string[];status:string;latencyMs:number;detail:string;createdAt:string };
type ProviderForm = {
  provider: "openai-compatible" | "ollama";
  baseUrl: string;
  model: string;
  enabled: boolean;
  temperature: number;
  timeoutMs: number;
  maxTokens: number;
  secret: string;
  hasSecret: boolean;
};

const defaults: ProviderForm = {
  provider: "openai-compatible",
  baseUrl: "",
  model: "",
  enabled: false,
  temperature: 0.2,
  timeoutMs: 60000,
  maxTokens: 1200,
  secret: "",
  hasSecret: false,
};

export default function FornostAiCopilot() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "settings" | "audit">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [provider, setProvider] = useState<ProviderForm>(defaults);
  const [providerLoaded, setProviderLoaded] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/status"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    setStatus(await response.json());
  }, []);

  const refreshIdentity = useCallback(async () => {
    const response = await fetch(withBasePath("/api/auth"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setUser(null);
      return;
    }
    const body = await response.json().catch(() => ({}));
    const nextUser = body.authenticated ? body.user as User : null;
    setUser(nextUser);
    if (nextUser) await refreshStatus();
  }, [refreshStatus]);

  const loadProvider = useCallback(async () => {
    if (user?.role !== "Admin") return;
    const response = await fetch(withBasePath("/api/ai/providers"), { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "AI ayarları okunamadı.");
      return;
    }
    setProvider({ ...defaults, ...body, secret: "" });
    setProviderLoaded(true);
  }, [user?.role]);

  const loadAudit = useCallback(async () => {
    if (user?.role !== "Admin") return;
    setAuditBusy(true);
    const response = await fetch(withBasePath("/api/ai/audit?limit=40"), { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const body = await response.json().catch(() => ({}));
      setAuditLogs(Array.isArray(body.logs) ? body.logs : []);
    }
    setAuditBusy(false);
  }, [user?.role]);

  useEffect(() => {
    const first = window.setTimeout(() => { void refreshIdentity(); }, 0);
    const timer = window.setInterval(() => { void refreshIdentity(); }, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refreshIdentity]);

  useEffect(() => {
    if (!(open && user?.role === "Admin" && !providerLoaded)) return;
    const timer = window.setTimeout(() => { void loadProvider(); }, 0);
    return () => window.clearTimeout(timer);
  }, [open, user?.role, providerLoaded, loadProvider]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = question.trim();
    if (!value || busy || !status?.enabled) return;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((items) => [...items, { role: "user", content: value }]);
    setQuestion("");
    setBusy(true);
    setNotice("");
    const response = await fetch(withBasePath("/api/ai/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value, history }),
    }).catch(() => null);
    if (!response) {
      setMessages((items) => [...items, { role: "assistant", content: "AI servisine ulaşılamadı." }]);
      setBusy(false);
      return;
    }
    const body = await response.json().catch(() => ({}));
    setMessages((items) => [...items, {
      role: "assistant",
      content: response.ok ? String(body.answer || "Yanıt alınamadı.") : String(body.error || "AI isteği başarısız."),
      sources: response.ok && Array.isArray(body.sources) ? body.sources : [],
    }]);
    setBusy(false);
  }

  async function saveProvider(testAfter = false) {
    if (user?.role !== "Admin" || busy) return;
    setBusy(true);
    setNotice("");
    const response = await fetch(withBasePath("/api/ai/providers"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(provider),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "AI ayarları kaydedilemedi.");
      setBusy(false);
      return;
    }
    setProvider((value) => ({ ...value, secret: "", hasSecret: body.hasSecret === true }));
    setNotice("AI sağlayıcı ayarları kaydedildi.");
    await refreshStatus();
    if (testAfter) {
      const testResponse = await fetch(withBasePath("/api/ai/providers"), { method: "POST" });
      const testBody = await testResponse.json().catch(() => ({}));
      setNotice(testResponse.ok ? String(testBody.message || "Bağlantı testi başarılı.") : String(testBody.error || "Bağlantı testi başarısız."));
    }
    await loadAudit();
    setBusy(false);
  }

  if (!user) return null;
  const aiReady = status?.enabled === true;
  const activeTab = user.role === "Admin" ? tab : "chat";

  return <>
    <button className={`fornost-ai-launcher ${aiReady ? "ready" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="fornost-ai-panel">
      <span>✦</span><b>Ask Fornost</b><i>{aiReady ? "AI" : "OFF"}</i>
    </button>
    {open && <section id="fornost-ai-panel" className="fornost-ai-panel" aria-label="Fornost AI Copilot">
      <header className="fornost-ai-head">
        <div><small>FORNOST AI · READ-ONLY COPILOT</small><h2>Ask Fornost</h2><p>{status?.model || "AI sağlayıcısı bekleniyor"}</p></div>
        <button onClick={() => setOpen(false)} aria-label="Kapat">×</button>
      </header>
      <nav className="fornost-ai-tabs">
        <button className={activeTab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Copilot</button>
        {user.role === "Admin" && <button className={activeTab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>AI Ayarları</button>}
        {user.role === "Admin" && <button className={activeTab === "audit" ? "active" : ""} onClick={() => { setTab("audit"); void loadAudit(); }}>AI Audit</button>}
      </nav>

      {activeTab === "chat" ? <>
        <div className="fornost-ai-mode"><span className={aiReady ? "online" : "offline"}/><b>{aiReady ? "Hazır" : "Devre dışı"}</b><em>{status?.provider || "Provider yok"}</em></div>
        <div className="fornost-ai-messages">
          {!messages.length && <div className="fornost-ai-welcome"><b>GRC verilerinizi sorun.</b><p>Örn: “Kritik varlıklardaki açık riskleri analiz et” veya “ISO 27001 denetimindeki en büyük boşluklar neler?”</p><small>V1 yalnızca okur ve öneri üretir; kayıt değiştirmez.</small></div>}
          {messages.map((message, index) => <article key={index} className={`fornost-ai-message ${message.role}`}>
            <small>{message.role === "user" ? "SİZ" : "FORNOST AI"}</small>
            <div>{message.content}</div>
            {!!message.sources?.length && <footer>{message.sources.slice(0, 12).map((source) => <span key={source.id} title={`${source.module} · ${source.title}`}>{source.id}</span>)}</footer>}
          </article>)}
          {busy && activeTab === "chat" && <div className="fornost-ai-thinking">Fornost verileri analiz ediliyor…</div>}
        </div>
        <form className="fornost-ai-compose" onSubmit={send}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={4000} rows={3} placeholder={aiReady ? "Risk, BIA, varlık, uyum, kanıt veya denetim hakkında sorun…" : "Ask Fornost > AI Ayarları bölümünden sağlayıcıyı etkinleştirin."} disabled={!aiReady || busy}/>
          <div><small>{question.length}/4000</small><button disabled={!aiReady || busy || !question.trim()}>Gönder</button></div>
        </form>
      </> : activeTab === "audit" ? <div className="fornost-ai-audit">
        <div className="fornost-ai-security-note"><b>AI kullanım denetim izi</b><p>Ham prompt ve model cevabı saklanmaz. Aktör, model, işlem sonucu, gecikme, prompt hash ve kullanılan Fornost kaynak kimlikleri tutulur.</p></div>
        <div className="fornost-ai-audit-head"><b>Son aktiviteler</b><button onClick={() => void loadAudit()} disabled={auditBusy}>{auditBusy ? "Yükleniyor…" : "Yenile"}</button></div>
        {!auditLogs.length && !auditBusy && <div className="fornost-ai-audit-empty">Henüz AI aktivite kaydı yok.</div>}
        <div className="fornost-ai-audit-list">{auditLogs.map((log) => <article key={log.id}>
          <header><b>{log.action}</b><span className={log.status}>{log.status}</span></header>
          <p>{log.actor}</p><small>{log.provider} · {log.model} · {log.latencyMs} ms</small>
          <time>{new Date(log.createdAt).toLocaleString("tr-TR")}</time>
          {!!log.contextRefs.length && <footer>{log.contextRefs.slice(0, 8).map((ref) => <span key={ref}>{ref}</span>)}</footer>}
          {log.detail && <em>{log.detail}</em>}
          {log.promptHash && <code title={log.promptHash}>hash:{log.promptHash.slice(0, 12)}…</code>}
        </article>)}</div>
      </div> : <div className="fornost-ai-settings">
        <div className="fornost-ai-security-note"><b>Güvenli çalışma modeli</b><p>Model DB’ye doğrudan bağlanmaz. Fornost yalnız izin verilen, read-only GRC context’ini modele gönderir; API anahtarı şifreli saklanır ve prompt’a eklenmez.</p></div>
        <label><span>Provider</span><select value={provider.provider} onChange={(e) => setProvider((value) => ({ ...value, provider: e.target.value as ProviderForm["provider"] }))}><option value="openai-compatible">OpenAI Compatible / Local Chatbot</option><option value="ollama">Ollama</option></select></label>
        <label><span>Base URL</span><input value={provider.baseUrl} onChange={(e) => setProvider((value) => ({ ...value, baseUrl: e.target.value }))} placeholder="http://10.10.10.50:11434"/></label>
        <label><span>Model</span><input value={provider.model} onChange={(e) => setProvider((value) => ({ ...value, model: e.target.value }))} placeholder="qwen3:14b"/></label>
        <label><span>API Key</span><input type="password" value={provider.secret} onChange={(e) => setProvider((value) => ({ ...value, secret: e.target.value }))} placeholder={provider.hasSecret ? "Kayıtlı · değiştirmek için yeni değer girin" : "Opsiyonel"}/></label>
        <div className="fornost-ai-setting-row"><label><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={provider.temperature} onChange={(e) => setProvider((value) => ({ ...value, temperature: Number(e.target.value) }))}/></label><label><span>Timeout (ms)</span><input type="number" min="5000" max="120000" step="1000" value={provider.timeoutMs} onChange={(e) => setProvider((value) => ({ ...value, timeoutMs: Number(e.target.value) }))}/></label></div>
        <div className="fornost-ai-setting-row"><label><span>Max tokens</span><input type="number" min="128" max="4096" step="128" value={provider.maxTokens} onChange={(e) => setProvider((value) => ({ ...value, maxTokens: Number(e.target.value) }))}/></label><label className="fornost-ai-check"><input type="checkbox" checked={provider.enabled} onChange={(e) => setProvider((value) => ({ ...value, enabled: e.target.checked }))}/><span>Fornost AI’ı etkinleştir</span></label></div>
        {notice && <div className="fornost-ai-notice">{notice}</div>}
        <div className="fornost-ai-settings-actions"><button className="secondary" disabled={busy} onClick={() => saveProvider(false)}>Kaydet</button><button disabled={busy} onClick={() => saveProvider(true)}>Kaydet & Test Et</button></div>
        <small className="fornost-ai-env-help">Private ağ için <code>FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true</code>; aynı host loopback için ayrıca <code>FORNOST_AI_ALLOW_LOOPBACK=true</code> gerekir.</small>
      </div>}
    </section>}
  </>;
}
