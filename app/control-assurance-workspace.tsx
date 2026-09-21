"use client";

import { useEffect, useMemo, useState } from "react";
import { buildControlAssurance, type AssuranceRow } from "./control-assurance";
import { withBasePath } from "./base-path";
import "./control-assurance.css";

type Props = { rows: AssuranceRow[]; lang: "tr" | "en"; go: (module: string) => void };
type JsonRecord = Record<string, unknown>;

const reasonLabels: Record<string, { tr: string; en: string }> = {
  "owner-missing": { tr: "Kontrol sahibi eksik", en: "Control owner missing" },
  "test-owner-missing": { tr: "Test sahibi eksik", en: "Test owner missing" },
  "test-date-missing": { tr: "Test tarihi planlanmamış", en: "Test date not planned" },
  "test-overdue": { tr: "Kontrol testi gecikmiş", en: "Control test overdue" },
  "evidence-missing": { tr: "Bağlı kanıt yok", en: "No linked evidence" },
  "evidence-stale": { tr: "Kanıt güncel değil", en: "Evidence is not current" },
  "audit-missing": { tr: "Denetim izi yok", en: "No audit trace" },
  "automation-failing": { tr: "Otomatik kontrol başarısız", en: "Automated control failing" },
  "automation-stale": { tr: "Otomatik kanıt bayat/eksik", en: "Automated evidence stale/missing" },
  "automation-attention": { tr: "Otomasyon sinyali dikkat istiyor", en: "Automation signal needs attention" },
  "automation-finding-open": { tr: "Açık otomasyon bulgusu", en: "Open automation finding" },
  "remediation-open": { tr: "Açık CAPA / remediation", en: "Open CAPA / remediation" },
  "risk-link-missing": { tr: "Bulgu risk bağlantısı eksik", en: "Finding risk link missing" },
  "control-needs-improvement": { tr: "Kontrol iyileştirme bekliyor", en: "Control needs improvement" },
};

const records = (value: unknown): JsonRecord[] => Array.isArray(value)
  ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : [];
const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

function liveRows(automation: JsonRecord, findings: JsonRecord): AssuranceRow[] {
  const rules = records(automation.rules).map((item, index) => ({
    id: `assurance:automation-rule:${text(item.id) || index}`,
    module: "Kanıt Otomasyonu",
    data: {
      kind: "automation-rule",
      name: text(item.name),
      identityRefs: [text(item.id)].filter(Boolean),
      automationControlRefs: item.controlRefs ?? item.control_refs,
      automationHealth: text(item.health || item.lastStatus || item.last_status),
      automationFreshness: text(item.freshness),
      lastEvidenceAt: item.lastEvidenceAt ?? item.last_evidence_at,
    },
  }));
  const automationFindings = records(automation.findings).map((item, index) => ({
    id: `assurance:automation-finding:${text(item.id) || index}`,
    module: "Kanıt Otomasyonu",
    data: {
      kind: "automation-finding",
      title: text(item.title),
      automationRuleRef: item.ruleId ?? item.rule_id,
      status: text(item.status),
      severity: text(item.severity),
    },
  }));
  const enterpriseFindings = records(findings.findings).map((item, index) => ({
    id: `assurance:finding:${text(item.id) || index}`,
    code: text(item.code) || undefined,
    module: "Bulgular ve CAPA",
    data: {
      kind: "finding",
      title: text(item.title),
      findingControlRef: item.controlRef ?? item.control_ref,
      findingRiskRef: item.riskRef ?? item.risk_ref,
      status: text(item.status),
      dueDate: item.dueDate ?? item.due_date,
      owner: text(item.owner),
    },
  }));
  return [...rules, ...automationFindings, ...enterpriseFindings];
}

