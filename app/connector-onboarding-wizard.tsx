"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./connector-onboarding-wizard.css";

type Lang = "tr" | "en";
type DetectedPath = { path: string; type: string };
type Suggestion = { ref: string; title: string; score: number; matches: string[] };
type Control = { ref: string; title: string };
type Source = { id: string };
type Rule = { id: string; sourceId: string; controlRefs: string; enabled: boolean; autoFinding?: boolean };
type Finding = { id: string; ruleId: string; status: string };
type AutomationContext = { sources?: Source[]; rules?: Rule[]; findings?: Finding[] };
type Template = { label: string; category: string; driver: string };
type SourceDraft = {
  name: string;
  vendor: string;
  category: string;
  driver: string;
  baseUrl: string;
  authType: string;
  headerName: string;
  secret: string;
};

const templates: Template[] = [
  { label: "Microsoft Defender XDR / Sentinel API", category: "XDR, EDR & SIEM", driver: "rest-json" },
  { label: "Microsoft 365 / Graph API", category: "Cloud & SaaS", driver: "microsoft-graph" },
  { label: "Microsoft Entra ID / Graph API", category: "IAM, PAM & IGA", driver: "microsoft-graph" },
  { label: "Tenable / Qualys / Rapid7 API", category: "Data, DB & Application", driver: "rest-json" },
  { label: "CrowdStrike Falcon API", category: "XDR, EDR & SIEM", driver: "rest-json" },
  { label: "Palo Alto Cortex XDR API", category: "XDR, EDR & SIEM", driver: "rest-json" },
  { label: "Cloudflare API", category: "Cloud & SaaS", driver: "cloudflare-api" },
  { label: "Azure REST API", category: "Cloud & SaaS", driver: "azure-rest" },
  { label: "Jira / ServiceNow / Azure DevOps API", category: "Work & Custom", driver: "rest-json" },
  { label: "Generic REST / JSON API", category: "Work & Custom", driver: "rest-json" },
  { label: "On-prem HTTPS Collector Bridge", category: "Work & Custom", driver: "https-bridge" },
];
const initialTemplate = templates[0]!;
const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const splitRefs = (value: unknown) => clean(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function controlRows(body: unknown): Control[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { rows?: unknown }).rows)) return [];
  const seen = new Set<string>();
  const controls: Control[] = [];
  for (const raw of (body as { rows: Array<Record<string, unknown>> }).rows) {
    if (clean(raw.module) !== "Kontroller") continue;
    let data: Record<string, unknown> = {};
    if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
      data = raw.data as Record<string, unknown>;
    } else if (typeof raw.data_json === "string") {
      try {
        const parsed = JSON.parse(raw.data_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
      } catch {}
    }
    const ref = clean(data.controlId || data.controlCode || data.code || data.reference || raw.code || raw.recordCode || raw.id);
    const key = normalized(ref);
    if (!ref || seen.has(key)) continue;
    seen.add(key);
    controls.push({ ref, title: clean(data.controlTitle || data.title || data.name || data.objective || ref) });
  }
  return controls.sort((a, b) => a.ref.localeCompare(b.ref, "tr"));
}

