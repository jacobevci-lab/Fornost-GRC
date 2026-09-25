"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import { assessedRiskScore } from "./risk-methodology";
import { navigateToFornost } from "./navigation-focus";
import "./my-work-v2.css";

type Lang = "tr" | "en";
type Scope = "mine" | "organization";
type QueueFilter = "priority" | "overdue" | "soon" | "waiting" | "undated" | "completed" | "all";
type RawRow = {
  id?: unknown;
  code?: unknown;
  recordCode?: unknown;
  record_code?: unknown;
  module?: unknown;
  data?: unknown;
  data_json?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};
type Row = {
  id: string;
  code?: string;
  module: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};
type User = { name?: string; email?: string; role?: string };
type QueueItem = {
  row: Row;
  title: string;
  owner: string;
  status: string;
  due: string;
  dueTime: number;
  priority: number;
  reason: string;
  tone: "critical" | "warning" | "normal" | "muted";
  waiting: boolean;
};

const DAY = 86_400_000;
const CLOSED = new Set([
  "kapalı",
  "kapatıldı",
  "tamamlandı",
  "onaylandı",
  "closed",
  "completed",
  "approved",
  "retired",
  "resolved",
  "archived",
  "arşivlendi",
]);
const REVIEW_STATES = [
  "incelemede",
  "under review",
  "review",
  "submitted",
  "gönderildi",
  "verification pending",
  "doğrulama bekliyor",
  "approval pending",
  "onay bekliyor",
];
const MODULE_LABELS: Record<string, { tr: string; en: string }> = {
  "Risk Assessment": { tr: "Risk", en: "Risk" },
  BIA: { tr: "BIA", en: "BIA" },
  "Varlık Envanteri": { tr: "Varlık", en: "Asset" },
  Uyum: { tr: "Uyum", en: "Compliance" },
  Kontroller: { tr: "Kontrol", en: "Control" },
  Kanıtlar: { tr: "Kanıt", en: "Evidence" },
  Tedarikçiler: { tr: "Tedarikçi", en: "Vendor" },
  "Denetim Yönetimi": { tr: "Denetim", en: "Audit" },
  "Bulgular ve CAPA": { tr: "Bulgu / CAPA", en: "Finding / CAPA" },
  "Risk İştahı ve KRI": { tr: "KRI", en: "KRI" },
  "İş Sürekliliği": { tr: "Süreklilik", en: "Continuity" },
};

