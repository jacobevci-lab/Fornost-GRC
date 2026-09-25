"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./evidence-quality-lens.css";

type Lang = "tr" | "en";
type RawRow = { id?: unknown; module?: unknown; data?: unknown; data_json?: unknown };
type Row = { id: string; module: string; data: Record<string, unknown> };
type IntegrityItem = { id?: unknown; integrity?: unknown; checkedVersions?: unknown; failedVersion?: unknown; tracked?: unknown };
type HistoryPayload = { evidenceItems?: IntegrityItem[] };
type QualityIssue = { id: string; recordRef: string; title: string; owner: string; controlRefs: string[]; kind: "broken" | "stale" | "legacy" | "unlinked" | "owner" | "unknown"; detail: string };

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
const splitRefs = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap(splitRefs)
  : text(value).split(/[;,|\n]+/).map((item) => item.trim()).filter(Boolean);

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
    return { id: text(raw.id) || `evidence-quality-${index}`, module: text(raw.module), data };
  }).filter((row) => row.module === "Kanıtlar");
}

function isEvidenceHeading(node: HTMLElement) {
  const heading = normalized(node.querySelector("h1,h2,h3")?.textContent);
  return heading.includes("kanıt kütüphanesi") || heading.includes("evidence library");
}

function isExpired(row: Row, today: string) {
  const status = normalized(row.data.status || row.data.reviewStatus);
  const expiry = text(row.data.expiresAt || row.data.freshUntil).slice(0, 10);
  return ["süresi doldu", "expired", "stale", "reddedildi", "rejected"].includes(status) || (!!expiry && expiry < today);
}

function isCurrent(row: Row, today: string) {
  if (isExpired(row, today)) return false;
  const status = normalized(row.data.status || row.data.reviewStatus);
  return ["onaylandı", "approved", "güncel", "current", "kabul edildi", "accepted", "valid", "geçerli"].includes(status);
}

function formatIssue(kind: QualityIssue["kind"], lang: Lang, failedVersion = 0) {
  const tr = lang === "tr";
  if (kind === "broken") return tr ? `Bütünlük zinciri bozuk${failedVersion ? ` · v${failedVersion}` : ""}` : `Integrity chain broken${failedVersion ? ` · v${failedVersion}` : ""}`;
  if (kind === "stale") return tr ? "Kanıt güncel değil veya süresi doldu" : "Evidence is stale or expired";
  if (kind === "legacy") return tr ? "Versiyon zinciri doğrulanmamış" : "Version chain is unverified";
  if (kind === "unlinked") return tr ? "Kontrole bağlanmamış" : "Not linked to a control";
  if (kind === "owner") return tr ? "Kanıt sahibi atanmadı" : "Evidence owner is missing";
  return tr ? "Bütünlük doğrulaması kullanılamıyor" : "Integrity verification unavailable";
}

