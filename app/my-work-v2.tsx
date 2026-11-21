"use client";
import {vendorWorkLabels} from './third-party-risk/work';

import {milestoneLabels} from './audit-milestones';
import {incidentLabel} from './incidents/labels';
import { enterpriseWorkSources, enterpriseWorkKinds, continuityWorkLabels, projectEnterpriseWork, type EnterpriseWorkSource } from "./enterprise-work";
import MyWorkAssuranceSignals from "./my-work-assurance-signals";
import { dueTimestamp } from "./due-date";
import { workCompletionDate, isDueToday, paginateWork, findingWorkRows, findingWorkDisposition, workSourcesComplete } from "./work-queue";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { workCopy, workRoles } from "./work-roles";
import { dashboardCode } from "./dashboard-actions";
import { withBasePath } from "./base-path";
import { assessedRiskScore } from "./risk-methodology";
import { isAuditTaskKind, navigateToFornost } from "./navigation-focus";
import "./my-work-v2.css";
import { buildWorkQueueCsv } from "./work-queue-export";
import { SavedRegisterViewsPanel } from "./saved-register-views-panel";
import { WORK_MODULE_LABELS as MODULE_LABELS, workViewSchema, readWorkView, type QueueFilter } from "./work-queue-views";
import { downloadBlob } from "./report-export";
import { useRegisterView } from './use-register-view';
import { sortViewItems, sortValue, viewSortOptions } from './register-sort';
import { RegisterSortControls } from './register-sort-controls';

