"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import {
  buildControlAssurance,
  buildControlAssuranceDetail,
  type AssuranceRow,
} from "./control-assurance";
import {
  buildConnectedGrcEnterpriseRows,
  connectedGrcEnterpriseEndpoints,
  type ConnectedGrcEnterprisePayloads,
} from "./connected-grc-sources";
import { navigateToFornost } from "./navigation-focus";
import "./control-impact-lens.css";

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
type EvidenceIntegritySnapshot = {
  integrity: string;
  checkedVersions: number;
  failedVersion: number;
};

type ImpactStage = {
  key: string;
  module: string;
  labelTr: string;
  labelEn: string;
  count: number;
  expected: boolean;
};

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

const REASON_LABELS: Record<string, { tr: string; en: string }> = {
  "owner-missing": { tr: "Kontrol sahibi eksik", en: "Control owner missing" },
  "test-owner-missing": { tr: "Test sahibi eksik", en: "Test owner missing" },
  "test-date-missing": { tr: "Test tarihi planlanmamış", en: "Test date not planned" },
  "test-overdue": { tr: "Kontrol testi gecikmiş", en: "Control test overdue" },
  "test-failed": { tr: "Son kontrol testi başarısız", en: "Latest control test failed" },
  "evidence-missing": { tr: "Bağlı kanıt yok", en: "No linked evidence" },
  "evidence-stale": { tr: "Kanıt güncel değil", en: "Evidence is not current" },
  "evidence-integrity-broken": { tr: "Kanıt bütünlük zinciri bozuk", en: "Evidence integrity chain broken" },
  "evidence-integrity-legacy": { tr: "Kanıt bütünlüğü eski formatta doğrulanamıyor", en: "Legacy evidence integrity is unverified" },
  "evidence-integrity-unavailable": { tr: "Kanıt bütünlük doğrulaması kullanılamıyor", en: "Evidence integrity verification unavailable" },
  "audit-missing": { tr: "Denetim izi yok", en: "No audit trace" },
  "open-findings": { tr: "Açık bulgu var", en: "Open finding exists" },
  "automation-failing": { tr: "Otomatik kontrol başarısız", en: "Automated control failing" },
  "automation-stale": { tr: "Otomatik kanıt bayat/eksik", en: "Automated evidence stale/missing" },
  "automation-attention": { tr: "Otomasyon sinyali dikkat istiyor", en: "Automation signal needs attention" },
  "automation-finding-open": { tr: "Açık otomasyon bulgusu", en: "Open automation finding" },
  "remediation-open": { tr: "Açık CAPA / remediation", en: "Open CAPA / remediation" },
  "risk-link-missing": { tr: "Bulgu risk bağlantısı eksik", en: "Finding risk link missing" },
  "control-needs-improvement": { tr: "Kontrol iyileştirme bekliyor", en: "Control needs improvement" },
};

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
    return {
      id: clean(raw.id) || `impact-${index}`,
      code: clean(raw.code || raw.recordCode || raw.record_code) || undefined,
      module: clean(raw.module),
      data,
    };
  }).filter((row) => row.module);
}

function evidenceIntegritySnapshots(history: Record<string, unknown>) {
  const snapshots: Record<string, EvidenceIntegritySnapshot> = {};
  const items = Array.isArray(history.evidenceItems) ? history.evidenceItems as Record<string, unknown>[] : [];
  for (const item of items) {
    const id = clean(item.id);
    const integrity = clean(item.integrity);
    if (!id || !integrity) continue;
    snapshots[id] = {
      integrity,
      checkedVersions: Number(item.checkedVersions || 0),
      failedVersion: Number(item.failedVersion || 0),
    };
  }
  return snapshots;
}

function applyEvidenceIntegrity(rows: AssuranceRow[], history: Record<string, unknown>) {
  const snapshots = evidenceIntegritySnapshots(history);
  return rows.map((row) => {
    if (row.module !== "Kanıtlar") return row;
    const snapshot = snapshots[row.id];
    if (!snapshot) return row;
    return {
      ...row,
      data: {
        ...row.data,
        evidenceIntegrity: snapshot.integrity,
        evidenceIntegrityCheckedVersions: snapshot.checkedVersions,
        evidenceIntegrityFailedVersion: snapshot.failedVersion,
      },
    };
  });
}

