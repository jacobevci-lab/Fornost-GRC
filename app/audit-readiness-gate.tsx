"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildAuditEvidenceAssurance, type AssuranceRecord } from "./audit-evidence-assurance";
import { withBasePath } from "./base-path";
import "./audit-readiness-gate.css";

type Lang = "tr" | "en";
type RawRow = {
  id?: unknown;
  code?: unknown;
  recordCode?: unknown;
  record_code?: unknown;
  module?: unknown;
  data?: unknown;
  data_json?: unknown;
};
type Row = AssuranceRecord & { module: string; code?: string };

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).normalize("NFKC").toLocaleLowerCase("tr-TR");

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function normalizeRows(body: unknown): Row[] {
  if (!body || typeof body !== "object") return [];
  const source = Array.isArray((body as { rows?: unknown }).rows) ? (body as { rows: RawRow[] }).rows : [];
  return source.map((raw, index) => {
    let data: Record<string, unknown> = {};
    if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) data = raw.data as Record<string, unknown>;
    else if (typeof raw.data_json === "string") {
      try {
        const parsed = JSON.parse(raw.data_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
      } catch {}
    }
    return {
      id: text(raw.id) || `audit-readiness-${index}`,
      code: text(raw.code || raw.recordCode || raw.record_code) || undefined,
      module: text(raw.module),
      data,
    };
  }).filter((row) => row.module);
}

function activeAuditName() {
  const detail = document.querySelector<HTMLElement>(".audit-detail-head");
  if (!detail || detail.getClientRects().length === 0) return "";
  return text(detail.querySelector("h1,h2,h3")?.textContent);
}

function navigateTo(module: string) {
  const labels: Record<string, string[]> = {
    Kanıtlar: ["Kanıt Kütüphanesi", "Evidence Library"],
    Kontroller: ["Kontrol Kütüphanesi", "Control Library"],
    "Bulgular ve CAPA": ["Bulgular ve CAPA", "Findings & CAPA"],
  };
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button[aria-label]"));
  const target = buttons.find((button) => (labels[module] || [module]).some((label) => normalized(button.getAttribute("aria-label")).includes(normalized(label))));
  target?.click();
}