export default function ControlAssuranceWorkspace({ rows, lang, go }: Props) {
  const tr = lang === "tr";
  const [live, setLive] = useState<AssuranceRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([
      fetch(withBasePath("/api/evidence-automation"), { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : {}),
      fetch(withBasePath("/api/findings"), { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : {}),
    ]).then(([automation, findings]) => {
      if (active) setLive(liveRows(automation as JsonRecord, findings as JsonRecord));
    }).catch((error) => {
      if ((error as { name?: string })?.name !== "AbortError") console.warn("Control assurance live signals unavailable");
    });
    return () => { active = false; controller.abort(); };
  }, []);

  const mergedRows = useMemo(() => {
    const merged = new Map<string, AssuranceRow>();
    for (const row of [...rows, ...live]) merged.set(row.id, row);
    return Array.from(merged.values());
  }, [rows, live]);
  const summary = useMemo(() => buildControlAssurance(mergedRows), [mergedRows]);
  const queue = summary.items.filter((item) => item.state !== "healthy").slice(0, 8);
  const stateLabel = (state: string) => state === "healthy" ? (tr ? "Güçlü" : "Healthy") : state === "critical" ? (tr ? "Kritik" : "Critical") : (tr ? "Aksiyon" : "Action");
  return <section className="control-assurance-workspace">
    <header>
      <div><small>{tr ? "SÜREKLİ KONTROL GÜVENCESİ" : "CONTINUOUS CONTROL ASSURANCE"}</small><h3>{tr ? "Güvence sağlığı ve aksiyon kuyruğu" : "Assurance health and action queue"}</h3><p>{tr ? "Kanıt tazeliği, otomatik kontrol sağlığı, test, CAPA ve risk izini kontrol bazında tek güvence sinyalinde birleştirir." : "Combines evidence freshness, automated control health, testing, CAPA and risk lineage into one assurance signal per control."}</p></div>
      <button type="button" onClick={() => go("Bağlantılı GRC")}>{tr ? "GRC haritasını aç" : "Open GRC map"}<span>→</span></button>
    </header>
    <div className="control-assurance-kpis">
      <article><small>{tr ? "Güvence skoru" : "Assurance score"}</small><strong>{summary.score}<sup>/100</sup></strong><span>{tr ? "Portföy ortalaması" : "Portfolio average"}</span></article>
      <article><small>{tr ? "Güçlü kontroller" : "Healthy controls"}</small><strong>{summary.healthy}<sup>/{summary.total}</sup></strong><span>{tr ? "Tüm güvence sinyalleri yeterli" : "All assurance signals sufficient"}</span></article>
      <article><small>{tr ? "Güncel güvence" : "Current assurance"}</small><strong>{summary.currentEvidence}<sup>/{summary.total}</sup></strong><span>{tr ? "Manuel veya otomatik güncel kanıt" : "Current manual or automated evidence"}</span></article>
      <article><small>{tr ? "Otomasyon kapsamı" : "Automation coverage"}</small><strong>{summary.automationHealthy}<sup>/{summary.automationCovered}</sup></strong><span>{tr ? "Tam sağlıklı / otomasyona bağlı" : "Fully healthy / automation-linked"}</span></article>
      <article className={summary.openFindings ? "danger" : ""}><small>{tr ? "Açık bulgu/CAPA" : "Open finding/CAPA"}</small><strong>{summary.openFindings}</strong><span>{tr ? "Kontrol güvence zincirinde" : "In the control assurance chain"}</span></article>
      <article className={summary.overdueTests ? "danger" : ""}><small>{tr ? "Geciken test" : "Overdue tests"}</small><strong>{summary.overdueTests}</strong><span>{tr ? "Tarihi geçmiş kontrol testi" : "Control tests past due"}</span></article>
    </div>
    <div className="control-assurance-queue">
      <div className="control-assurance-queue-head"><div><small>{tr ? "ÖNCELİKLİ İŞ LİSTESİ" : "PRIORITY WORKLIST"}</small><h4>{tr ? "Güvence açığı bulunan kontroller" : "Controls with assurance gaps"}</h4></div><span>{queue.length} {tr ? "öncelik" : "priorities"}</span></div>
      {queue.length ? <div className="control-assurance-list">{queue.map((item) => <article key={item.control.id}>
        <div className="control-assurance-score"><strong>{item.score}</strong><span>/100</span></div>
        <div className="control-assurance-copy"><div><span className={`assurance-state ${item.state}`}>{stateLabel(item.state)}</span><b>{item.reference}</b></div><h5>{item.title}</h5><p>{item.owner || (tr ? "Sahip atanmamış" : "Owner unassigned")}</p></div>
        <div className="control-assurance-links"><span><b>{item.currentEvidenceCount}/{item.evidenceCount}</b>{tr ? "manuel kanıt" : "manual evidence"}</span><span><b>{item.automationHealthyCount}/{item.automationRuleCount}</b>{tr ? "sağlıklı otomasyon" : "healthy automation"}</span><span className={item.openFindingCount + item.automationOpenFindingCount ? "overdue" : ""}><b>{item.openFindingCount + item.automationOpenFindingCount}</b>{tr ? "açık bulgu/CAPA" : "open finding/CAPA"}</span><span className={item.testOverdue ? "overdue" : ""}><b>{item.nextTestDate || "—"}</b>{tr ? "sonraki test" : "next test"}</span></div>
        <div className="control-assurance-reasons">{item.reasons.slice(0, 4).map((reason) => <span key={reason}>{reasonLabels[reason]?.[lang] || reason}</span>)}</div>
        <div className="control-assurance-actions"><button type="button" onClick={() => go("Kanıtlar")}>{tr ? "Kanıt" : "Evidence"}</button><button type="button" onClick={() => go("Kanıt Otomasyonu")}>{tr ? "Otomasyon" : "Automation"}</button><button type="button" onClick={() => go("Bulgular ve CAPA")}>CAPA</button><button type="button" onClick={() => go("Risk Assessment")}>{tr ? "Risk" : "Risk"}</button></div>
      </article>)}</div> : <div className="control-assurance-empty"><b>{tr ? "Tüm kontroller güvence hedefini karşılıyor." : "All controls meet the assurance target."}</b><span>{tr ? "Kanıt, otomasyon, CAPA ve test sağlığı izlenmeye devam ediyor." : "Evidence, automation, CAPA and test health remain under monitoring."}</span></div>}
    </div>
  </section>;
}