const clean = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => clean(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
const dateValue = (value: unknown) => {
  const time = new Date(clean(value)).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
};
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
      id: clean(raw.id) || `work-${index}`,
      code: clean(raw.code || raw.recordCode || raw.record_code) || undefined,
      module: clean(raw.module),
      data,
      createdAt: clean(raw.createdAt || raw.created_at) || undefined,
      updatedAt: clean(raw.updatedAt || raw.updated_at) || undefined,
    };
  }).filter(row => row.module);
}
function ownerValues(row: Row) {
  const d = row.data;
  return [
    d.owner,
    d.ownerEmail,
    d.actionOwner,
    d.followUpOwner,
    d.testOwner,
    d.reviewer,
    d.approver,
    d.evidenceOwner,
    d.auditOwner,
    d.technicalOwner,
    d.custodian,
  ].map(clean).filter(Boolean);
}
function primaryOwnerValues(row: Row) {
  const d = row.data;
  return [d.owner, d.ownerEmail, d.actionOwner, d.testOwner, d.evidenceOwner, d.auditOwner, d.technicalOwner, d.custodian].map(clean).filter(Boolean);
}
function dueValue(row: Row) {
  const d = row.data;
  return clean(
    d.dueDate || d.targetDate || d.nextReview || d.nextAssessment || d.nextTestDate ||
      d.reviewDate || d.expiresAt || d.contractEnd || d.endDate,
  );
}
function rowTitle(row: Row) {
  const d = row.data;
  return clean(
    d.title || d.process || d.controlTitle || d.requirementTitle || d.evidenceTitle ||
      d.service || d.vendorName || d.finding || row.code || row.id,
  );
}
function rowOwner(row: Row) {
  return ownerValues(row)[0] || "—";
}
function rowStatus(row: Row) {
  const d = row.data;
  return clean(d.status || d.reviewStatus || d.implementation || d.evidenceStatus) || "—";
}
function recordCode(row: Row) {
  return row.code || row.id;
}
function formatDate(value: string, lang: Lang) {
  if (!value) return lang === "tr" ? "Tarih yok" : "No due date";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(time));
}
function identitiesFor(user: User) {
  return [user.name, user.email].map(normalized).filter(Boolean);
}
function valuesMatchIdentity(values: string[], user: User) {
  const identities = identitiesFor(user);
  if (!identities.length) return false;
  return values.some(value => {
    const candidate = normalized(value);
    return identities.some(identity => candidate === identity || candidate.includes(identity) || identity.includes(candidate));
  });
}
function matchesIdentity(row: Row, user: User) {
  return valuesMatchIdentity(ownerValues(row), user);
}
function isClosed(row: Row) {
  return CLOSED.has(normalized(row.data.status || row.data.reviewStatus));
}
function isWaitingForOthers(row: Row, user: User) {
  if (!valuesMatchIdentity(primaryOwnerValues(row), user)) return false;
  const counterparties = [row.data.reviewer, row.data.approver, row.data.followUpOwner].map(clean).filter(Boolean);
  if (!counterparties.length || valuesMatchIdentity(counterparties, user)) return false;
  const state = normalized(row.data.reviewStatus || row.data.status);
  return REVIEW_STATES.some(candidate => state.includes(candidate)) || Boolean(row.data.submittedAt || row.data.submittedBy || row.data.reviewStatus);
}
function priorityFor(row: Row, dueTime: number, now: number) {
  if (Number.isFinite(dueTime) && dueTime < now) return 0;
  if (Number.isFinite(dueTime) && dueTime <= now + 7 * DAY) return 1;
  if (row.module === "Risk Assessment") {
    const riskScore = assessedRiskScore(row.data);
    if (riskScore === null || riskScore >= 17) return 1;
  }
  if (["kritik", "critical"].includes(normalized(row.data.criticality || row.data.riskLevel))) return 1;
  if (Number.isFinite(dueTime) && dueTime <= now + 30 * DAY) return 2;
  if (!Number.isFinite(dueTime)) return 4;
  return 3;
}
function reasonFor(row: Row, dueTime: number, now: number, lang: Lang) {
  const tr = lang === "tr";
  if (Number.isFinite(dueTime) && dueTime < now) return tr ? "Termin geçti" : "Overdue";
  if (Number.isFinite(dueTime) && dueTime <= now + 7 * DAY) return tr ? "7 gün içinde" : "Due within 7 days";
  if (row.module === "Risk Assessment") {
    const riskScore = assessedRiskScore(row.data);
    if (riskScore === null) return tr ? "Risk değerlendirmesi bekliyor" : "Risk assessment pending";
    if (riskScore >= 17) return tr ? "Kritik risk" : "Critical risk";
  }
  if (["kritik", "critical"].includes(normalized(row.data.criticality || row.data.riskLevel))) return tr ? "Kritik kapsam" : "Critical scope";
  if (Number.isFinite(dueTime) && dueTime <= now + 30 * DAY) return tr ? "30 gün içinde" : "Due within 30 days";
  if (!Number.isFinite(dueTime)) return tr ? "Termin tanımsız" : "No due date";
  return tr ? "Açık sorumluluk" : "Open responsibility";
}
function toneFor(priority: number): QueueItem["tone"] {
  return priority === 0 ? "critical" : priority === 1 ? "warning" : priority === 4 ? "muted" : "normal";
}
function itemFromRow(row: Row, user: User, now: number, lang: Lang, completed = false): QueueItem {
  const due = dueValue(row);
  const dueTime = dateValue(due);
  const priority = completed ? 4 : priorityFor(row, dueTime, now);
  return {
    row,
    title: rowTitle(row),
    owner: rowOwner(row),
    status: rowStatus(row),
    due,
    dueTime,
    priority,
    reason: completed ? (lang === "tr" ? "Tamamlandı" : "Completed") : reasonFor(row, dueTime, now, lang),
    tone: completed ? "muted" : toneFor(priority),
    waiting: !completed && isWaitingForOthers(row, user),
  };
}
function navigateToRecord(row: Row) {
  navigateToFornost({
    module: row.module,
    ref: recordCode(row),
    kind: "record",
    source: "my-work",
    filter: { recordRef: recordCode(row) },
  });
}

