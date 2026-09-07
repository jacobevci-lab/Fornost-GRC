"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";

type User = { name?: string; email: string; role: "Admin" | "Editor" | "Viewer" };
type Status = { configured: boolean; enabled: boolean; provider: string | null; model: string | null; mode: string };
type Source = { id: string; module: string; title: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };
type AuditLog = { id:string;actor:string;action:string;provider:string;model:string;promptHash:string|null;contextRefs:string[];status:string;latencyMs:number;detail:string;createdAt:string };
type DraftKind = "risk-treatment" | "audit-finding" | "remediation-task";
type DraftTicket = {status:string;provider:string|null;externalId:string|null;url:string|null;note:string;createdBy:string;createdAt:string;completedAt:string|null;error:string|null};
type AiDraft = { id:string;kind:DraftKind;title:string;payload:Record<string,string>;rationale:string;sourceRefs:string[];status:"pending"|"approved"|"rejected";provider:string;model:string;createdBy:string;reviewedBy:string|null;reviewedAt:string|null;reviewNote:string|null;createdAt:string;publication:{recordId:string;module:string;note:string;publishedBy:string;publishedAt:string}|null;ticket:DraftTicket|null };
type AiMetrics = {windowDays:number;activity:{total:number;success:number;errors:number;denied:number;successRate:number;averageLatencyMs:number};drafts:{total:number;pending:number;approved:number;rejected:number;approvalRate:number};outputs:{recordPublications:number;ticketsCreated:number;ticketFailures:number};daily:Array<{day:string;total:number;success:number;errors:number}>;models:Array<{provider:string;model:string;requests:number;success:number}>;recentErrors:Array<{action:string;provider:string;model:string;detail:string;createdAt:string}>};
type DraftEdit = { id:string;title:string;rationale:string;payload:Record<string,string> };
type PublishTarget = { id:string;module:string;title:string };
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

const draftFieldLabels: Record<string,string> = {
  title:"Başlık",riskStatement:"Risk ifadesi",proposedTreatment:"Önerilen tedavi",owner:"Sorumlu",dueDate:"Hedef tarih",
  priority:"Öncelik",condition:"Mevcut durum",criteria:"Kriter",impact:"Etki",recommendation:"Öneri",severity:"Önem seviyesi",
  description:"Açıklama",acceptanceCriteria:"Kabul kriteri",
};