function formatDate(value: string, lang: Lang) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function AuditReadinessGate() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [auditName, setAuditName] = useState("");

  useEffect(() => {
    const discover = () => {
      setLang(currentLanguage());
      setAuditName(activeAuditName());
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(".audit-evidence-assurance"));
      const visible = candidates.find((candidate) => candidate.getClientRects().length > 0) || null;
      setTarget((current) => current === visible ? current : visible);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    const onClick = () => window.setTimeout(discover, 0);
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    if (!target) {
      setMount(null);
      return;
    }
    target.classList.add("audit-readiness-legacy-hidden");
    const created = document.createElement("div");
    created.className = "audit-readiness-gate-mount";
    target.insertAdjacentElement("afterend", created);
    setMount(created);
    return () => {
      target.classList.remove("audit-readiness-legacy-hidden");
      created.remove();
      setMount(null);
    };
  }, [target]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(withBasePath("/api/grc"), { cache: "no-store" });
      if (response.ok) setRows(normalizeRows(await response.json()));
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mount) return;
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => window.clearInterval(timer);
  }, [mount, load]);

  const assurance = useMemo(() => {
    const allAuditRows = rows.filter((row) => row.module === "Denetim Yönetimi");
    const auditRows = auditName
      ? allAuditRows.filter((row) => normalized(row.data.auditName) === normalized(auditName))
      : allAuditRows;
    const evidence = rows.filter((row) => row.module === "Kanıtlar");
    return buildAuditEvidenceAssurance(auditRows, evidence);
  }, [rows, auditName]);

  if (!mount) return null;
  const tr = lang === "tr";
  const gateLabel = assurance.gate === "ready"
    ? (tr ? "DENETİME HAZIR" : "AUDIT READY")
    : assurance.gate === "attention"
      ? (tr ? "GÖZDEN GEÇİR" : "REVIEW")
      : assurance.gate === "empty"
        ? (tr ? "KAPSAM BEKLİYOR" : "WAITING FOR SCOPE")
        : (tr ? "HAZIR DEĞİL" : "NOT READY");
  const headline = assurance.gate === "ready"
    ? (tr ? "Kanıt zinciri hazır" : "Evidence chain is ready")
    : assurance.gate === "empty"
      ? (tr ? "Önce denetim maddelerini kapsama alın" : "Add audit requirements to scope first")
      : tr
        ? `${assurance.gaps.length} madde denetim öncesi aksiyon istiyor`
        : `${assurance.gaps.length} requirements need action before audit`;

  return createPortal(
    <section className={`audit-readiness-gate ${assurance.gate}`} aria-label={tr ? "Denetim hazırlık kapısı" : "Audit readiness gate"}>
      <header className="audit-readiness-head">
        <div>
          <small>{tr ? "AUDIT READINESS GATE" : "AUDIT READINESS GATE"}</small>
          <h3>{headline}</h3>
          <p>{auditName ? `${tr ? "Kapsam" : "Scope"}: ${auditName}` : (tr ? "Denetim portföyündeki kontrol ve kanıt hazırlığını tek görünümde izler." : "Tracks control and evidence readiness across the audit portfolio in one view.")}</p>
        </div>
        <div className="audit-readiness-state">
          <span>{gateLabel}</span>
          <strong>{assurance.total ? `${assurance.readiness}%` : "—"}</strong>
          <small>{tr ? "hazır kanıt" : "ready evidence"}</small>
        </div>
      </header>

      <div className="audit-readiness-metrics">
        <button type="button" onClick={() => navigateTo("Kanıtlar")}><small>{tr ? "Güncel" : "Current"}</small><strong>{assurance.current}</strong><span>{tr ? "onaylı kanıt" : "approved evidence"}</span></button>
        <button type="button" className={assurance.stale ? "warning" : ""} onClick={() => navigateTo("Kanıtlar")}><small>{tr ? "Bayat / süresi dolan" : "Stale / expired"}</small><strong>{assurance.stale}</strong><span>{tr ? "yenilenmeli" : "needs refresh"}</span></button>
        <button type="button" className={assurance.missing.length ? "danger" : ""} onClick={() => navigateTo("Kanıtlar")}><small>{tr ? "Kanıtsız" : "Missing"}</small><strong>{assurance.missing.length}</strong><span>{tr ? "kanıt bekliyor" : "needs evidence"}</span></button>
        <article><small>{tr ? "Bağlantı kapsamı" : "Link coverage"}</small><strong>{assurance.total ? `${assurance.coverage}%` : "—"}</strong><span>{tr ? "en az bir kanıt bağlı" : "at least one evidence linked"}</span></article>
      </div>

      {assurance.gaps.length > 0 ? (
        <div className="audit-readiness-gaps">
          <div className="audit-readiness-gaps-head">
            <div><small>{tr ? "ÖNCELİKLİ BOŞLUKLAR" : "PRIORITY GAPS"}</small><b>{tr ? "Sadece aksiyon gerektiren maddeler" : "Only requirements that need action"}</b></div>
            <span>{assurance.gaps.length}</span>
          </div>
          <div className="audit-readiness-list">
            {assurance.gaps.slice(0, 8).map((gap) => (
              <article key={gap.reference} className={gap.status}>
                <i aria-hidden="true" />
                <div className="audit-readiness-gap-copy">
                  <b>{gap.reference}</b>
                  <span>{gap.title || (tr ? "Denetim maddesi" : "Audit requirement")}</span>
                  <small>{gap.owner || (tr ? "Sahip atanmadı" : "Owner unassigned")} · {gap.dueDate ? formatDate(gap.dueDate, lang) : (tr ? "Termin yok" : "No due date")}</small>
                </div>
                <div className="audit-readiness-gap-state">
                  <strong>{gap.status === "missing" ? (tr ? "Kanıt yok" : "Missing") : (tr ? "Güncel değil" : "Stale")}</strong>
                  <small>{gap.linkedEvidence} {tr ? "bağlı" : "linked"}</small>
                </div>
              </article>
            ))}
          </div>
          {assurance.gaps.length > 8 && <div className="audit-readiness-more">+{assurance.gaps.length - 8} {tr ? "ek boşluk" : "more gaps"}</div>}
        </div>
      ) : assurance.total > 0 ? (
        <div className="audit-readiness-complete"><b>✓ {tr ? "Tüm kapsamdaki maddelerin güncel, onaylı kanıtı var." : "Every in-scope requirement has current approved evidence."}</b></div>
      ) : null}

      <footer className="audit-readiness-actions">
        <div><small>{lastUpdated ? `${tr ? "Son kontrol" : "Last check"}: ${lastUpdated.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</small></div>
        <div>
          <button type="button" className="secondary" onClick={() => navigateTo("Kontroller")}>{tr ? "Kontroller" : "Controls"}</button>
          <button type="button" className="secondary" onClick={() => navigateTo("Bulgular ve CAPA")}>{tr ? "Bulgular / CAPA" : "Findings / CAPA"}</button>
          <button type="button" onClick={() => navigateTo("Kanıtlar")}>{tr ? "Kanıtları Tamamla" : "Complete Evidence"}</button>
          <button type="button" className="refresh" disabled={loading} onClick={() => void load()}>{loading ? "…" : "↻"}</button>
        </div>
      </footer>
    </section>,
    mount,
  );
}
