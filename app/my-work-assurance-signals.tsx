"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildAuditEvidenceAssurance } from "./audit-evidence-assurance";
import { buildControlAssurance, type AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import "./my-work-assurance-signals.css";

type Lang = "tr" | "en";
type RawRow = { id?: unknown; code?: unknown; module?: unknown; data?: unknown; data_json?: unknown };
type User = { name?: string; email?: string; role?: string };
type HistoryItem = { id?: unknown; integrity?: unknown };
type HistoryPayload = { evidenceItems?: HistoryItem[] };

type Signal = {
  key: string;
  module: string;
  count: number;
  tone: "critical" | "warning";
  titleTr: string;
  titleEn: string;
  detailTr: string;
  detailEn: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).normalize("NFKC").toLocaleLowerCase("tr-TR");

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function normalizeRows(body: unknown): AssuranceRow[] {
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
    return { id: text(raw.id) || `assurance-signal-${index}`, code: text(raw.code) || undefined, module: text(raw.module), data };
  }).filter((row) => row.module);
}

function identityMatches(value: unknown, user: User) {
  if (user.role === "Admin") return true;
  const candidate = normalized(value);
  if (!candidate) return false;
  const identities = [user.name, user.email].map(normalized).filter(Boolean);
  return identities.some((identity) => candidate === identity || candidate.includes(identity) || identity.includes(candidate));
}

function staleEvidence(row: AssuranceRow, today: string) {
  const status = normalized(row.data.status || row.data.reviewStatus);
  const expiry = text(row.data.expiresAt || row.data.freshUntil).slice(0, 10);
  return ["süresi doldu", "expired", "stale", "reddedildi", "rejected"].includes(status) || (!!expiry && expiry < today);
}

function navigateTo(module: string) {
  const labels: Record<string, string[]> = {
    Kontroller: ["Kontrol Kütüphanesi", "Control Library"],
    Kanıtlar: ["Kanıt Kütüphanesi", "Evidence Library"],
    "Denetim Yönetimi": ["Denetim Yönetimi", "Audit Management"],
  };
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button[aria-label]"));
  buttons.find((button) => (labels[module] || [module]).some((label) => normalized(button.getAttribute("aria-label")).includes(normalized(label))))?.click();
}

export default function MyWorkAssuranceSignals() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [rows, setRows] = useState<AssuranceRow[]>([]);
  const [history, setHistory] = useState<HistoryPayload>({});
  const [user, setUser] = useState<User>({});

  useEffect(() => {
    const discover = () => {
      setLang(currentLanguage());
      const queue = document.querySelector<HTMLElement>(".my-work-v2 .mw2-queue");
      if (!queue) {
        setMount(null);
        return;
      }
      const parent = queue.parentElement;
      if (!parent) return;
      let created = parent.querySelector<HTMLElement>(":scope > .mw-assurance-signals-mount");
      if (!created) {
        created = document.createElement("div");
        created.className = "mw-assurance-signals-mount";
        parent.insertBefore(created, queue);
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
      document.querySelector(".mw-assurance-signals-mount")?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mount) return;
    let active = true;
    const load = async () => {
      const [grcResult, historyResult, authResult] = await Promise.allSettled([
        fetch(withBasePath("/api/grc"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error("grc"))),
        fetch(withBasePath("/api/evidence/history"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error("history"))),
        fetch(withBasePath("/api/auth"), { cache: "no-store" }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error("auth"))),
      ]);
      if (!active) return;
      if (grcResult.status === "fulfilled") setRows(normalizeRows(grcResult.value));
      if (historyResult.status === "fulfilled") setHistory(historyResult.value as HistoryPayload);
      if (authResult.status === "fulfilled") setUser((authResult.value as { user?: User }).user || {});
    };
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mount]);

  const signals = useMemo<Signal[]>(() => {
    const result: Signal[] = [];
    const controls = buildControlAssurance(rows).items.filter((item) => item.state === "critical" && identityMatches(item.owner, user));
    if (controls.length) result.push({
      key: "control",
      module: "Kontroller",
      count: controls.length,
      tone: "critical",
      titleTr: "Kritik kontrol güvencesi",
      titleEn: "Critical control assurance",
      detailTr: "Kanıt, test, otomasyon veya CAPA sinyali kritik seviyede.",
      detailEn: "Evidence, testing, automation or CAPA signals are critical.",
    });

    const auditRows = rows.filter((row) => row.module === "Denetim Yönetimi");
    const evidenceRows = rows.filter((row) => row.module === "Kanıtlar");
    const audit = buildAuditEvidenceAssurance(auditRows, evidenceRows);
    const auditGaps = audit.gaps.filter((gap) => identityMatches(gap.owner, user));
    if (auditGaps.length) result.push({
      key: "audit",
      module: "Denetim Yönetimi",
      count: auditGaps.length,
      tone: auditGaps.some((gap) => gap.status === "missing") ? "critical" : "warning",
      titleTr: "Denetim kanıt boşluğu",
      titleEn: "Audit evidence gap",
      detailTr: "Kapsamdaki maddelerde eksik veya güncel olmayan kanıt var.",
      detailEn: "In-scope requirements have missing or stale evidence.",
    });

    const today = new Date().toISOString().slice(0, 10);
    const integrity = new Map((history.evidenceItems || []).map((item) => [text(item.id), normalized(item.integrity)]));
    const evidenceIssues = evidenceRows.filter((row) => {
      if (!identityMatches(row.data.owner, user)) return false;
      const state = integrity.get(row.id) || "legacy-unverified";
      return staleEvidence(row, today) || state === "broken";
    });
    if (evidenceIssues.length) result.push({
      key: "evidence",
      module: "Kanıtlar",
      count: evidenceIssues.length,
      tone: evidenceIssues.some((row) => integrity.get(row.id) === "broken") ? "critical" : "warning",
      titleTr: "Kanıt kalite problemi",
      titleEn: "Evidence quality issue",
      detailTr: "Bayat kanıt veya bütünlük zinciri problemi aksiyon bekliyor.",
      detailEn: "Stale evidence or integrity-chain issues need action.",
    });

    return result;
  }, [rows, history, user]);

  if (!mount || !signals.length) return null;
  const tr = lang === "tr";

  return createPortal(
    <section className="mw-assurance-signals" aria-label={tr ? "Sistem üretimli güvence aksiyonları" : "System-generated assurance actions"}>
      <header><div><small>{tr ? "SİSTEM ÜRETİMLİ AKSİYONLAR" : "SYSTEM-GENERATED ACTIONS"}</small><b>{tr ? "Fornost'un otomatik olarak tespit ettiği işler" : "Work detected automatically by Fornost"}</b></div><span>{signals.reduce((sum, signal) => sum + signal.count, 0)}</span></header>
      <div>
        {signals.map((signal) => (
          <button type="button" key={signal.key} className={signal.tone} onClick={() => navigateTo(signal.module)}>
            <i aria-hidden="true" />
            <strong>{signal.count}</strong>
            <span><b>{tr ? signal.titleTr : signal.titleEn}</b><small>{tr ? signal.detailTr : signal.detailEn}</small></span>
            <em>→</em>
          </button>
        ))}
      </div>
    </section>,
    mount,
  );
}