export default function EvidenceQualityLens() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<HistoryPayload>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const discover = () => {
      setLang(currentLanguage());
      const visible = Array.from(document.querySelectorAll<HTMLElement>(".module-head"))
        .find((candidate) => candidate.getClientRects().length > 0 && isEvidenceHeading(candidate)) || null;
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
    const created = document.createElement("div");
    created.className = "evidence-quality-lens-mount";
    target.insertAdjacentElement("afterend", created);
    setMount(created);
    return () => {
      created.remove();
      setMount(null);
    };
  }, [target]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grcResult, historyResult] = await Promise.allSettled([
        fetch(withBasePath("/api/grc"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error("grc"))),
        fetch(withBasePath("/api/evidence/history"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error("history"))),
      ]);
      if (grcResult.status === "fulfilled") setRows(normalizeRows(grcResult.value));
      if (historyResult.status === "fulfilled") setHistory(historyResult.value as HistoryPayload);
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

  const quality = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const integrity = new Map<string, { state: string; failedVersion: number }>();
    for (const item of history.evidenceItems || []) {
      const id = text(item.id);
      if (!id) continue;
      integrity.set(id, { state: normalized(item.integrity), failedVersion: Number(item.failedVersion || 0) });
    }

    let current = 0;
    let stale = 0;
    let broken = 0;
    let legacy = 0;
    let unlinked = 0;
    const issues: QualityIssue[] = [];

    for (const row of rows) {
      const title = text(row.data.evidenceTitle || row.id);
      const owner = text(row.data.owner);
      const controlRefs = [...new Set([...splitRefs(row.data.controlRefs), ...splitRefs(row.data.controlRef)])];
      const integrityState = integrity.get(row.id) || { state: "legacy-unverified", failedVersion: 0 };
      const expired = isExpired(row, today);
      if (isCurrent(row, today)) current += 1;
      if (expired) stale += 1;
      if (integrityState.state === "broken") broken += 1;
      if (integrityState.state === "legacy-unverified") legacy += 1;
      if (!controlRefs.length) unlinked += 1;

      const issueKinds: QualityIssue["kind"][] = [];
      if (integrityState.state === "broken") issueKinds.push("broken");
      if (expired) issueKinds.push("stale");
      if (integrityState.state === "legacy-unverified") issueKinds.push("legacy");
      else if (integrityState.state === "unavailable") issueKinds.push("unknown");
      if (!controlRefs.length) issueKinds.push("unlinked");
      if (!owner) issueKinds.push("owner");

      for (const kind of issueKinds) {
        issues.push({ id: `${row.id}:${kind}`, recordRef: title, title, owner, controlRefs, kind, detail: formatIssue(kind, lang, integrityState.failedVersion) });
      }
    }

    const weight: Record<QualityIssue["kind"], number> = { broken: 0, stale: 1, unlinked: 2, owner: 3, legacy: 4, unknown: 5 };
    issues.sort((a, b) => weight[a.kind] - weight[b.kind] || a.title.localeCompare(b.title, lang === "tr" ? "tr" : "en"));
    const total = rows.length;
    const health = total ? Math.round((current / total) * 100) : 100;
    return { total, current, stale, broken, legacy, unlinked, issues, health };
  }, [rows, history, lang]);

  if (!mount) return null;
  const tr = lang === "tr";

  return createPortal(
    <section className="evidence-quality-lens" aria-label={tr ? "Kanıt kalite görünümü" : "Evidence quality lens"}>
      <header>
        <div>
          <small>{tr ? "EVIDENCE QUALITY" : "EVIDENCE QUALITY"}</small>
          <h3>{tr ? "Kanıt tazeliği ve bütünlüğü" : "Evidence freshness and integrity"}</h3>
          <p>{tr ? "Audit readiness için kanıtın yalnız varlığını değil; güncelliğini, kontrol bağlantısını ve versiyon bütünlüğünü izler." : "Tracks not only evidence existence, but also freshness, control linkage and version integrity for audit readiness."}</p>
        </div>
        <div className="eql-health"><strong>{quality.total ? `${quality.health}%` : "—"}</strong><span>{tr ? "güncel kanıt" : "current evidence"}</span></div>
      </header>

      <div className="eql-metrics">
        <article><small>{tr ? "Toplam" : "Total"}</small><strong>{quality.total}</strong><span>{tr ? "kanıt kaydı" : "evidence records"}</span></article>
        <article><small>{tr ? "Güncel" : "Current"}</small><strong>{quality.current}</strong><span>{tr ? "kullanıma hazır" : "ready to use"}</span></article>
        <article className={quality.stale ? "warning" : ""}><small>{tr ? "Bayat" : "Stale"}</small><strong>{quality.stale}</strong><span>{tr ? "yenilenmeli" : "needs refresh"}</span></article>
        <article className={quality.broken ? "danger" : ""}><small>{tr ? "Bütünlük hatası" : "Integrity failure"}</small><strong>{quality.broken}</strong><span>{tr ? "zincir bozuk" : "broken chain"}</span></article>
        <article className={quality.unlinked ? "warning" : ""}><small>{tr ? "Bağlantısız" : "Unlinked"}</small><strong>{quality.unlinked}</strong><span>{tr ? "kontrol referansı yok" : "no control reference"}</span></article>
      </div>

      {quality.issues.length > 0 ? (
        <div className="eql-issues">
          <div className="eql-issues-head"><div><small>{tr ? "ÖNCELİKLİ KALİTE SİNYALLERİ" : "PRIORITY QUALITY SIGNALS"}</small><b>{tr ? "Önce en yüksek güvence risklerini düzelt" : "Fix the highest assurance risks first"}</b></div><span>{quality.issues.length}</span></div>
          <div className="eql-list">
            {quality.issues.slice(0, 6).map((issue) => (
              <button type="button" key={issue.id} className={`eql-issue ${issue.kind}`} onClick={() => navigateToFornost({ module: "Kanıtlar", ref: issue.recordRef, kind: "evidence", source: "evidence-quality", filter: { recordRef: issue.recordRef } })}>
                <i aria-hidden="true" />
                <div><b>{issue.title}</b><span>{issue.detail}</span><small>{issue.owner || (tr ? "Sahip yok" : "No owner")} · {issue.controlRefs.length ? issue.controlRefs.join(", ") : (tr ? "Kontrol bağlantısı yok" : "No control linkage")} · →</small></div>
              </button>
            ))}
          </div>
          {quality.issues.length > 6 && <small className="eql-more">+{quality.issues.length - 6} {tr ? "ek kalite sinyali" : "more quality signals"}</small>}
        </div>
      ) : quality.total > 0 ? <div className="eql-complete">✓ {tr ? "Kanıt portföyünde açık kalite sinyali yok." : "No open quality signals in the evidence portfolio."}</div> : null}

      <footer><small>{lastUpdated ? `${tr ? "Son kontrol" : "Last check"}: ${lastUpdated.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</small><button type="button" disabled={loading} onClick={() => void load()}>{loading ? "…" : (tr ? "Yenile" : "Refresh")}</button></footer>
    </section>,
    mount,
  );
}