type Lang = "tr" | "en";
type Scope = "mine" | "organization";
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
  workSource?: EnterpriseWorkSource;
  workKind?: string;
  nativeRef?: string;
  id: string;
  code?: string;
  module: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
};
type User = { id?: string; name?: string; email?: string; role?: string };
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
  roles: ReturnType<typeof workRoles>;
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
  "risk-accepted",
  "archived",
  "arşivlendi",
]);
const clean = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => clean(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
function normalizeRows(body: unknown): Row[] {
  if (!body || typeof body !== "object") return [];
  const source = Array.isArray((body as { rows?: unknown }).rows) ? (body as { rows: RawRow[] }).rows : [];
  return source.filter(raw => raw && typeof raw === "object").map(raw => {
    let data: Record<string, unknown> = {};
    if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) data = raw.data as Record<string, unknown>;
    else if (typeof raw.data_json === "string") {
      try {
        const parsed = JSON.parse(raw.data_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
      } catch {}
    }
    return {
      id: clean(raw.id),
      code: clean(raw.record_code || raw.recordCode || raw.code) || undefined,
      module: clean(raw.module),
      data,
      createdAt: clean(raw.createdAt || raw.created_at) || undefined,
      updatedAt: clean(raw.updatedAt || raw.updated_at) || undefined,
    };
  }).filter(row => row.module && row.id);
}
function dueValue(row: Row) {
  const d = row.data;
  if (row.module === "Bulgular ve CAPA" && normalized(d.status) === "accepted") return clean(d.acceptUntil);
  return clean(
    d.dueDate || d.targetDate || d.nextReview || d.nextAssessment || d.nextTestDate ||
      d.reviewDate || d.expiresAt || d.contractEnd || d.endDate,
  );
}
function rowTitle(row: Row) {
  const d = row.data;
  return clean(
    d.title || d.process || d.controlTitle || d.requirementTitle || d.evidenceTitle ||
      d.service || d.vendorName || d.finding || recordCode(row),
  );
}
function rowStatus(row: Row) {
  const d = row.data;
  return clean(d.status || d.reviewStatus || d.implementation || d.evidenceStatus) || "—";
}
function recordCode(row: Row) {
  return dashboardCode({ ...row, id: row.nativeRef || row.id.replace(/^finding:/, "") });
}
function formatDate(value: string, lang: Lang) {
  if (!value) return lang === "tr" ? "Tarih yok" : "No due date";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", year: "numeric", ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: "UTC" } : {}) }).format(new Date(time));
}
function isClosed(row: Row) {
  if (row.workSource) return row.data.workClosed === true;
  if (row.module === "Bulgular ve CAPA") return ["closed","cancelled"].includes(normalized(row.data.status));
  return CLOSED.has(normalized(row.data.status || row.data.reviewStatus));
}
function priorityFor(row: Row, dueTime: number, now: number) {
  if (row.workKind === 'incident' && ['critical', 'high'].includes(clean(row.data.severity))) return 1;
  if (row.module === "Bulgular ve CAPA") {
    const disposition = findingWorkDisposition(row.data, now);
    if (disposition === "acceptance-expired") return 0;
    if (disposition === "acceptance-review") return 1;
  }
  if (Number.isFinite(dueTime) && dueTime < now) return 0;
  if (Number.isFinite(dueTime) && dueTime <= now + 7 * DAY) return 1;
  if (row.module === "Risk Assessment") {
    const riskScore = assessedRiskScore(row.data);
    if (riskScore === null || riskScore >= 17) return 1;
  }
  if (["kritik", "critical"].includes(normalized(row.data.criticality || row.data.riskLevel || row.data.severity))) return 1;
  if (Number.isFinite(dueTime) && dueTime <= now + 30 * DAY) return 2;
  if (!Number.isFinite(dueTime)) return 4;
  return 3;
}
function reasonFor(row: Row, dueTime: number, now: number, lang: Lang) {
  if(row.workKind === "audit-milestone" && Number(row.data.blockedCount)>0)return lang === "tr" ? `${row.data.blockedCount} ön koşul görevi bekleniyor` : `Waiting for ${row.data.blockedCount} prerequisite milestones`;
  const tr = lang === "tr";
  if (row.workKind === 'incident') {
    const reasons: Record<string, [string, string]> = {
      declared: ['Olay ön incelemesi bekleniyor', 'Incident triage needed'],
      triage: ['Olay kontrol altına alınmalı', 'Incident containment needed'],
      contained: ['Tehdit giderilmeli', 'Threat eradication needed'],
      eradicated: ['Hizmet kurtarma bekleniyor', 'Service recovery needed'],
      recovered: ['Kök neden ve dersler incelemeye sunulmalı', 'Submit root cause and lessons for review'],
      review: ['Bağımsız olay kapanışı bekleniyor', 'Awaiting independent incident closure'],
    };
    return reasons[rowStatus(row)]?.[tr ? 0 : 1] || incidentLabel(rowStatus(row), lang);
  }
  if (row.workKind === "continuity-plan" && row.data.status === "draft") return tr ? "Planı hazırlayıp incelemeye gönderin" : "Prepare and submit the plan for review";
  if (row.workKind === "continuity-plan" && row.data.status === "submitted") return tr ? "Bağımsız plan onayı bekleniyor" : "Awaiting independent plan approval";
  if (row.workKind === "continuity-plan" && row.data.status === "approved") return tr ? "Plan etkinleştirilmeli" : "Plan needs activation";
  if(row.workKind === "audit-milestone" && row.data.status === "submitted")return tr ? "Bağımsız görev incelemesi bekleniyor" : "Awaiting independent milestone review";
  if(row.workKind === "audit-milestone" && row.data.status === "changes_requested")return tr ? "İncelemeci düzeltme istedi" : "Reviewer requested changes";
  if (row.workKind === 'vendor-assessment') return rowStatus(row) === 'submitted' ? (tr ? 'Bağımsız tedarikçi kararı bekleniyor' : 'Awaiting independent vendor decision') : (tr ? 'Tedarikçi değerlendirmesini hazırlayın' : 'Prepare vendor assessment');
  if (row.workKind === 'vendor-finding') return rowStatus(row) === 'verification' ? (tr ? 'Bağımsız bulgu doğrulaması bekleniyor' : 'Awaiting independent finding verification') : (tr ? 'Tedarikçi bulgusunu giderin' : 'Remediate vendor finding');
  if (row.module === "Bulgular ve CAPA") {
    const disposition = findingWorkDisposition(row.data, now);
    if (disposition === "acceptance-expired") return tr ? "Risk kabul süresi dolmuş" : "Risk acceptance expired";
    if (disposition === "acceptance-review") return tr ? "Risk kabul süresi doğrulanmalı" : "Risk acceptance expiry needs review";
  }
  if (Number.isFinite(dueTime) && dueTime < now) return tr ? "Termin geçti" : "Overdue";
  if (Number.isFinite(dueTime) && dueTime <= now + 7 * DAY) return tr ? "7 gün içinde" : "Due within 7 days";
  if (row.module === "Risk Assessment") {
    const riskScore = assessedRiskScore(row.data);
    if (riskScore === null) return tr ? "Risk değerlendirmesi bekliyor" : "Risk assessment pending";
    if (riskScore >= 17) return tr ? "Kritik risk" : "Critical risk";
  }
  if (["kritik", "critical"].includes(normalized(row.data.criticality || row.data.riskLevel || row.data.severity))) return tr ? "Kritik kapsam" : "Critical scope";
  if (Number.isFinite(dueTime) && dueTime <= now + 30 * DAY) return tr ? "30 gün içinde" : "Due within 30 days";
  if (!Number.isFinite(dueTime)) return tr ? "Termin tanımsız" : "No due date";
  return tr ? "Açık sorumluluk" : "Open responsibility";
}
function toneFor(priority: number): QueueItem["tone"] {
  return priority === 0 ? "critical" : priority === 1 ? "warning" : priority === 4 ? "muted" : "normal";
}
function itemFromRow(row: Row, user: User, now: number, lang: Lang, completed = false): QueueItem {
  const due = dueValue(row);
  const dueTime = dueTimestamp(due);
  const roles = workRoles(row, user);
  const priority = completed ? 4 : priorityFor(row, dueTime, now);
  return {
    row,
    title: row.workKind ? `${enterpriseWorkKinds[row.workKind]?.[lang] || row.workKind} · ${rowTitle(row)}` : rowTitle(row),
    owner: roles.ownerName,
    roles,
    status: row.workSource === 'vendor' ? vendorWorkLabels[rowStatus(row)]?.[lang] || rowStatus(row) : row.workKind === 'incident' ? incidentLabel(rowStatus(row), lang) : row.workSource === "continuity" ? continuityWorkLabels[rowStatus(row)]?.[lang] || rowStatus(row) : row.workKind === "audit-milestone" ? milestoneLabels[rowStatus(row) as keyof typeof milestoneLabels]?.[lang === "tr" ? 0 : 1] || rowStatus(row) : rowStatus(row),
    due,
    dueTime,
    priority,
    reason: completed ? (row.workSource === "vendor" ? vendorWorkLabels[rowStatus(row)]?.[lang] || rowStatus(row) : row.workSource === "continuity" ? continuityWorkLabels[rowStatus(row)]?.[lang] || rowStatus(row) : (lang === "tr" ? "Tamamlandı" : "Completed")) : reasonFor(row, dueTime, now, lang),
    tone: completed ? "muted" : toneFor(priority),
    waiting: !completed && roles.waiting,
  };
}
function openWorkSource(row: Row) {
  if (row.workSource && row.workKind && row.nativeRef) {
    navigateToFornost({ module: row.module, ref: row.nativeRef, kind: row.workKind, source: "my-work-enterprise", ...(isAuditTaskKind(row.workKind) ? { filter: { auditId: clean(row.data.auditId) } } : {}) });
    return;
  }
  const ref = row.id.replace(/^finding:/, "");
  navigateToFornost({
    module: row.module,
    ref,
    kind: "record",
    source: "my-work",
    filter: { recordRef: ref },
  });
}

export default function MyWorkV2({ active, lang, actor }: { active: boolean; lang: Lang; actor: User }) {
  const root = useRef<HTMLElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [user, setUser] = useState<User>({});
  const { sort, setSort } = useRegisterView(user.id || '', 'My Work');
  const [scope, setScope] = useState<Scope>("mine");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const returnRow = useRef<{ id: string; userId: string; leftQueue: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null), request = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setVerifiedRead] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    const id = ++request.current;
    const timeout = window.setTimeout(() => pending.abort(), 20000);
    setLoading(true); setLoadError(false); setVerifiedRead(null); setRefreshKey(value => value + 1);
    try {
      const [grcResult, authResult, findingsResult, ...enterpriseResults] = await Promise.allSettled([
        fetch(withBasePath("/api/grc"), { cache: "no-store", signal: pending.signal }).then(async response => response.ok ? response.json() : Promise.reject(new Error("grc"))),
        fetch(withBasePath("/api/auth"), { cache: "no-store", signal: pending.signal }).then(async response => response.ok ? response.json() : Promise.reject(new Error("auth"))),
        fetch(withBasePath("/api/findings"), { cache: "no-store", signal: pending.signal }).then(async response => response.ok ? response.json() : Promise.reject(new Error("findings"))),
        ...enterpriseWorkSources.map(source => fetch(withBasePath(source.path), { headers:{"x-fornost-work-queue":"1"}, cache: "no-store", signal: pending.signal }).then(async response => response.ok ? response.json() : Promise.reject(new Error(source.key)))),
      ]);
      if (request.current !== id) return;
      if (authResult.status === "rejected" || !authResult.value?.user?.email || authResult.value.user.id !== actor.id || authResult.value.user.role !== actor.role || normalized(authResult.value.user.email) !== normalized(actor.email)) {
        setUser({}); setRows([]); setLoadError(true); return;
      }
      const enterprise = enterpriseResults.map((result, index) => ({
        source: enterpriseWorkSources[index].key,
        projection: result.status === "fulfilled" ? projectEnterpriseWork(enterpriseWorkSources[index].key, result.value) : null,
      }));
      {
        const tasks = enterprise.flatMap(({ projection }) => projection?.rows || []);
        const managedVendors = new Set(tasks.filter(row => row.workKind === 'vendor-review').map(row => row.nativeRef));
        const core = grcResult.status === "fulfilled" ? normalizeRows(grcResult.value) : [];
        setRows([
          ...core.filter(row => row.module !== 'Tedarikçiler' || !managedVendors.has(row.id)),
          ...(findingsResult.status === "fulfilled" ? findingWorkRows(findingsResult.value) : []),
          ...tasks,
        ]);
      }
      setUser((authResult.value as { user?: User }).user || {});
      const failed = grcResult.status === "rejected" || findingsResult.status === "rejected" || !workSourcesComplete(grcResult.value, findingsResult.value) || enterprise.some(item => !item.projection?.complete);
      setLoadError(failed);
      if (!failed) setVerifiedRead(new Date());
    } catch {
      if (request.current === id) { setRows([]); setLoadError(true); }
    } finally {
      window.clearTimeout(timeout);
      if (request.current === id) setLoading(false);
    }
  }, [active, actor.id, actor.email, actor.role]);

  const cancelLoad = useCallback(() => { request.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!active) {
      if (returnRow.current) returnRow.current.leftQueue = true;
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => { window.clearInterval(timer); cancelLoad(); setVerifiedRead(null); };
  }, [active, load, cancelLoad]);

  const organization = scope === "organization" && user.role === "Admin";
  function selectFilter(next: QueueFilter) {
    if (next === "unassigned" && user.role === "Admin") setScope("organization");
    setFilter(next === "unassigned" && user.role !== "Admin" ? "all" : next);
  }
  const scopedRows = useMemo(() => rows.filter(row => {
    if (row.data.assignmentOnly && !organization) return false;
    const role = workRoles(row, user);
    return organization || role.owner || role.reviewer;
  }), [rows, organization, user]);
  const moduleOptions = useMemo(() => [...new Set(scopedRows.map(row => row.module))].sort((a, b) => (MODULE_LABELS[a]?.[lang] || a).localeCompare(MODULE_LABELS[b]?.[lang] || b, lang)), [scopedRows, lang]);

  const data = useMemo(() => {
    const now = Date.now();
    const scoped = scopedRows.filter(row => !moduleFilter || row.module === moduleFilter);
    const allOpenRows = scopedRows.filter(row => !isClosed(row) && !(row.module === "Bulgular ve CAPA" && findingWorkDisposition(row.data, now) === "accepted"));
    const openRows = moduleFilter ? allOpenRows.filter(row => row.module === moduleFilter) : allOpenRows;
    const completedRows = scoped.filter(row => {
      if (!isClosed(row)) return false;
      const completedAt = new Date(workCompletionDate(row)).getTime();
      return Number.isFinite(completedAt) && completedAt >= now - 30 * DAY && completedAt <= now;
    });
    const assignmentItems = openRows.filter(row => row.data.assignmentOnly).map(row => itemFromRow(row,user,now,lang));
    const items = openRows.filter(row => !row.data.assignmentOnly).map(row => itemFromRow(row, user, now, lang)).sort((a, b) => a.priority - b.priority || a.dueTime - b.dueTime || a.title.localeCompare(b.title, lang === "tr" ? "tr" : "en"));
    const completedItems = completedRows.map(row => itemFromRow(row, user, now, lang, true)).sort((a, b) => new Date(workCompletionDate(b.row)).getTime() - new Date(workCompletionDate(a.row)).getTime());
    const overdue = items.filter(item => Number.isFinite(item.dueTime) && item.dueTime < now).length;
    const priority = items.filter(item => item.priority <= 1).length;
    const waiting = items.filter(item => item.waiting).length;
    const modules = [...new Set(items.map(item => item.row.module))].length;
    return { assignmentItems, hasOpenWork: allOpenRows.length > 0, items, completedItems, overdue, priority, waiting, modules, now };
  }, [scopedRows, user, moduleFilter, lang]);

  const visible = useMemo(() => {
    const needle = normalized(query);
    const source = filter === "completed" ? data.completedItems : filter === "unassigned" ? [...data.items, ...data.assignmentItems] : data.items;
    const filtered = source.filter(item => {
      if (filter === "owner" && !item.roles.owner) return false;
      if (filter === "reviewer" && !item.roles.awaitingReview) return false;
      if (filter === "unassigned" && (!organization || !item.roles.unassigned)) return false;
      if (filter === "today" && !isDueToday(item.due, data.now)) return false;
      if (filter === "priority" && item.priority > 1) return false;
      if (filter === "overdue" && !(Number.isFinite(item.dueTime) && item.dueTime < data.now)) return false;
      if (filter === "soon" && !(Number.isFinite(item.dueTime) && item.dueTime >= data.now && item.dueTime <= data.now + 14 * DAY)) return false;
      if (filter === "waiting" && !item.waiting) return false;
      if (filter === "undated" && Number.isFinite(item.dueTime)) return false;
      if (!needle) return true;
      return normalized(`${item.title} ${item.owner} ${item.status} ${item.row.module} ${MODULE_LABELS[item.row.module]?.[lang] || ""} ${recordCode(item.row)}`).includes(needle);
    });
    if (!sort || !viewSortOptions('My Work').some(option => option.key === sort.key)) return filtered;
    return sortViewItems(filtered, sort, lang, item => {
      if (sort.key === 'due') return Number.isFinite(item.dueTime) ? item.dueTime : null;
      if (sort.key === 'priority') return item.priority;
      if (sort.key === 'updatedAt') return sortValue(item.row.updatedAt, 'date');
      return sortValue(sort.key === 'owner' ? item.owner : item.title, 'text');
    }, item => item.row.id);
  }, [data, filter, query, lang, sort, organization]);

  useEffect(() => { setPageIndex(0); }, [filter, query, scope, moduleFilter, sort]);
  const pageSize = 20;
  const page = paginateWork(visible, pageIndex, pageSize);

  function navigateToRecord(row: Row) {
    returnRow.current = user.id ? { id: row.id, userId: user.id, leftQueue: false } : null;
    openWorkSource(row);
  }

  useEffect(() => {
    const origin = returnRow.current;
    const mount = root.current;
    if (!origin?.leftQueue || !active || !mount || !lastUpdated || loading || loadError) return;
    if (origin.userId !== user.id || mount.contains(document.activeElement)) {
      returnRow.current = null;
      return;
    }
    const index = visible.findIndex(item => item.row.id === origin.id);
    const targetPage = index >= 0 ? Math.floor(index / pageSize) : page.page;
    if (targetPage !== pageIndex) {
      setPageIndex(targetPage);
      return;
    }
    const target = index >= 0
      ? mount.querySelector<HTMLButtonElement>(`[data-work-id="${CSS.escape(origin.id)}"]`)
      : mount.querySelector<HTMLInputElement>(".mw2-search input");
    returnRow.current = null;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [active, lastUpdated, loading, loadError, user.id, visible, page.page, pageIndex]);

  const exportView = () => {
    if (loading || loadError || !lastUpdated || !visible.length) return;
    const csv = buildWorkQueueCsv(visible.map(item => ({ reference: recordCode(item.row), module: MODULE_LABELS[item.row.module]?.[lang] || item.row.module,
      title: item.title, owner: item.owner, status: item.status, due: item.due, reason: item.reason, updatedAt: item.row.updatedAt || "" })),
      { scope: scope === "organization" && user.role === "Admin" ? "organization" : "mine", filter, query, moduleFilter, sort, evaluatedAt: new Date(data.now).toISOString(), refreshedAt: lastUpdated.toISOString() });
    downloadBlob(`fornost-work-${filter}-${lastUpdated.toISOString().slice(0, 10)}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  };

  if (!active) return null;
  const tr = lang === "tr", locale = tr ? 0 : 1;
  const ready = !!lastUpdated && !loading && !loadError;
  const refreshing = loading || (!lastUpdated && !loadError);
  const personalQueueEmpty = ready && scope === "mine" && !data.hasOpenWork && filter === "all" && !query && !moduleFilter;
  const filters = ["all", "owner", "reviewer", "waiting", ...(user.role === "Admin" ? ["unassigned" as const] : [])] as const;
  const links = [["Risk Assessment", workCopy.risk], ["Kanıtlar", workCopy.evidence], ["Denetim Yönetimi", workCopy.audit]] as const;
  const urgencies = ready ? data.items.flatMap(item => {
    const expired = item.row.workKind === "policy-exception" && ["expired","approved"].includes(clean(item.row.data.status)) && item.dueTime < data.now;
    return expired ? [{id:item.row.id, code:recordCode(item.row), title:item.title, reason:workCopy.expiredPolicy[locale], open:() => navigateToRecord(item.row)}] : [];
  }) : [];
  return (
    <section ref={root} className="my-work-v2" aria-label={tr ? "Benim İşlerim" : "My Work"}>
      {loadError && <p className="mw2-load-error" role="alert">{tr ? "İş listesi tamamen doğrulanamadı. Kaynak hatası, eksik veri veya okuma sınırı olabilir. Yenile ile tekrar deneyin." : "The complete work list could not be verified. A source failed, data is malformed or a read limit was reached. Use Refresh to retry."}</p>}
      <header className="mw2-hero">
        <div>
          <small>{tr ? "AKSİYON MERKEZİ" : "ACTION INBOX"}</small>
          <h2>{tr ? "Benim İşlerim" : "My Work"}</h2>
        </div>
        <div className="mw2-hero-actions">
          {user.role === "Admin" && <div className="mw2-scope" role="group" aria-label={tr ? "İş kapsamı" : "Work scope"}>
            <button type="button" aria-pressed={scope === "mine"} className={scope === "mine" ? "active" : ""} onClick={() => { setScope("mine"); if (filter === "unassigned") setFilter("all"); }}>{tr ? "Benim" : "Mine"}</button>
            <button type="button" aria-pressed={scope === "organization"} className={scope === "organization" ? "active" : ""} onClick={() => setScope("organization")}>{tr ? "Organizasyon" : "Organization"}</button>
          </div>}
          <button type="button" className="mw2-refresh" disabled={loading || loadError || !lastUpdated || !visible.length} onClick={exportView} title={tr ? "Seçili kapsam ve filtredeki tüm yüklenen işleri indir" : "Download all loaded work matching the selected scope and filter"}>{tr ? "Listeyi indir (CSV)" : "Download list (CSV)"}</button>
          <button type="button" className="mw2-refresh" disabled={refreshing} onClick={() => void load()}>{refreshing ? (tr ? "Yenileniyor…" : "Refreshing…") : (tr ? "Yenile" : "Refresh")}</button>
        </div>
      </header>

      <div className="mw2-metrics">
        <button type="button" className={data.overdue ? "critical" : ""} aria-pressed={filter === "overdue"} onClick={() => selectFilter("overdue")}><small>{tr ? "Geciken" : "Overdue"}</small><strong>{ready ? data.overdue : "—"}</strong><span>{tr ? "Termin geçmiş işler" : "Past-due work"}</span></button>
        <button type="button" className={data.priority ? "warning" : ""} aria-pressed={filter === "priority"} onClick={() => selectFilter("priority")}><small>{tr ? "Dikkat gerekiyor" : "Needs attention"}</small><strong>{ready ? data.priority : "—"}</strong><span>{workCopy.attentionHint[locale]}</span></button>
        <button type="button" className={data.waiting ? "muted" : ""} aria-pressed={filter === "waiting"} onClick={() => selectFilter("waiting")}><small>{tr ? "Başkalarında bekleyen" : "Waiting for others"}</small><strong>{ready ? data.waiting : "—"}</strong><span>{tr ? "İnceleme / onay bekleyen" : "Reviewer / approval pending"}</span></button>
        <button type="button" aria-pressed={filter === "completed"} onClick={() => selectFilter("completed")}><small>{tr ? "30 günde tamamlanan" : "Completed in 30 days"}</small><strong>{ready ? data.completedItems.length : "—"}</strong><span>{tr ? "Yakın zamanda kapanan işler" : "Recently closed work"}</span></button>
      </div>

      <div className="mw2-module-filter">
        <label>{tr ? "İş kuyruğu modülü" : "Work queue module"}<select aria-label={tr ? "İş kuyruğu modülü" : "Work queue module"} value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}>
          <option value="">{tr ? "Tüm modüller" : "All modules"}</option>
          {moduleFilter && !moduleOptions.includes(moduleFilter) && <option value={moduleFilter}>{MODULE_LABELS[moduleFilter]?.[lang] || moduleFilter} · {tr ? "bu kapsamda iş yok" : "no work in this scope"}</option>}
          {moduleOptions.map(module => <option key={module} value={module}>{MODULE_LABELS[module]?.[lang] || module}</option>)}
        </select></label>
        {moduleFilter && <button type="button" className="mw2-refresh" onClick={() => setModuleFilter("")}>{tr ? "Modül filtresini temizle" : "Clear module filter"}</button>}
        <RegisterSortControls module="My Work" lang={lang} sort={sort} onChange={setSort} disabled={loading || loadError} />
        <p>{workCopy.exportHint[locale]}</p>
      </div>
      <section className="mw2-queue">
        <header>
          <div><small>{scope === "organization" ? (tr ? "KURUMSAL İŞ KUYRUĞU" : "ORGANIZATION WORK QUEUE") : (tr ? "KİŞİSEL İŞ KUYRUĞU" : "PERSONAL WORK QUEUE")}</small><h3>{scope === "organization" ? (tr ? "Organizasyon aksiyonları" : "Organization actions") : (tr ? "Bana atanmış işler" : "Work assigned to me")}</h3></div>
          <div className="mw2-meta"><b>{ready ? data.items.length : "—"}</b><span>{tr ? "açık iş" : "open items"}</span><i>·</i><b>{ready ? data.modules : "—"}</b><span>{tr ? "modül" : "modules"}</span></div>
        </header>
        <div className="mw2-toolbar">
          <div className="mw2-filters">{filters.map(value => <button type="button" aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => selectFilter(value)} key={value}>{workCopy[value][locale]}</button>)}</div>
          <label className="mw2-search"><span aria-hidden="true">⌕</span><input aria-label={tr ? "İşlerde ara" : "Search work"} value={query} onChange={event => setQuery(event.target.value)} placeholder={tr ? "İşlerde ara…" : "Search work…"} /></label>
        </div>

        {visible.length ? <div className="mw2-list">{page.items.map(item => <button type="button" key={item.row.id} data-work-id={item.row.id} className={`mw2-item ${item.tone}`} onClick={() => navigateToRecord(item.row)}>
          <span className="mw2-priority-dot" />
          <span className="mw2-title"><b>{item.title}</b><small>{MODULE_LABELS[item.row.module]?.[lang] || item.row.module} · {recordCode(item.row)}</small><span className="mw2-role">{item.roles.owner ? workCopy.ownerRole[locale] : item.roles.reviewer ? workCopy.reviewerRole[locale] : workCopy.otherRole[locale]}</span>{filter === "unassigned" && <small>{[item.roles.missingOwner && workCopy.noOwner[locale], item.roles.missingReviewer && workCopy.noReviewer[locale]].filter(Boolean).join(" · ")}</small>}</span>
          <span className="mw2-owner"><small>{tr ? "Sahip" : "Owner"}</small><b>{item.owner}</b></span>
          <span className="mw2-state"><em>{item.status}</em><small>{item.waiting && item.row.workKind !== "audit-milestone" ? (tr ? "Başkalarında bekliyor" : "Waiting for others") : item.reason}</small></span>
          <time className={filter === "completed" ? "" : !Number.isFinite(item.dueTime) ? "undated" : item.dueTime < data.now ? "overdue" : ""}>{filter === "completed" ? formatDate(workCompletionDate(item.row), lang) : <>{formatDate(item.due, lang)}{item.dueTime < data.now && <small>{tr ? "Gecikti" : "Overdue"}</small>}</>}</time>
          <strong className="mw2-arrow">{workCopy.review[locale]}</strong>
        </button>)}</div> : personalQueueEmpty ? <div className="mw2-empty"><div><h4>{workCopy.empty[locale]}</h4><nav>{links.map(([module, label]) => <button type="button" key={module} onClick={() => navigateToFornost(module)}>{label[locale]} →</button>)}</nav></div></div> :
          <div className="mw2-empty" role="status">{loadError ? (tr ? "İş listesi doğrulanamadı." : "Work list could not be verified.") : !ready ? (tr ? "İşler yükleniyor…" : "Loading work…") : (tr ? "Bu görünümde aksiyon yok." : "No actions in this view.")}</div>}
        {visible.length > 0 && <footer className="mw2-pagination" aria-label={tr ? "İş listesi sayfaları" : "Work list pages"}>
          <span aria-live="polite">{page.start}–{page.end} / {page.total}</span>
          <div><button type="button" disabled={page.page === 0} onClick={() => setPageIndex(page.page - 1)}>{tr ? "Önceki" : "Previous"}</button><span>{page.page + 1} / {page.pages}</span><button type="button" disabled={page.page + 1 >= page.pages} onClick={() => setPageIndex(page.page + 1)}>{tr ? "Sonraki" : "Next"}</button></div>
        </footer>}
      </section>
      {user.id && !loadError && <SavedRegisterViewsPanel userId={user.id} module="My Work" lang={lang} variant="work"
        current={{query, filters:{module:moduleFilter, status:filter}, columns:workViewSchema.columns, ...(sort ? {sort} : {})}} schema={workViewSchema} labels={{module:tr?"Modül":"Module",status:tr?"İş durumu":"Work status",title:tr?"Başlık":"Title",owner:tr?"Sahip":"Owner",due:tr?"Termin":"Due date"}}
        apply={view => { const next = readWorkView(view, Object.keys(MODULE_LABELS)); setQuery(next.query); setModuleFilter(next.module); selectFilter(next.status); setSort(next.sort); setPageIndex(0); }} />}
      {ready && user.email && <MyWorkAssuranceSignals key={`${scope}:${refreshKey}`} urgencies={urgencies} lang={lang} scope={scope} user={user} />}

      <footer className="mw2-footnote">{lastUpdated ? (tr ? `Son güncelleme ${lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : `Last updated ${lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`) : ""}</footer>
    </section>
  );
}