async function post(body: Record<string, unknown>) {
  const response = await fetch(withBasePath("/api/evidence-automation"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(clean(payload.error) || "Operation failed");
  return payload;
}

export default function ConnectorOnboardingWizard() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [role, setRole] = useState("");
  const [actor, setActor] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState(initialTemplate);
  const [sourceId, setSourceId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [runEvidenceId, setRunEvidenceId] = useState("");
  const [runFindingId, setRunFindingId] = useState("");
  const [draft, setDraft] = useState<SourceDraft>({
    name: initialTemplate.label,
    vendor: initialTemplate.label,
    category: initialTemplate.category,
    driver: initialTemplate.driver,
    baseUrl: "",
    authType: "bearer",
    headerName: "x-api-key",
    secret: "",
  });
  const [paths, setPaths] = useState<DetectedPath[]>([]);
  const [rootType, setRootType] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [controlQuery, setControlQuery] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rule, setRule] = useState({
    name: "",
    operator: "exists",
    expected: "",
    schedule: "daily",
    freshnessHours: 24,
    failureThreshold: 2,
    remediationDueDays: 7,
  });
  const [runStatus, setRunStatus] = useState("");

  useEffect(() => {
    let created: HTMLDivElement | null = null;
    const discover = () => {
      setLang(currentLanguage());
      const page = Array.from(document.querySelectorAll<HTMLElement>(".ea-page")).find((node) => node.getClientRects().length > 0) || null;
      if (!page) {
        setMount(null);
        return;
      }
      created = page.querySelector<HTMLDivElement>(":scope > .connector-onboarding-mount");
      if (!created) {
        created = document.createElement("div");
        created.className = "connector-onboarding-mount";
        const hero = page.querySelector(":scope > .ea-hero");
        if (hero) hero.insertAdjacentElement("afterend", created);
        else page.prepend(created);
      }
      setMount((current) => current === created ? current : created);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = () => window.setTimeout(discover, 0);
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      created?.remove();
    };
  }, []);

  const loadContext = useCallback(async (): Promise<AutomationContext | null> => {
    const [authResult, automationResult, grcResult] = await Promise.allSettled([
      fetch(withBasePath("/api/auth"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : {}),
      fetch(withBasePath("/api/evidence-automation"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : {}),
      fetch(withBasePath("/api/grc"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : {}),
    ]);
    if (authResult.status === "fulfilled") {
      const user = (authResult.value as { user?: { role?: string; email?: string } }).user || {};
      setRole(clean(user.role));
      setActor(clean(user.email));
    }
    let automation: AutomationContext | null = null;
    if (automationResult.status === "fulfilled") {
      automation = automationResult.value as AutomationContext;
      setSourceCount(automation.sources?.length || 0);
      setRules(automation.rules || []);
    }
    if (grcResult.status === "fulfilled") setControls(controlRows(grcResult.value));
    return automation;
  }, []);

  useEffect(() => {
    if (!mount) return;
    const timer = window.setTimeout(() => void loadContext(), 0);
    return () => window.clearTimeout(timer);
  }, [mount, loadContext]);

  const monitoredControls = useMemo(
    () => new Set(rules.filter((item) => item.enabled).flatMap((item) => splitRefs(item.controlRefs))).size,
    [rules],
  );
  const riskUpdatingRules = useMemo(
    () => rules.filter((item) => item.enabled && item.autoFinding !== false).length,
    [rules],
  );
  const suggestedRefs = useMemo(() => new Set(suggestions.map((item) => normalized(item.ref))), [suggestions]);
  const manualControls = useMemo(() => {
    const needle = normalized(controlQuery);
    if (!needle) return controls.filter((item) => !suggestedRefs.has(normalized(item.ref))).slice(0, 8);
    return controls
      .filter((item) => !suggestedRefs.has(normalized(item.ref)) && normalized(`${item.ref} ${item.title}`).includes(needle))
      .slice(0, 12);
  }, [controls, controlQuery, suggestedRefs]);

  const tr = lang === "tr";
  const stepLabels = tr
    ? ["Bağlan", "Algıla", "Kontroller", "İzlemeyi Aç"]
    : ["Authenticate", "Detect", "Map Controls", "Enable Monitoring"];

  function chooseTemplate(label: string) {
    const next = templates.find((item) => item.label === label) || templates[0]!;
    setTemplate(next);
    setSourceId("");
    setPaths([]);
    setSuggestions([]);
    setSelectedControls([]);
    setSelectedPath("");
    setDraft((current) => ({
      ...current,
      name: next.label,
      vendor: next.label,
      category: next.category,
      driver: next.driver,
      baseUrl: "",
      secret: "",
    }));
    setError("");
  }

  function toggleControl(ref: string) {
    setSelectedControls((current) => {
      if (current.includes(ref)) return current.filter((item) => item !== ref);
      return current.length >= 12 ? current : [...current, ref];
    });
  }

  function reset() {
    setOpen(false);
    setStep(1);
    setBusy("");
    setError("");
    setMessage("");
    setSourceId("");
    setRuleId("");
    setRunEvidenceId("");
    setRunFindingId("");
    setPaths([]);
    setRootType("");
    setTruncated(false);
    setSuggestions([]);
    setSelectedControls([]);
    setSelectedPath("");
    setControlQuery("");
    setRunStatus("");
    setDraft({
      name: template.label,
      vendor: template.label,
      category: template.category,
      driver: template.driver,
      baseUrl: "",
      authType: "bearer",
      headerName: "x-api-key",
      secret: "",
    });
  }

  async function authenticate() {
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      setError(tr ? "Kaynak adı ve HTTPS API adresi gerekli." : "Source name and an HTTPS API URL are required.");
      return;
    }
    setBusy("connect");
    setError("");
    setMessage("");
    try {
      const saved = await post({ action: "save-source", sourceId: sourceId || undefined, ...draft });
      const id = clean(saved.sourceId);
      if (!id) throw new Error(tr ? "Kaynak kimliği alınamadı." : "Source ID was not returned.");
      setSourceId(id);
      const discovered = await post({ action: "discover-source", sourceId: id });
      const detected = (discovered.detected || {}) as { rootType?: string; paths?: DetectedPath[]; truncated?: boolean };
      const nextPaths = Array.isArray(detected.paths) ? detected.paths : [];
      const nextSuggestions = Array.isArray(discovered.suggestedControls) ? discovered.suggestedControls as Suggestion[] : [];
      setPaths(nextPaths);
      setRootType(clean(detected.rootType));
      setTruncated(detected.truncated === true);
      setSuggestions(nextSuggestions);
      const preferred = nextPaths.find((item) => !["object", "array"].includes(item.type)) || nextPaths[0];
      setSelectedPath(preferred?.path || "");
      setDraft((current) => ({ ...current, secret: "" }));
      setStep(2);
      setMessage(clean(discovered.message));
      await loadContext();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (tr ? "Bağlantı kurulamadı." : "Connection failed."));
    } finally {
      setBusy("");
    }
  }

  async function enableMonitoring() {
    if (!sourceId || !selectedPath || !selectedControls.length) {
      setError(tr ? "Kaynak, izlenecek JSON path ve en az bir kontrol seçin." : "Select a source, JSON path and at least one control.");
      return;
    }
    if (rule.operator !== "exists" && !rule.expected.trim()) {
      setError(tr ? "Bu operatör için beklenen değer gerekli." : "An expected value is required for this operator.");
      return;
    }
    setBusy("enable");
    setError("");
    setMessage("");
    setRunEvidenceId("");
    setRunFindingId("");
    try {
      const saved = await post({
        action: "save-rule",
        name: rule.name.trim() || `${draft.name} · ${selectedPath}`,
        sourceId,
        controlRefs: selectedControls.join("; "),
        jsonPath: selectedPath,
        operator: rule.operator,
        expected: rule.expected,
        schedule: rule.schedule,
        freshnessHours: rule.freshnessHours,
        failureThreshold: rule.failureThreshold,
        remediationOwner: actor,
        remediationDueDays: rule.remediationDueDays,
        autoFinding: true,
      });
      const id = clean(saved.ruleId);
      if (!id) throw new Error(tr ? "Sürekli kontrol kimliği alınamadı." : "Continuous control ID was not returned.");
      setRuleId(id);
      const run = await post({ action: "run-rule", ruleId: id });
      setRunStatus(clean(run.status) || "unknown");
      setRunEvidenceId(clean(run.evidenceId));
      setMessage(clean(run.message) || clean(saved.message));
      const context = await loadContext();
      const generatedFinding = context?.findings?.find((item) => item.ruleId === id && item.status !== "closed");
      setRunFindingId(clean(generatedFinding?.id));
      setStep(5);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (tr ? "İzleme etkinleştirilemedi." : "Monitoring could not be enabled."));
    } finally {
      setBusy("");
    }
  }

  function openSource() {
    if (!sourceId) return;
    reset();
    navigateToFornost({ module: "Kanıt Otomasyonu", ref: sourceId, source: "connector-onboarding", filter: { sourceRef: sourceId } });
  }

  function openRule() {
    if (!ruleId) return;
    reset();
    navigateToFornost({ module: "Kanıt Otomasyonu", ref: ruleId, source: "connector-onboarding", filter: { ruleRef: ruleId } });
  }

  function openControl(ref: string) {
    const controlRef = clean(ref);
    if (!controlRef) return;
    reset();
    navigateToFornost({ module: "Kontroller", ref: controlRef, source: "connector-onboarding", filter: { controlRef } });
  }

  function openEvidence() {
    if (!runEvidenceId) return;
    reset();
    navigateToFornost({ module: "Kanıtlar", ref: runEvidenceId, source: "connector-onboarding", filter: { evidenceRef: runEvidenceId } });
  }

  function openFinding() {
    if (!runFindingId) return;
    reset();
    navigateToFornost({ module: "Kanıt Otomasyonu", ref: runFindingId, source: "connector-onboarding", filter: { findingRef: runFindingId } });
  }

  if (!mount || role !== "Admin") return null;

  return createPortal(
    <section className={`connector-onboarding ${open ? "open" : ""}`} aria-label={tr ? "Connector kurulum sihirbazı" : "Connector setup wizard"}>
      {!open ? (
        <button type="button" className="cow-launch" onClick={() => setOpen(true)}>
          <span className="cow-launch-copy">
            <small>GUIDED CONNECTOR SETUP</small>
            <b>{tr ? "Bağla → algıla → kontrolle eşleştir → izle" : "Authenticate → detect → map → monitor"}</b>
            <em>{tr ? "API cevabını güvenli biçimde keşfeder; kanıtı seçtiğiniz kontrollere bağlar." : "Safely discovers the API shape and maps evidence to controls you approve."}</em>
          </span>
          <span className="cow-launch-metrics">
            <i><strong>{sourceCount}</strong><small>{tr ? "kaynak" : "sources"}</small></i>
            <i><strong>{monitoredControls}</strong><small>{tr ? "izlenen kontrol" : "controls"}</small></i>
            <i><strong>{riskUpdatingRules}</strong><small>{tr ? "risk güncelleyen" : "risk-aware"}</small></i>
            <b>{tr ? "Connector Kur" : "Set Up Connector"} →</b>
          </span>
        </button>
      ) : (
        <div className="cow-shell">
          <header className="cow-head">
            <div>
              <small>CONNECTED ASSURANCE</small>
              <h3>{tr ? "Connector Kurulum Sihirbazı" : "Connector Setup Wizard"}</h3>
              <p>{tr ? "Fornost bağlantıyı doğrular, veri yapısını algılar ve kontrol adaylarını önerir. Eşleştirmeyi siz onaylarsınız." : "Fornost validates the connection, detects the data shape and suggests control candidates. You approve the mapping."}</p>
            </div>
            <button type="button" onClick={reset} aria-label={tr ? "Sihirbazı kapat" : "Close wizard"}>×</button>
          </header>

          <nav className="cow-steps" aria-label={tr ? "Kurulum adımları" : "Setup steps"}>
            {stepLabels.map((label, index) => {
              const number = index + 1;
              const active = step === number;
              const done = step > number;
              return <span key={label} className={active ? "active" : done ? "done" : ""}><i>{done ? "✓" : number}</i><b>{label}</b></span>;
            })}
          </nav>

          {error && <div className="cow-message error">{error}</div>}
          {message && <div className="cow-message success">{message}</div>}

          {step === 1 && (
            <div className="cow-body">
              <div className="cow-copy">
                <small>1 · {tr ? "BAĞLAN" : "AUTHENTICATE"}</small>
                <h4>{tr ? "Kanıt kaynağını doğrula" : "Validate the evidence source"}</h4>
                <p>{tr ? "Kimlik bilgisi şifreli saklanır. Şablonlar güvenli HTTPS JSON collector kullanır; provider-native OAuth/SigV4 yalnız ayrı driver desteği olduğunda sunulur." : "Credentials are stored encrypted. Templates use the secure HTTPS JSON collector; provider-native OAuth/SigV4 is exposed only when a dedicated driver supports it."}</p>
              </div>
              <div className="cow-form-grid">
                <label className="wide"><span>{tr ? "Connector şablonu" : "Connector template"}</span><select value={template.label} onChange={(event) => chooseTemplate(event.target.value)}>{templates.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
                <label><span>{tr ? "Kaynak adı" : "Source name"}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label><span>{tr ? "API / Collector URL" : "API / Collector URL"}</span><input value={draft.baseUrl} placeholder="https://..." onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
                <label><span>{tr ? "Kimlik doğrulama" : "Authentication"}</span><select value={draft.authType} onChange={(event) => setDraft({ ...draft, authType: event.target.value })}><option value="bearer">Bearer token</option><option value="api-key">API key</option><option value="basic">Basic secret</option></select></label>
                {draft.authType === "api-key" && <label><span>{tr ? "Header adı" : "Header name"}</span><input value={draft.headerName} onChange={(event) => setDraft({ ...draft, headerName: event.target.value })} /></label>}
                <label className={draft.authType === "api-key" ? "" : "wide"}><span>{draft.authType === "basic" ? "Basic credential" : (tr ? "Token / Secret" : "Token / Secret")}</span><input type="password" autoComplete="new-password" value={draft.secret} placeholder={sourceId ? (tr ? "Boş bırakılırsa mevcut secret korunur" : "Leave blank to keep the saved secret") : "••••••••"} onChange={(event) => setDraft({ ...draft, secret: event.target.value })} /></label>
              </div>
              <footer className="cow-actions"><span>{sourceId ? (tr ? "Mevcut taslak güvenli biçimde güncellenecek." : "The existing draft source will be updated securely.") : ""}</span><button type="button" className="primary" disabled={!!busy} onClick={() => void authenticate()}>{busy === "connect" ? (tr ? "Doğrulanıyor…" : "Validating…") : (tr ? "Bağlan ve Algıla" : "Authenticate & Detect")}</button></footer>
            </div>
          )}

          {step === 2 && (
            <div className="cow-body">
              <div className="cow-copy"><small>2 · {tr ? "ALGILA" : "DETECT"}</small><h4>{tr ? "API yapısı algılandı" : "API shape detected"}</h4><p>{tr ? "Ham değerler gösterilmez; yalnız alan yolu ve veri tipi listelenir." : "Raw values are never displayed; only field paths and data types are listed."}</p></div>
              <div className="cow-detected-summary"><span><small>{tr ? "Kök tip" : "Root type"}</small><b>{rootType || "—"}</b></span><span><small>{tr ? "Algılanan path" : "Detected paths"}</small><b>{paths.length}</b></span><span><small>{tr ? "Kontrol önerisi" : "Control suggestions"}</small><b>{suggestions.length}</b></span>{truncated && <em>{tr ? "Güvenlik/performance sınırı nedeniyle sonuç kısaltıldı." : "Results were bounded for security/performance."}</em>}</div>
              <label className="cow-path-picker"><span>{tr ? "İzlenecek JSON path" : "JSON path to monitor"}</span><select value={selectedPath} onChange={(event) => setSelectedPath(event.target.value)}><option value="">{tr ? "Path seçin" : "Select a path"}</option>{paths.map((item) => <option key={`${item.path}:${item.type}`} value={item.path}>{item.path} · {item.type}</option>)}</select></label>
              <div className="cow-paths">{paths.slice(0, 18).map((item) => <button type="button" key={`${item.path}:${item.type}`} className={selectedPath === item.path ? "active" : ""} onClick={() => setSelectedPath(item.path)}><b>{item.path}</b><small>{item.type}</small></button>)}</div>
              {!paths.length && <div className="cow-empty">{tr ? "İzlenebilir JSON alanı bulunamadı. Kaynak boş bir JSON nesnesi döndürüyor olabilir." : "No monitorable JSON field was found. The source may be returning an empty JSON object."}</div>}
              <footer className="cow-actions"><button type="button" className="ghost" onClick={() => setStep(1)}>{tr ? "Geri" : "Back"}</button><button type="button" className="primary" disabled={!selectedPath} onClick={() => setStep(3)}>{tr ? "Kontrolleri Eşleştir" : "Map Controls"}</button></footer>
            </div>
          )}

          {step === 3 && (
            <div className="cow-body">
              <div className="cow-copy"><small>3 · {tr ? "KONTROLLER" : "MAP CONTROLS"}</small><h4>{tr ? "Kanıtın hangi kontrolleri desteklediğini onayla" : "Approve which controls this evidence supports"}</h4><p>{tr ? "Öneriler yalnız mevcut Control Library kayıtlarından gelir; otomatik eşleştirme yapılmaz." : "Suggestions come only from the existing Control Library; no mapping is applied automatically."}</p></div>
              {suggestions.length > 0 && <div className="cow-suggestions"><small>{tr ? "ÖNERİLEN KONTROLLER" : "SUGGESTED CONTROLS"}</small>{suggestions.map((item) => <label key={item.ref} className={selectedControls.includes(item.ref) ? "selected" : ""}><input type="checkbox" checked={selectedControls.includes(item.ref)} onChange={() => toggleControl(item.ref)} /><span><b>{item.ref}</b><em>{item.title}</em><small>{item.matches.slice(0, 4).join(" · ")}</small></span><i>{item.score}</i></label>)}</div>}
              <div className="cow-control-search"><label><span>{tr ? "Control Library'de ara" : "Search Control Library"}</span><input value={controlQuery} placeholder={tr ? "Kontrol kodu veya başlık…" : "Control ref or title…"} onChange={(event) => setControlQuery(event.target.value)} /></label><b>{selectedControls.length} {tr ? "seçili" : "selected"}</b></div>
              <div className="cow-controls">{manualControls.map((item) => <label key={item.ref} className={selectedControls.includes(item.ref) ? "selected" : ""}><input type="checkbox" checked={selectedControls.includes(item.ref)} onChange={() => toggleControl(item.ref)} /><span><b>{item.ref}</b><small>{item.title}</small></span></label>)}</div>
              {!controls.length && <div className="cow-empty">{tr ? "Control Library boş. Önce canonical kontrolleri oluşturun veya framework'ten içe aktarın." : "The Control Library is empty. Create canonical controls or import them from a framework first."}</div>}
              <footer className="cow-actions"><button type="button" className="ghost" onClick={() => setStep(2)}>{tr ? "Geri" : "Back"}</button><button type="button" className="primary" disabled={!selectedControls.length} onClick={() => { setRule((current) => ({ ...current, name: current.name || `${draft.name} · ${selectedPath}` })); setStep(4); }}>{tr ? "İzlemeyi Yapılandır" : "Configure Monitoring"}</button></footer>
            </div>
          )}

          {step === 4 && (
            <div className="cow-body">
              <div className="cow-copy"><small>4 · {tr ? "İZLEME" : "ENABLE MONITORING"}</small><h4>{tr ? "Sürekli güvence kuralını etkinleştir" : "Enable the continuous assurance rule"}</h4><p>{tr ? "İlk çalışma hemen yapılır; sonraki çalışmalar seçilen takvime göre devam eder. Eşik aşılırsa bulgu/CAPA ve bağlantılı risk akışı devreye girer." : "The first run executes immediately and future runs follow the schedule. Threshold breaches feed the finding/CAPA and linked-risk flow."}</p></div>
              <div className="cow-monitor-summary"><span><small>{tr ? "Kanıt kaynağı" : "Evidence source"}</small><b>{draft.name}</b></span><span><small>JSON path</small><b>{selectedPath}</b></span><span><small>{tr ? "İzlenen kontroller" : "Controls monitored"}</small><b>{selectedControls.length}</b></span><span><small>{tr ? "Risk güncelleme" : "Risk update"}</small><b>{tr ? "Eşik aşımında otomatik" : "Automatic on threshold breach"}</b></span></div>
              <div className="cow-form-grid">
                <label className="wide"><span>{tr ? "Sürekli kontrol adı" : "Continuous control name"}</span><input value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} /></label>
                <label><span>{tr ? "Doğrulama" : "Validation"}</span><select value={rule.operator} onChange={(event) => setRule({ ...rule, operator: event.target.value })}><option value="exists">{tr ? "Değer var" : "Value exists"}</option><option value="eq">=</option><option value="contains">contains</option><option value="gte">≥</option><option value="lte">≤</option></select></label>
                <label><span>{tr ? "Beklenen değer" : "Expected value"}</span><input disabled={rule.operator === "exists"} value={rule.expected} placeholder={rule.operator === "exists" ? (tr ? "Gerekli değil" : "Not required") : "..."} onChange={(event) => setRule({ ...rule, expected: event.target.value })} /></label>
                <label><span>{tr ? "Takvim" : "Schedule"}</span><select value={rule.schedule} onChange={(event) => setRule({ ...rule, schedule: event.target.value })}><option value="hourly">{tr ? "Saatlik" : "Hourly"}</option><option value="daily">{tr ? "Günlük" : "Daily"}</option><option value="weekly">{tr ? "Haftalık" : "Weekly"}</option><option value="monthly">{tr ? "Aylık" : "Monthly"}</option></select></label>
                <label><span>{tr ? "Kanıt tazeliği (saat)" : "Evidence freshness (hours)"}</span><input type="number" min="1" max="8760" value={rule.freshnessHours} onChange={(event) => setRule({ ...rule, freshnessHours: Number(event.target.value) })} /></label>
                <label><span>{tr ? "Bulgu eşiği" : "Finding threshold"}</span><input type="number" min="1" max="20" value={rule.failureThreshold} onChange={(event) => setRule({ ...rule, failureThreshold: Number(event.target.value) })} /></label>
                <label><span>{tr ? "CAPA termin (gün)" : "CAPA due (days)"}</span><input type="number" min="1" max="365" value={rule.remediationDueDays} onChange={(event) => setRule({ ...rule, remediationDueDays: Number(event.target.value) })} /></label>
              </div>
              <div className="cow-control-chips">{selectedControls.map((ref) => <span key={ref}>{ref}</span>)}</div>
              <footer className="cow-actions"><button type="button" className="ghost" onClick={() => setStep(3)}>{tr ? "Geri" : "Back"}</button><button type="button" className="primary" disabled={!!busy} onClick={() => void enableMonitoring()}>{busy === "enable" ? (tr ? "İlk kontrol çalışıyor…" : "Running first control…") : (tr ? "İzlemeyi Etkinleştir" : "Enable Monitoring")}</button></footer>
            </div>
          )}

          {step === 5 && (
            <div className="cow-body cow-complete">
              <div className="cow-complete-mark">✓</div>
              <small>CONTINUOUS ASSURANCE ACTIVE</small>
              <h4>{tr ? "Connector izlemeye alındı" : "Connector monitoring is active"}</h4>
              <p>{tr ? "Kaynak doğrulandı, kontrol eşleştirmesi kaydedildi ve ilk kanıt toplama çalışması tamamlandı. Aşağıdaki kayıtların tamamı Connected GRC zincirinde doğrudan izlenebilir." : "The source was validated, control mappings were saved and the first evidence collection run completed. Every record below is directly traceable in the Connected GRC chain."}</p>
              <div className="cow-monitor-summary"><span><small>{tr ? "Kaynak" : "Source"}</small><b>{draft.name}</b></span><span><small>{tr ? "Kontrol" : "Controls"}</small><b>{selectedControls.length}</b></span><span><small>{tr ? "İlk çalışma" : "First run"}</small><b>{runStatus || "—"}</b></span><span><small>Rule ID</small><b>{ruleId.slice(0, 12) || "—"}</b></span></div>
              <div className="cow-control-chips cow-linked-controls">{selectedControls.map((ref) => <button type="button" key={ref} onClick={() => openControl(ref)} aria-label={`${tr ? "Kontrolü aç" : "Open control"} ${ref}`}>{ref}</button>)}</div>
              <footer className="cow-actions"><span>{runFindingId ? (tr ? "İlk çalışma eşik aştı; bağlı risk/bulgu akışı oluştu." : "The first run crossed the threshold; the linked risk/finding flow was created.") : (tr ? "Başarısızlık eşiğinde Fornost bulgu/CAPA ve risk sinyalini bağlı modele taşır." : "At the failure threshold, Fornost feeds finding/CAPA and risk signals into the connected model.")}</span><div>{sourceId&&<button type="button" className="ghost" onClick={openSource}>{tr ? "Kaynağı Aç" : "Open Source"}</button>}{ruleId&&<button type="button" className="ghost" onClick={openRule}>{tr ? "Kuralı Aç" : "Open Rule"}</button>}{runEvidenceId&&<button type="button" className="ghost" onClick={openEvidence}>{tr ? "Kanıtı Aç" : "Open Evidence"}</button>}{runFindingId&&<button type="button" className="ghost" onClick={openFinding}>{tr ? "Bulguyu Aç" : "Open Finding"}</button>}<button type="button" className="primary" onClick={reset}>{tr ? "Tamam" : "Done"}</button></div></footer>
            </div>
          )}
        </div>
      )}
    </section>,
    mount,
  );
}