export default function MyWorkV2() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [rows, setRows] = useState<Row[]>([]);
  const [user, setUser] = useState<User>({});
  const [scope, setScope] = useState<Scope>("mine");
  const [filter, setFilter] = useState<QueueFilter>("priority");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let created: HTMLDivElement | null = null;
    const discover = () => {
      setLang(currentLanguage());
      const legacy = document.querySelector<HTMLElement>(".my-work-page");
      if (!legacy) {
        setMount(null);
        return;
      }
      legacy.classList.add("my-work-v2-legacy-hidden");
      created = legacy.parentElement?.querySelector<HTMLDivElement>(":scope > .my-work-v2-mount") || null;
      if (!created) {
        created = document.createElement("div");
        created.className = "my-work-v2-mount";
        legacy.insertAdjacentElement("afterend", created);
      }
      setMount(current => current === created ? current : created);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = () => setLang(currentLanguage());
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      document.querySelector(".my-work-page")?.classList.remove("my-work-v2-legacy-hidden");
      created?.remove();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grcResult, authResult] = await Promise.allSettled([
        fetch(withBasePath("/api/grc"), { cache: "no-store" }).then(async response => response.ok ? response.json() : Promise.reject(new Error("grc"))),
        fetch(withBasePath("/api/auth"), { cache: "no-store" }).then(async response => response.ok ? response.json() : Promise.reject(new Error("auth"))),
      ]);
      if (grcResult.status === "fulfilled") setRows(normalizeRows(grcResult.value));
      if (authResult.status === "fulfilled") setUser((authResult.value as { user?: User }).user || {});
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

  const data = useMemo(() => {
    const now = Date.now();
    const scoped = rows.filter(row => scope === "organization" && user.role === "Admin" ? true : matchesIdentity(row, user));
    const openRows = scoped.filter(row => !isClosed(row));
    const completedRows = scoped.filter(row => {
      if (!isClosed(row)) return false;
      const completedAt = new Date(row.updatedAt || row.createdAt || "").getTime();
      return Number.isFinite(completedAt) && completedAt >= now - 30 * DAY;
    });
    const items = openRows.map(row => itemFromRow(row, user, now, lang)).sort((a, b) => a.priority - b.priority || a.dueTime - b.dueTime || a.title.localeCompare(b.title, lang === "tr" ? "tr" : "en"));
    const completedItems = completedRows.map(row => itemFromRow(row, user, now, lang, true)).sort((a, b) => new Date(b.row.updatedAt || b.row.createdAt || 0).getTime() - new Date(a.row.updatedAt || a.row.createdAt || 0).getTime());
    const overdue = items.filter(item => Number.isFinite(item.dueTime) && item.dueTime < now).length;
    const soon = items.filter(item => Number.isFinite(item.dueTime) && item.dueTime >= now && item.dueTime <= now + 14 * DAY).length;
    const undated = items.filter(item => !Number.isFinite(item.dueTime)).length;
    const priority = items.filter(item => item.priority <= 1).length;
    const waiting = items.filter(item => item.waiting).length;
    const modules = [...new Set(items.map(item => item.row.module))].length;
    return { items, completedItems, overdue, soon, undated, priority, waiting, modules, now };
  }, [rows, user, scope, lang]);

  const visible = useMemo(() => {
    const needle = normalized(query);
    const source = filter === "completed" ? data.completedItems : data.items;
    return source.filter(item => {
      if (filter === "priority" && item.priority > 1) return false;
      if (filter === "overdue" && !(Number.isFinite(item.dueTime) && item.dueTime < data.now)) return false;
      if (filter === "soon" && !(Number.isFinite(item.dueTime) && item.dueTime >= data.now && item.dueTime <= data.now + 14 * DAY)) return false;
      if (filter === "waiting" && !item.waiting) return false;
      if (filter === "undated" && Number.isFinite(item.dueTime)) return false;
      if (!needle) return true;
      return normalized(`${item.title} ${item.owner} ${item.status} ${item.row.module} ${recordCode(item.row)}`).includes(needle);
    });
  }, [data, filter, query]);

  if (!mount) return null;
  const tr = lang === "tr";
  const filters: Array<[QueueFilter, string, number]> = [
    ["priority", tr ? "Öncelik" : "Priority", data.priority],
    ["overdue", tr ? "Geciken" : "Overdue", data.overdue],
    ["soon", tr ? "14 gün" : "14 days", data.soon],
    ["waiting", tr ? "Başkalarında bekleyen" : "Waiting for others", data.waiting],
    ["undated", tr ? "Tarihsiz" : "Undated", data.undated],
    ["completed", tr ? "Tamamlanan" : "Completed", data.completedItems.length],
    ["all", tr ? "Tümü" : "All", data.items.length],
  ];

  return createPortal(
    <section className="my-work-v2" aria-label={tr ? "Benim işlerim" : "My Work"}>
      <header className="mw2-hero">
        <div>
          <small>{tr ? "AKSİYON INBOX" : "ACTION INBOX"}</small>
          <h2>{tr ? "Bugün neye müdahale etmeliyim?" : "What needs my attention today?"}</h2>
          <p>{tr ? "Risk, kontrol, kanıt, denetim ve iyileştirme sorumluluklarını termin ve önem derecesine göre tek kuyrukta gör." : "See risk, control, evidence, audit and remediation responsibilities in one queue, ordered by due date and materiality."}</p>
        </div>
        <div className="mw2-hero-actions">
          {user.role === "Admin" && <div className="mw2-scope" aria-label={tr ? "İş kapsamı" : "Work scope"}>
            <button type="button" className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}>{tr ? "Benim" : "Mine"}</button>
            <button type="button" className={scope === "organization" ? "active" : ""} onClick={() => setScope("organization")}>{tr ? "Organizasyon" : "Organization"}</button>
          </div>}
          <button type="button" className="mw2-refresh" disabled={loading} onClick={() => void load()}>{loading ? (tr ? "Yenileniyor…" : "Refreshing…") : (tr ? "Yenile" : "Refresh")}</button>
        </div>
      </header>

      <div className="mw2-metrics">
        <button type="button" className={data.overdue ? "critical" : ""} onClick={() => setFilter("overdue")}><small>{tr ? "Geciken" : "Overdue"}</small><strong>{data.overdue}</strong><span>{tr ? "Termin geçmiş işler" : "Past-due work"}</span></button>
        <button type="button" className={data.priority ? "warning" : ""} onClick={() => setFilter("priority")}><small>{tr ? "Dikkat gerekiyor" : "Needs attention"}</small><strong>{data.priority}</strong><span>{tr ? "Kritik, 7 gün içinde veya değerlendirme bekliyor" : "Critical, due within 7 days or awaiting assessment"}</span></button>
        <button type="button" className={data.waiting ? "muted" : ""} onClick={() => setFilter("waiting")}><small>{tr ? "Başkalarında bekleyen" : "Waiting for others"}</small><strong>{data.waiting}</strong><span>{tr ? "Reviewer / onay bekleyen" : "Reviewer / approval pending"}</span></button>
        <button type="button" onClick={() => setFilter("completed")}><small>{tr ? "30 günde tamamlanan" : "Completed in 30 days"}</small><strong>{data.completedItems.length}</strong><span>{tr ? "Yakın zamanda kapanan işler" : "Recently closed work"}</span></button>
      </div>

      <section className="mw2-queue">
        <header>
          <div><small>{tr ? "KİŞİSEL İŞ KUYRUĞU" : "PERSONAL WORK QUEUE"}</small><h3>{scope === "organization" ? (tr ? "Organizasyon aksiyonları" : "Organization actions") : (tr ? "Bana atanmış işler" : "Work assigned to me")}</h3></div>
          <div className="mw2-meta"><b>{data.items.length}</b><span>{tr ? "açık iş" : "open items"}</span><i>·</i><b>{data.modules}</b><span>{tr ? "modül" : "modules"}</span></div>
        </header>
        <div className="mw2-toolbar">
          <div className="mw2-filters">{filters.map(([value, label, count]) => <button type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{label}<b>{count}</b></button>)}</div>
          <label className="mw2-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tr ? "İşlerde ara…" : "Search work…"} /></label>
        </div>

        {visible.length ? <div className="mw2-list">{visible.slice(0, 80).map(item => <button type="button" key={item.row.id} className={`mw2-item ${item.tone}`} onClick={() => navigateToRecord(item.row)}>
          <span className="mw2-priority-dot" />
          <span className="mw2-title"><b>{item.title}</b><small>{MODULE_LABELS[item.row.module]?.[lang] || item.row.module} · {recordCode(item.row)}</small></span>
          <span className="mw2-owner"><small>{tr ? "Sahip" : "Owner"}</small><b>{item.owner}</b></span>
          <span className="mw2-state"><em>{item.status}</em><small>{item.waiting ? (tr ? "Başkalarında bekliyor" : "Waiting for others") : item.reason}</small></span>
          <time className={!Number.isFinite(item.dueTime) ? "undated" : item.dueTime < data.now ? "overdue" : ""}>{filter === "completed" ? formatDate(item.row.updatedAt || item.row.createdAt || "", lang) : formatDate(item.due, lang)}</time>
          <strong className="mw2-arrow">→</strong>
        </button>)}</div> : <div className="mw2-empty"><span>✓</span><div><b>{tr ? "Bu görünümde aksiyon yok." : "No actions in this view."}</b><p>{tr ? "Filtreyi değiştirin veya kapsamı kontrol edin." : "Change the filter or review the selected scope."}</p></div></div>}
        {visible.length > 80 && <footer className="mw2-limit">{tr ? `İlk 80 iş gösteriliyor · toplam ${visible.length}` : `Showing first 80 items · ${visible.length} total`}</footer>}
      </section>
      <footer className="mw2-footnote">{lastUpdated ? (tr ? `Son güncelleme ${lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : `Last updated ${lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`) : ""}</footer>
    </section>,
    mount,
  );
}