async function fetchJson(path: string) {
  const response = await fetch(withBasePath(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}:${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export default function ControlImpactLens() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [rows, setRows] = useState<AssuranceRow[]>([]);
  const [selectedControlId, setSelectedControlId] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let created: HTMLDivElement | null = null;
    const discover = () => {
      setLang(currentLanguage());
      const workspace = document.querySelector<HTMLElement>(".control-assurance-workspace");
      if (!workspace) {
        setMount(null);
        return;
      }
      created = workspace.querySelector<HTMLDivElement>(":scope > .control-impact-lens-mount");
      if (!created) {
        created = document.createElement("div");
        created.className = "control-impact-lens-mount";
        const header = workspace.querySelector(":scope > header");
        if (header) header.insertAdjacentElement("afterend", created);
        else workspace.prepend(created);
      }
      setMount((current) => current === created ? current : created);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    const onClick = () => setLang(currentLanguage());
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
      created?.remove();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const grcPromise = fetchJson("/api/grc");
      const historyPromise = fetchJson("/api/evidence/history").catch(() => ({}));
      const enterpriseResults = await Promise.allSettled(
        connectedGrcEnterpriseEndpoints.map(async ({ key, path }) => ({ key, body: await fetchJson(path) })),
      );
      const payloads: ConnectedGrcEnterprisePayloads = {};
      for (const result of enterpriseResults) {
        if (result.status === "fulfilled") payloads[result.value.key] = result.value.body;
      }
      const [grcBody, history] = await Promise.all([grcPromise, historyPromise]);
      const core = normalizeRows(grcBody);
      const projected = buildConnectedGrcEnterpriseRows(payloads) as AssuranceRow[];
      const merged = new Map<string, AssuranceRow>();
      for (const row of [...core, ...projected]) merged.set(row.id, row);
      setRows(applyEvidenceIntegrity(Array.from(merged.values()), history));
      setLastUpdated(new Date());
    } catch {
      setRows([]);
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

  const summary = useMemo(() => buildControlAssurance(rows), [rows]);

  useEffect(() => {
    if (!summary.items.length) {
      setSelectedControlId("");
      return;
    }
    if (!summary.items.some((item) => item.control.id === selectedControlId)) {
      setSelectedControlId(summary.items[0].control.id);
    }
  }, [summary.items, selectedControlId]);

  const detail = useMemo(
    () => selectedControlId ? buildControlAssuranceDetail(rows, selectedControlId) : null,
    [rows, selectedControlId],
  );

  if (!mount) return null;
  const tr = lang === "tr";

  const stages: ImpactStage[] = detail ? [
    { key: "framework", module: "Uyum", labelTr: "Framework", labelEn: "Framework", count: detail.frameworks.length, expected: true },
    { key: "evidence", module: "Kanıtlar", labelTr: "Kanıt", labelEn: "Evidence", count: detail.evidence.length, expected: true },
    { key: "automation", module: "Kanıt Otomasyonu", labelTr: "Otomasyon", labelEn: "Automation", count: detail.automations.length, expected: false },
    { key: "audit", module: "Denetim Yönetimi", labelTr: "Denetim izi", labelEn: "Audit trace", count: detail.audits.length, expected: true },
    { key: "finding", module: "Bulgular ve CAPA", labelTr: "Bulgu / CAPA", labelEn: "Finding / CAPA", count: detail.findings.length + detail.remediations.length, expected: false },
    { key: "risk", module: "Risk Assessment", labelTr: "Risk", labelEn: "Risk", count: detail.risks.length, expected: false },
  ] : [];

  const missingRequired = stages.filter((stage) => stage.expected && stage.count === 0);
  const control = detail?.item;
  const impactCount = stages.reduce((sum, stage) => sum + stage.count, 0);
  const healthLabel = control?.state === "healthy"
    ? (tr ? "Güçlü" : "Healthy")
    : control?.state === "critical"
      ? (tr ? "Kritik" : "Critical")
      : (tr ? "Aksiyon gerekli" : "Action required");
  const openStage = (stage: ImpactStage) => navigateToFornost({
    module: stage.module,
    ref: control?.reference,
    kind: stage.key,
    source: "control-impact",
    filter: control?.reference ? { controlRef: control.reference } : undefined,
  });

  const content = <section className="control-impact-lens" aria-label={tr ? "Kontrol etki görünümü" : "Control impact lens"}>
    <div className="cil-head">
      <div>
        <small>{tr ? "CONNECTED CONTROL IMPACT" : "CONNECTED CONTROL IMPACT"}</small>
        <h3>{tr ? "Bu kontrol bozulursa neresi etkilenir?" : "What is affected if this control fails?"}</h3>
        <p>{tr ? "Framework, kanıt, denetim, bulgu/CAPA ve risk ilişkilerini tek etki zincirinde gösterir." : "Shows framework, evidence, audit, finding/CAPA and risk relationships in one impact chain."}</p>
      </div>
      <div className="cil-actions">
        <button type="button" onClick={() => navigateToFornost({ module: "Bağlantılı GRC", ref: control?.reference, kind: "control", source: "control-impact" })}>{tr ? "GRC haritası" : "GRC map"}<span>→</span></button>
        <button type="button" className="cil-refresh" disabled={loading} onClick={() => void load()}>{loading ? "…" : "↻"}</button>
      </div>
    </div>

    {summary.items.length === 0 ? <div className="cil-empty">{tr ? "Etki analizi için kontrol kaydı bulunamadı." : "No controls available for impact analysis."}</div> : <>
      <div className="cil-selector-row">
        <label>
          <span>{tr ? "Kontrol" : "Control"}</span>
          <select value={selectedControlId} onChange={(event) => setSelectedControlId(event.target.value)}>
            {summary.items.map((item) => <option key={item.control.id} value={item.control.id}>{item.reference} · {item.title}</option>)}
          </select>
        </label>
        {control && <div className={`cil-health ${control.state}`}>
          <small>{tr ? "Güvence" : "Assurance"}</small>
          <strong>{control.score}/100</strong>
          <span>{healthLabel}</span>
        </div>}
        {detail && <div className="cil-lineage">
          <small>{tr ? "İzlenebilirlik" : "Lineage"}</small>
          <strong>{detail.lineagePercent}%</strong>
          <span>{detail.connectedStages}/{detail.totalStages} {tr ? "aşama bağlı" : "stages connected"}</span>
        </div>}
      </div>

      {control && <div className="cil-blast-radius">
        <div>
          <small>{tr ? "ETKİ ÖZETİ" : "IMPACT SUMMARY"}</small>
          <strong>{control.reference}</strong>
          <span>{tr
            ? `${stages.filter((stage) => stage.count > 0).length} bağlı alan · ${impactCount} ilişkili kayıt`
            : `${stages.filter((stage) => stage.count > 0).length} connected domains · ${impactCount} related records`}</span>
        </div>
        <p>{tr
          ? `${control.frameworkCount} framework eşlemesi, ${control.currentEvidenceCount}/${control.evidenceCount} güncel kanıt, ${control.auditCount} denetim izi ve ${control.openFindingCount + control.openRemediationCount + control.automationOpenFindingCount} açık aksiyon bu kontrolün güvence durumundan etkileniyor.`
          : `${control.frameworkCount} framework mappings, ${control.currentEvidenceCount}/${control.evidenceCount} current evidence items, ${control.auditCount} audit traces and ${control.openFindingCount + control.openRemediationCount + control.automationOpenFindingCount} open actions are affected by this control's assurance state.`}</p>
      </div>}

      <div className="cil-stage-grid">
        {stages.map((stage) => <button type="button" key={stage.key} className={`${stage.count ? "connected" : "missing"} ${stage.expected ? "required" : "optional"}`} onClick={() => openStage(stage)}>
          <small>{tr ? stage.labelTr : stage.labelEn}</small>
          <strong>{stage.count}</strong>
          <span>{stage.count ? (tr ? "bağlı kayıt" : "linked records") : stage.expected ? (tr ? "bağlantı eksik" : "link missing") : (tr ? "kayıt yok" : "none")}</span>
          <em>→</em>
        </button>)}
      </div>

      {detail && (missingRequired.length > 0 || detail.unresolved.length > 0 || (control?.reasons.length || 0) > 0) && <div className="cil-gaps">
        <div>
          <small>{tr ? "GÜVENCE BOŞLUKLARI" : "ASSURANCE GAPS"}</small>
          <strong>{tr ? "Bağlantı ve güvence aksiyonları" : "Lineage and assurance actions"}</strong>
        </div>
        <div className="cil-gap-list">
          {missingRequired.map((stage) => <button type="button" key={`missing-${stage.key}`} onClick={() => openStage(stage)}>
            <b>{tr ? stage.labelTr : stage.labelEn}</b>
            <span>{tr ? "Zorunlu güvence bağlantısı kurulmamış." : "Required assurance relationship is not connected."}</span>
            <em>→</em>
          </button>)}
          {detail.unresolved.slice(0, 4).map((gap, index) => <div key={`${gap.sourceId}-${gap.field}-${index}`}>
            <b>{gap.relation}</b>
            <span>{gap.field}: {gap.value}</span>
            <em>{tr ? "çözümlenemedi" : "unresolved"}</em>
          </div>)}
          {control?.reasons.slice(0, 5).map((reason) => <div key={reason}>
            <b>{REASON_LABELS[reason]?.[lang] || reason.replaceAll("-", " ")}</b>
            <span>{tr ? "Kontrol güvence skorunu düşürüyor." : "Reduces the control assurance score."}</span>
          </div>)}
        </div>
      </div>}

      <footer>
        <span>{lastUpdated ? `${tr ? "Güncellendi" : "Updated"}: ${lastUpdated.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <button type="button" onClick={() => navigateToFornost({ module: "Kontroller", ref: control?.reference, kind: "control", source: "control-impact" })}>{tr ? "Kontrol kaydına dön" : "Back to control record"}<span>→</span></button>
      </footer>
    </>}
  </section>;

  return createPortal(content, mount);
}
