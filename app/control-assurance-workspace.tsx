"use client";

import { useMemo, useState } from "react";
import {
  buildControlAssurance,
  buildControlAssuranceDetail,
  type AssuranceRow,
  type ControlAssuranceDetail,
} from "./control-assurance";
import "./control-assurance.css";

type Props = { rows: AssuranceRow[]; lang: "tr" | "en"; go: (module: string) => void };

type StageDefinition = {
  key: string;
  title: string;
  eyebrow: string;
  module: string;
  rows?: AssuranceRow[];
  status?: string;
  meta?: string[];
};

const reasonLabels: Record<string, { tr: string; en: string }> = {
  "owner-missing": { tr: "Kontrol sahibi eksik", en: "Control owner missing" },
  "test-owner-missing": { tr: "Test sahibi eksik", en: "Test owner missing" },
  "test-date-missing": { tr: "Test tarihi planlanmamış", en: "Test date not planned" },
  "test-overdue": { tr: "Kontrol testi gecikmiş", en: "Control test overdue" },
  "test-failed": { tr: "Son kontrol testi başarısız", en: "Latest control test failed" },
  "evidence-missing": { tr: "Bağlı kanıt yok", en: "No linked evidence" },
  "evidence-stale": { tr: "Kanıt güncel değil", en: "Evidence is not current" },
  "audit-missing": { tr: "Denetim izi yok", en: "No audit trace" },
  "open-findings": { tr: "Açık bulgu / CAPA var", en: "Open finding / CAPA exists" },
  "control-needs-improvement": { tr: "Kontrol iyileştirme bekliyor", en: "Control needs improvement" },
};

const text = (value: unknown) => String(value ?? "").trim();
const rowReference = (row: AssuranceRow) => text(
  row.data.controlRef
  || row.data.requirementRef
  || row.data.evidenceRef
  || row.data.findingRef
  || row.data.riskRef
  || row.data.ruleId
  || row.code
  || row.id,
);
const rowTitle = (row: AssuranceRow) => text(
  row.data.controlTitle
  || row.data.requirementTitle
  || row.data.evidenceTitle
  || row.data.finding
  || row.data.riskTitle
  || row.data.riskName
  || row.data.title
  || row.data.name
  || row.data.framework
  || rowReference(row),
);
const rowStatus = (row: AssuranceRow) => text(row.data.status || row.data.result || row.data.reviewStatus);
const rowOwner = (row: AssuranceRow) => text(row.data.owner || row.data.assignee || row.data.auditOwner || row.data.testOwner);

function stageDefinitions(detail: ControlAssuranceDetail, lang: "tr" | "en"): StageDefinition[] {
  const tr = lang === "tr";
  const test = detail.test;
  const testStatus = test.status === "failed"
    ? (tr ? "Başarısız" : "Failed")
    : test.status === "overdue"
      ? (tr ? "Gecikmiş" : "Overdue")
      : test.status === "planned"
        ? (tr ? "Planlı / izleniyor" : "Planned / monitored")
        : (tr ? "Planlanmamış" : "Not planned");

  return [
    {
      key: "control",
      eyebrow: tr ? "01 · KONTROL" : "01 · CONTROL",
      title: detail.item.reference,
      module: "Kontroller",
      rows: [detail.item.control],
      status: detail.item.state === "healthy" ? (tr ? "Güçlü" : "Healthy") : detail.item.state === "critical" ? (tr ? "Kritik" : "Critical") : (tr ? "Aksiyon" : "Action"),
      meta: [detail.item.owner || (tr ? "Sahip atanmamış" : "Owner unassigned"), `${detail.item.score}/100`],
    },
    {
      key: "framework",
      eyebrow: tr ? "02 · FRAMEWORK GEREKSİNİMİ" : "02 · FRAMEWORK REQUIREMENT",
      title: tr ? "Framework eşlemeleri" : "Framework mappings",
      module: "Uyum",
      rows: detail.frameworks,
    },
    {
      key: "evidence",
      eyebrow: tr ? "03 · KANIT" : "03 · EVIDENCE",
      title: tr ? "Kanıt zinciri" : "Evidence chain",
      module: "Kanıtlar",
      rows: detail.evidence,
      meta: [`${detail.item.currentEvidenceCount}/${detail.item.evidenceCount} ${tr ? "güncel" : "current"}`],
    },
    {
      key: "automation",
      eyebrow: tr ? "04 · OTOMASYON" : "04 · AUTOMATION",
      title: tr ? "Sürekli kanıt toplama" : "Continuous evidence collection",
      module: "Kanıt Otomasyonu",
      rows: detail.automations,
    },
    {
      key: "test",
      eyebrow: tr ? "05 · KONTROL TESTİ" : "05 · CONTROL TEST",
      title: testStatus,
      module: "Denetim Yönetimi",
      status: testStatus,
      meta: [
        test.owner || (tr ? "Test sahibi yok" : "No test owner"),
        test.frequency || (tr ? "Frekans tanımsız" : "Frequency undefined"),
        test.nextTestDate ? `${tr ? "Sonraki" : "Next"}: ${test.nextTestDate}` : (tr ? "Tarih yok" : "No date"),
        `${detail.audits.length} ${tr ? "denetim izi" : "audit traces"}`,
      ],
    },
    {
      key: "finding",
      eyebrow: tr ? "06 · BULGU / CAPA" : "06 · FINDING / CAPA",
      title: tr ? "Açık bulgular ve iyileştirme" : "Open findings and remediation",
      module: "Bulgular ve CAPA",
      rows: detail.findings,
    },
    {
      key: "risk",
      eyebrow: tr ? "07 · RİSK" : "07 · RISK",
      title: tr ? "Risk etkisi ve geri besleme" : "Risk impact and feedback",
      module: "Risk Assessment",
      rows: detail.risks,
    },
  ];
}