export default function FornostAiCopilot() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "drafts" | "metrics" | "settings" | "audit">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [provider, setProvider] = useState<ProviderForm>(defaults);
  const [providerLoaded, setProviderLoaded] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [draftKind, setDraftKind] = useState<DraftKind>("risk-treatment");
  const [draftInstruction, setDraftInstruction] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftEdit, setDraftEdit] = useState<DraftEdit | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({});
  const [publishDraftId, setPublishDraftId] = useState<string|null>(null);
  const [publishTargets, setPublishTargets] = useState<PublishTarget[]>([]);
  const [publishTargetId, setPublishTargetId] = useState("");
  const [publishNote, setPublishNote] = useState("");
  const [publishConfirmation, setPublishConfirmation] = useState("");
  const [ticketDraftId, setTicketDraftId] = useState<string|null>(null);
  const [ticketNote, setTicketNote] = useState("");
  const [ticketConfirmation, setTicketConfirmation] = useState("");
  const [metrics, setMetrics] = useState<AiMetrics|null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [selectedModelAvailable, setSelectedModelAvailable] = useState<boolean|null>(null);

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

  const loadDrafts = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/drafts"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({}));
    setDrafts(Array.isArray(body.drafts) ? body.drafts : []);
  }, []);

  const loadMetrics = useCallback(async () => {
    if(user?.role!=="Admin")return;
    const response=await fetch(withBasePath("/api/ai/metrics"),{cache:"no-store"}).catch(()=>null);
    if(response?.ok)setMetrics(await response.json());
  },[user?.role]);

  useEffect(() => {
    const first = window.setTimeout(() => { void refreshIdentity(); }, 0);
    const timer = window.setInterval(() => { void refreshIdentity(); }, 60000);
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
      setDiscoveredModels(testResponse.ok&&Array.isArray(testBody.models)?testBody.models:[]);
      setSelectedModelAvailable(testResponse.ok&&typeof testBody.selectedModelAvailable==="boolean"?testBody.selectedModelAvailable:null);
    }
    await loadAudit();
    setBusy(false);
  }

  async function createDraft(e: FormEvent) {
    e.preventDefault();
    if (draftBusy || !aiReady || user?.role === "Viewer" || draftInstruction.trim().length < 4) return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: draftKind, instruction: draftInstruction.trim() }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) setNotice(String(body.error || "AI taslağı üretilemedi."));
    else { setDraftInstruction(""); setNotice("AI taslağı insan incelemesine gönderildi."); await loadDrafts(); }
    setDraftBusy(false);
  }

  async function saveDraftEdit() {
    if (!draftEdit || draftBusy) return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts"), {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draftEdit),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setDraftEdit(null); setNotice("Taslak güncellendi ve revizyon geçmişine kaydedildi."); }
    else setNotice(String(body.error || "Taslak güncellenemedi."));
    await loadDrafts(); setDraftBusy(false);
  }

  async function reviewDraft(id: string, status: "approved" | "rejected") {
    if (user?.role !== "Admin" || draftBusy) return;
    const note = (reviewNotes[id] || "").trim();
    if (note.length < 5) { setNotice("Onay veya ret için en az 5 karakterlik inceleme notu yazın."); return; }
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts"), {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, note }),
    });
    const body = await response.json().catch(() => ({}));
    setNotice(response.ok ? `Taslak ${status === "approved" ? "onaylandı" : "reddedildi"}; canlı GRC kaydı değiştirilmedi.` : String(body.error || "Taslak kararı kaydedilemedi."));
    if (response.ok) setReviewNotes((notes) => { const next={...notes}; delete next[id]; return next; });
    await loadDrafts(); setDraftBusy(false);
  }

  async function preparePublication(draft: AiDraft) {
    if (user?.role !== "Admin" || draft.publication || draft.kind === "remediation-task") return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath(`/api/ai/drafts/targets?kind=${encodeURIComponent(draft.kind)}`), { cache:"no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(String(body.error || "Hedef kayıtlar yüklenemedi."));
    else {
      const targets = Array.isArray(body.targets) ? body.targets as PublishTarget[] : [];
      setPublishTargets(targets); setPublishTargetId(targets[0]?.id || ""); setPublishDraftId(draft.id);
      setPublishNote(""); setPublishConfirmation("");
    }
    setDraftBusy(false);
  }

  async function publishDraft() {
    if (!publishDraftId || !publishTargetId || publishNote.trim().length < 5 || publishConfirmation !== "YAYINLA" || draftBusy) return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts/publish"), {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({id:publishDraftId,targetRecordId:publishTargetId,note:publishNote.trim(),confirmation:publishConfirmation}),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setNotice(`Taslak ${body.publication?.module || "GRC"} kaydına yayınlandı.`); setPublishDraftId(null); await loadDrafts(); }
    else setNotice(String(body.error || "Taslak yayınlanamadı."));
    setDraftBusy(false);
  }

  async function createTicketFromDraft(){
    if(!ticketDraftId||ticketNote.trim().length<5||ticketConfirmation!=="OLUŞTUR"||draftBusy)return;
    setDraftBusy(true);setNotice("");
    const response=await fetch(withBasePath("/api/ai/drafts/ticket"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:ticketDraftId,note:ticketNote.trim(),confirmation:ticketConfirmation})});
    const body=await response.json().catch(()=>({}));
    if(response.ok){setNotice(`${body.ticket?.provider||"Ticket"} kaydı oluşturuldu: ${body.ticket?.externalId||"created"}`);setTicketDraftId(null);setTicketNote("");setTicketConfirmation("");await loadDrafts();await loadMetrics();}
    else setNotice(String(body.error||"Ticket oluşturulamadı."));
    setDraftBusy(false);
  }

  if (!user) return null;
  const aiReady = status?.enabled === true;
  const activeTab = user.role !== "Admin" && (tab === "settings" || tab === "audit" || tab === "metrics") ? "chat" : tab;

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
        <button className={activeTab === "drafts" ? "active" : ""} onClick={() => { setTab("drafts"); void loadDrafts(); }}>Taslaklar</button>
        {user.role === "Admin" && <button className={activeTab === "metrics" ? "active" : ""} onClick={() => { setTab("metrics"); void loadMetrics(); }}>Kalite</button>}
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
      </> : activeTab === "drafts" ? <div className="fornost-ai-drafts">
        <div className="fornost-ai-security-note"><b>İnsan onaylı AI taslakları</b><p>AI yalnız yapılandırılmış bir öneri üretir. Onay veya ret kararı denetim izine yazılır; bu sürüm canlı GRC kayıtlarını otomatik değiştirmez.</p></div>
        {user.role !== "Viewer" && <form className="fornost-ai-draft-form" onSubmit={createDraft}>
          <label><span>Taslak türü</span><select value={draftKind} onChange={(e) => setDraftKind(e.target.value as DraftKind)}><option value="risk-treatment">Risk tedavi planı</option><option value="audit-finding">Denetim bulgusu</option><option value="remediation-task">İyileştirme görevi</option></select></label>
          <label><span>Amaç / talimat</span><textarea rows={3} maxLength={2400} value={draftInstruction} onChange={(e) => setDraftInstruction(e.target.value)} placeholder="Örn: Kritik varlıklardaki yüksek riskler için sahip ve hedef tarih içeren tedavi taslağı oluştur."/></label>
          <button disabled={draftBusy || !aiReady || draftInstruction.trim().length < 4}>{draftBusy ? "Üretiliyor…" : "AI Taslağı Oluştur"}</button>
        </form>}
        {notice && <div className="fornost-ai-notice">{notice}</div>}
        <div className="fornost-ai-draft-head"><b>Taslak kuyruğu</b><button onClick={() => void loadDrafts()} disabled={draftBusy}>Yenile</button></div>
        {!drafts.length && <div className="fornost-ai-audit-empty">Henüz AI taslağı yok.</div>}
        <div className="fornost-ai-draft-list">{drafts.map((draft) => <article key={draft.id}>
          <header><div><small>{draft.kind}</small><b>{draft.title}</b></div><span className={draft.status}>{draft.status}</span></header>
          {draftEdit?.id === draft.id ? <div className="fornost-ai-draft-editor">
            <label><span>Başlık</span><input maxLength={180} value={draftEdit.title} onChange={(e) => setDraftEdit((value) => value ? {...value,title:e.target.value} : value)}/></label>
            <label><span>Gerekçe</span><textarea rows={3} maxLength={1200} value={draftEdit.rationale} onChange={(e) => setDraftEdit((value) => value ? {...value,rationale:e.target.value} : value)}/></label>
            {Object.entries(draftEdit.payload).map(([key,value]) => <label key={key}><span>{draftFieldLabels[key] || key}</span><textarea rows={key === "description" || key === "recommendation" || key === "acceptanceCriteria" ? 3 : 1} value={value} onChange={(e) => setDraftEdit((current) => current ? {...current,payload:{...current.payload,[key]:e.target.value}} : current)}/></label>)}
            <div><button type="button" className="reject" onClick={() => setDraftEdit(null)}>Vazgeç</button><button type="button" onClick={() => void saveDraftEdit()} disabled={draftBusy}>Değişiklikleri Kaydet</button></div>
          </div> : <><p>{draft.rationale}</p><dl>{Object.entries(draft.payload).map(([key,value]) => <div key={key}><dt>{draftFieldLabels[key] || key}</dt><dd>{value}</dd></div>)}</dl></>}
          {!!draft.sourceRefs.length && <footer>{draft.sourceRefs.slice(0,8).map((ref) => <span key={ref}>{ref}</span>)}</footer>}
          <small>{draft.createdBy} · {new Date(draft.createdAt).toLocaleString("tr-TR")}</small>
          {draft.reviewedBy && <div className="fornost-ai-review-result"><b>{draft.reviewedBy}</b><span>{draft.reviewNote}</span></div>}
          {draft.publication && <div className="fornost-ai-publication-result"><b>Yayınlandı · {draft.publication.module}</b><span>{draft.publication.recordId}</span><small>{draft.publication.publishedBy} · {new Date(draft.publication.publishedAt).toLocaleString("tr-TR")}</small><p>{draft.publication.note}</p></div>}
          {draft.ticket && <div className={`fornost-ai-ticket-result ${draft.ticket.status}`}><b>{draft.ticket.status === "created" ? "Ticket oluşturuldu" : "Ticket işlemi kilitlendi"} · {draft.ticket.provider||"entegrasyon"}</b>{draft.ticket.url?<a href={draft.ticket.url} target="_blank" rel="noreferrer">{draft.ticket.externalId||"Ticket'ı aç"}</a>:<span>{draft.ticket.externalId||draft.ticket.error}</span>}<small>{draft.ticket.createdBy} · {new Date(draft.ticket.createdAt).toLocaleString("tr-TR")}</small></div>}
          {draft.status === "pending" && draftEdit?.id !== draft.id && user.role !== "Viewer" && (user.role === "Admin" || draft.createdBy === user.email) && <button type="button" className="fornost-ai-edit-button" onClick={() => setDraftEdit({id:draft.id,title:draft.title,rationale:draft.rationale,payload:{...draft.payload}})}>Taslağı Düzenle</button>}
          {draft.status === "pending" && user.role === "Admin" && draftEdit?.id !== draft.id && <div className="fornost-ai-review-box"><textarea rows={2} maxLength={800} value={reviewNotes[draft.id] || ""} onChange={(e) => setReviewNotes((notes) => ({...notes,[draft.id]:e.target.value}))} placeholder="Zorunlu inceleme notu…"/><div className="fornost-ai-draft-actions"><button type="button" className="reject" disabled={draftBusy || (reviewNotes[draft.id] || "").trim().length < 5} onClick={() => void reviewDraft(draft.id,"rejected")}>Reddet</button><button type="button" disabled={draftBusy || (reviewNotes[draft.id] || "").trim().length < 5} onClick={() => void reviewDraft(draft.id,"approved")}>Taslağı Onayla</button></div></div>}
          {draft.status === "approved" && !draft.publication && user.role === "Admin" && draft.kind !== "remediation-task" && publishDraftId !== draft.id && <button type="button" className="fornost-ai-publish-button" disabled={draftBusy} onClick={() => void preparePublication(draft)}>Hedef Kayda Yayınla</button>}
          {draft.status === "approved" && draft.kind === "remediation-task" && !draft.ticket && user.role === "Admin" && ticketDraftId !== draft.id && <button type="button" className="fornost-ai-publish-button" disabled={draftBusy} onClick={()=>{setTicketDraftId(draft.id);setTicketNote("");setTicketConfirmation("");}}>Entegrasyonda Ticket Oluştur</button>}
          {ticketDraftId===draft.id&&<div className="fornost-ai-publish-box"><b>Kontrollü ticket yayını</b><label><span>Yayın açıklaması</span><textarea rows={2} maxLength={800} value={ticketNote} onChange={(e)=>setTicketNote(e.target.value)} placeholder="Ticket'ın neden oluşturulduğunu açıklayın…"/></label><label><span>Onay metni</span><input value={ticketConfirmation} onChange={(e)=>setTicketConfirmation(e.target.value)} placeholder="OLUŞTUR"/></label><small>Etkin ticket entegrasyonunda tek kayıt oluşturulur. Tekrar oynatma koruması çift ticket oluşmasını engeller.</small><div><button type="button" className="reject" onClick={()=>setTicketDraftId(null)}>Vazgeç</button><button type="button" disabled={draftBusy||ticketNote.trim().length<5||ticketConfirmation!=="OLUŞTUR"} onClick={()=>void createTicketFromDraft()}>Ticket Oluştur</button></div></div>}
          {publishDraftId === draft.id && <div className="fornost-ai-publish-box"><b>Kontrollü yayın</b><label><span>Hedef kayıt</span><select value={publishTargetId} onChange={(e) => setPublishTargetId(e.target.value)}>{publishTargets.map((target) => <option key={target.id} value={target.id}>{target.id} · {target.title}</option>)}</select></label><label><span>Yayın açıklaması</span><textarea rows={2} maxLength={800} value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="Bu taslağın neden bu kayda uygulandığını açıklayın…"/></label><label><span>Onay metni</span><input value={publishConfirmation} onChange={(e) => setPublishConfirmation(e.target.value)} placeholder="YAYINLA"/></label><small>Bu işlem seçilen canlı GRC kaydını günceller ve geri izlenebilir yayın kaydı oluşturur.</small><div><button type="button" className="reject" onClick={() => setPublishDraftId(null)}>Vazgeç</button><button type="button" disabled={draftBusy || !publishTargetId || publishNote.trim().length < 5 || publishConfirmation !== "YAYINLA"} onClick={() => void publishDraft()}>Canlı Kayda Uygula</button></div></div>}
        </article>)}</div>
      </div> : activeTab === "metrics" ? <div className="fornost-ai-metrics">
        <div className="fornost-ai-security-note"><b>AI kalite ve yönetişim özeti</b><p>Son 7 günlük kullanım sonuçları ile tüm taslak/yayın yaşam döngüsü ölçülür. Ham prompt ve cevaplar bu görünümde bulunmaz.</p></div>
        {!metrics?<div className="fornost-ai-audit-empty">Metrikler yükleniyor…</div>:<><div className="fornost-ai-metric-grid"><article><b>%{metrics.activity.successRate}</b><span>Başarı oranı</span></article><article><b>{metrics.activity.averageLatencyMs} ms</b><span>Ort. gecikme</span></article><article><b>%{metrics.drafts.approvalRate}</b><span>Taslak onayı</span></article><article><b>{metrics.outputs.recordPublications+metrics.outputs.ticketsCreated}</b><span>Kontrollü çıktı</span></article></div><div className="fornost-ai-metric-section"><b>7 günlük operasyon</b><p>{metrics.activity.total} işlem · {metrics.activity.errors} hata · {metrics.activity.denied} engellenen · {metrics.drafts.pending} bekleyen taslak</p>{metrics.daily.map(day=><div className="fornost-ai-day" key={day.day}><span>{day.day}</span><i style={{width:`${Math.min(100,day.total*10)}%`}}/><b>{day.success}/{day.total}</b></div>)}</div><div className="fornost-ai-metric-section"><b>Model kullanımı</b>{metrics.models.length?metrics.models.map(item=><p key={`${item.provider}:${item.model}`}>{item.provider} · {item.model}<span>{item.success}/{item.requests} başarılı</span></p>):<p>Henüz model çağrısı yok.</p>}</div><button className="fornost-ai-refresh" onClick={()=>void loadMetrics()}>Metrikleri Yenile</button></>}
      </div> : activeTab === "audit" ? <div className="fornost-ai-audit">
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
        {selectedModelAvailable!==null&&<div className={`fornost-ai-model-status ${selectedModelAvailable?"ok":"warn"}`}><b>{selectedModelAvailable?"Seçili model erişilebilir":"Seçili model listede bulunamadı"}</b><span>{discoveredModels.length} model keşfedildi</span></div>}
        {!!discoveredModels.length&&<label><span>Keşfedilen modeller</span><select value={provider.model} onChange={(e)=>setProvider(value=>({...value,model:e.target.value}))}><option value={provider.model}>{provider.model}</option>{discoveredModels.filter(model=>model!==provider.model).map(model=><option key={model} value={model}>{model}</option>)}</select></label>}
        <div className="fornost-ai-settings-actions"><button className="secondary" disabled={busy} onClick={() => saveProvider(false)}>Kaydet</button><button disabled={busy} onClick={() => saveProvider(true)}>Kaydet & Test Et</button></div>
        <small className="fornost-ai-env-help">Private ağ için <code>FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true</code>; aynı host loopback için ayrıca <code>FORNOST_AI_ALLOW_LOOPBACK=true</code> gerekir.</small>
      </div>}
    </section>}
  </>;
}