export default function ControlAssuranceWorkspace({ rows, lang, go }: Props) {
  const tr = lang === "tr";
  const summary = useMemo(() => buildControlAssurance(rows), [rows]);
  const queue = summary.items.filter((item) => item.state !== "healthy").slice(0, 8);
  const [selectedControlId, setSelectedControlId] = useState<string>("");
  const detail = useMemo(
    () => selectedControlId ? buildControlAssuranceDetail(rows, selectedControlId) : null,
    [rows, selectedControlId],
  );
  const stages = detail ? stageDefinitions(detail, lang) : [];
  const stateLabel = (state: string) => state === "healthy" ? (tr ? "Güçlü" : "Healthy") : state === "critical" ? (tr ? "Kritik" : "Critical") : (tr ? "Aksiyon" : "Action");

  return <section className="control-assurance-workspace">
    <header>
      <div><small>{tr ? "SÜREKLİ KONTROL GÜVENCESİ" : "CONTINUOUS CONTROL ASSURANCE"}</small><h3>{tr ? "Güvence sağlığı ve aksiyon kuyruğu" : "Assurance health and action queue"}</h3><p>{tr ? "Kanıt, test, bulgu ve risk izini kontrol bazında birleştirir; eksikleri önceliklendirir." : "Combines evidence, testing, findings and risk lineage by control, then prioritizes gaps."}</p></div>
      <button type="button" onClick={() => go("Bağlantılı GRC")}>{tr ? "GRC haritasını aç" : "Open GRC map"}<span>→</span></button>
    </header>
    <div className="control-assurance-kpis">
      <article><small>{tr ? "Güvence skoru" : "Assurance score"}</small><strong>{summary.score}<sup>/100</sup></strong><span>{tr ? "Portföy ortalaması" : "Portfolio average"}</span></article>
      <article><small>{tr ? "Güçlü kontroller" : "Healthy controls"}</small><strong>{summary.healthy}<sup>/{summary.total}</sup></strong><span>{tr ? "Test ve kanıtı yeterli" : "Sufficient test and evidence"}</span></article>
      <article><small>{tr ? "Güncel kanıt" : "Current evidence"}</small><strong>{summary.currentEvidence}<sup>/{summary.total}</sup></strong><span>{tr ? "Geçerli kanıtı bulunan" : "With valid evidence"}</span></article>
      <article className={summary.overdueTests ? "danger" : ""}><small>{tr ? "Geciken test" : "Overdue tests"}</small><strong>{summary.overdueTests}</strong><span>{tr ? "Tarihi geçmiş kontrol testi" : "Control tests past due"}</span></article>
    </div>
    <div className="control-assurance-queue">
      <div className="control-assurance-queue-head"><div><small>{tr ? "ÖNCELİKLİ İŞ LİSTESİ" : "PRIORITY WORKLIST"}</small><h4>{tr ? "Güvence açığı bulunan kontroller" : "Controls with assurance gaps"}</h4></div><span>{queue.length} {tr ? "öncelik" : "priorities"}</span></div>
      {queue.length ? <div className="control-assurance-list">{queue.map((item) => <article key={item.control.id} className={selectedControlId === item.control.id ? "selected" : ""}>
        <div className="control-assurance-score"><strong>{item.score}</strong><span>/100</span></div>
        <div className="control-assurance-copy"><div><span className={`assurance-state ${item.state}`}>{stateLabel(item.state)}</span><b>{item.reference}</b></div><h5>{item.title}</h5><p>{item.owner || (tr ? "Sahip atanmamış" : "Owner unassigned")}</p></div>
        <div className="control-assurance-links"><span><b>{item.currentEvidenceCount}/{item.evidenceCount}</b>{tr ? "güncel kanıt" : "current evidence"}</span><span><b>{item.frameworkCount}</b>{tr ? "framework" : "frameworks"}</span><span className={item.testOverdue ? "overdue" : ""}><b>{item.nextTestDate || "—"}</b>{tr ? "sonraki test" : "next test"}</span></div>
        <div className="control-assurance-reasons">{item.reasons.slice(0, 3).map((reason) => <span key={reason}>{reasonLabels[reason]?.[lang] || reason}</span>)}</div>
        <div className="control-assurance-actions">
          <button type="button" className="primary" aria-expanded={selectedControlId === item.control.id} aria-controls="control-assurance-drilldown" onClick={() => setSelectedControlId((current) => current === item.control.id ? "" : item.control.id)}>{selectedControlId === item.control.id ? (tr ? "Zinciri kapat" : "Close chain") : (tr ? "Zinciri aç" : "Open chain")}</button>
          <button type="button" onClick={() => go("Kanıtlar")}>{tr ? "Kanıt" : "Evidence"}</button>
          <button type="button" onClick={() => go("Kanıt Otomasyonu")}>{tr ? "Otomasyon" : "Automation"}</button>
          <button type="button" onClick={() => go("Denetim Yönetimi")}>{tr ? "Denetim" : "Audit"}</button>
        </div>
      </article>)}</div> : <div className="control-assurance-empty"><b>{tr ? "Tüm kontroller güvence hedefini karşılıyor." : "All controls meet the assurance target."}</b><span>{tr ? "Kanıt ve test sağlığı izlenmeye devam ediyor." : "Evidence and test health remains under monitoring."}</span></div>}
    </div>

    {detail && <section id="control-assurance-drilldown" className="control-assurance-drilldown" aria-label={tr ? "Kontrol güvence zinciri" : "Control assurance chain"}>
      <div className="control-assurance-detail-head">
        <div>
          <small>{tr ? "UÇTAN UCA GÜVENCE ZİNCİRİ" : "END-TO-END ASSURANCE CHAIN"}</small>
          <h4>{detail.item.reference} · {detail.item.title}</h4>
          <p>{tr ? "Kontrolden framework gereksinimine, kanıttan otomasyona, testten bulgu ve riske kadar izlenebilirlik." : "Traceability from control to framework requirement, evidence, automation, test, finding and risk."}</p>
        </div>
        <div className="control-assurance-detail-health">
          <strong>{detail.lineagePercent}<sup>%</sup></strong>
          <span>{tr ? "zincir kapsaması" : "chain coverage"}</span>
          <small>{detail.connectedStages}/{detail.totalStages} {tr ? "bağlı aşama" : "connected stages"}</small>
        </div>
        <button type="button" className="control-assurance-close" onClick={() => setSelectedControlId("")} aria-label={tr ? "Güvence zincirini kapat" : "Close assurance chain"}>×</button>
      </div>

      <div className="control-assurance-chain">
        {stages.map((stage, index) => {
          const stageRows = stage.rows || [];
          const connected = stage.key === "control" || stage.key === "test" ? stage.key === "control" || detail.test.status !== "not-planned" : stageRows.length > 0;
          return <div className="control-assurance-chain-wrap" key={stage.key}>
            <article className={`control-assurance-stage ${connected ? "connected" : "missing"}`}>
              <header>
                <div><small>{stage.eyebrow}</small><h5>{stage.title}</h5></div>
                <button type="button" onClick={() => go(stage.module)}>{tr ? "Modüle git" : "Open module"} <span>↗</span></button>
              </header>
              {stage.status && <span className={`control-assurance-stage-status ${stage.key === "test" ? detail.test.status : detail.item.state}`}>{stage.status}</span>}
              {stage.meta?.length ? <div className="control-assurance-stage-meta">{stage.meta.filter(Boolean).map((entry) => <span key={entry}>{entry}</span>)}</div> : null}
              {stageRows.length ? <div className="control-assurance-stage-records">{stageRows.slice(0, 4).map((row) => <div key={row.id}>
                <b>{rowReference(row)}</b>
                <span>{rowTitle(row)}</span>
                <small>{[rowOwner(row), rowStatus(row)].filter(Boolean).join(" · ") || (tr ? "Bağlı kayıt" : "Linked record")}</small>
              </div>)}</div> : stage.key !== "test" && <div className="control-assurance-stage-empty"><b>{tr ? "Bağlantı yok" : "No linkage"}</b><span>{tr ? "Bu aşama için ilişki kurulmamış." : "No relationship is mapped for this stage."}</span></div>}
              {stageRows.length > 4 && <small className="control-assurance-stage-more">+{stageRows.length - 4} {tr ? "kayıt daha" : "more records"}</small>}
            </article>
            {index < stages.length - 1 && <div className={`control-assurance-chain-arrow ${connected ? "connected" : ""}`} aria-hidden="true"><span>→</span></div>}
          </div>;
        })}
      </div>

      <footer className="control-assurance-detail-footer">
        <div><b>{detail.audits.length}</b><span>{tr ? "denetim izi" : "audit traces"}</span></div>
        <div><b>{detail.findings.length}</b><span>{tr ? "açık bulgu / CAPA" : "open findings / CAPA"}</span></div>
        <div><b>{detail.risks.length}</b><span>{tr ? "bağlı risk" : "linked risks"}</span></div>
        <div className={detail.unresolved.length ? "warning" : ""}><b>{detail.unresolved.length}</b><span>{tr ? "çözümlenmemiş referans" : "unresolved references"}</span></div>
      </footer>
    </section>}
  </section>;
}
