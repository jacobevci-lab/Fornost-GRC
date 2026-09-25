"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildControlAssurance,
  buildControlAssuranceDetail,
  type AssuranceRow,
  type ControlAssuranceDetail,
} from "./control-assurance";
import { buildConnectedGrcEnterpriseRows } from "./connected-grc-sources";
import { withBasePath } from "./base-path";
import "./control-assurance.css";

type Props = { rows: AssuranceRow[]; lang: "tr" | "en"; go: (module: string) => void };
type JsonRecord = Record<string, unknown>;
type EvidenceIntegritySnapshot = {
  integrity: string;
  checkedVersions: number;
  failedVersion: number;
};

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

const text = (value: unknown) => String(value ?? "").trim();
const uniqueRows = (rows: AssuranceRow[]) => [...new Map(rows.map((row) => [row.id, row])).values()];
const rowReference = (row: AssuranceRow) => text(
  row.data.controlRef
  || row.data.requirementRef
  || row.data.evidenceRef
  || row.data.findingRef
  || row.data.riskRef
  || row.data.sourceRef
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
const rowOwner = (row: AssuranceRow) => text(row.data.owner || row.data.assignee || row.data.auditOwner || row.data.testOwner);
const rowStatus = (row: AssuranceRow, lang: "tr" | "en") => {
  const integrity = text(row.data.evidenceIntegrity).toLowerCase();
  if (integrity === "verified") return lang === "tr" ? "Bütünlük doğrulandı" : "Integrity verified";
  if (integrity === "broken") return lang === "tr" ? "Bütünlük bozuk" : "Integrity broken";
  if (integrity === "legacy-unverified") return lang === "tr" ? "Eski kanıt · doğrulanmamış" : "Legacy · unverified";
  if (integrity === "unavailable") return lang === "tr" ? "Doğrulama kullanılamıyor" : "Verification unavailable";
  return text(row.data.status || row.data.result || row.data.reviewStatus || row.data.assuranceState || row.data.automationHealth);
};

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
  const findingCapaRows = uniqueRows([...detail.findings, ...detail.remediations]);

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
      title: tr ? "Kanıt zinciri ve bütünlük" : "Evidence chain and integrity",
      module: "Kanıtlar",
      rows: detail.evidence,
      meta: [
        `${detail.item.currentEvidenceCount}/${detail.item.evidenceCount} ${tr ? "güncel" : "current"}`,
        `${detail.item.verifiedEvidenceCount} ${tr ? "doğrulanmış" : "verified"}`,
        `${detail.item.brokenEvidenceCount} ${tr ? "bozuk zincir" : "broken chains"}`,
        `${detail.item.legacyEvidenceCount + detail.item.unavailableEvidenceCount} ${tr ? "doğrulanmamış" : "unverified"}`,
      ],
    },
    {
      key: "automation",
      eyebrow: tr ? "04 · OTOMASYON" : "04 · AUTOMATION",
      title: tr ? "Sürekli güvence ve kanıt" : "Continuous assurance and evidence",
      module: "Kanıt Otomasyonu",
      rows: detail.automations,
      meta: [
        `${detail.item.automationHealthyCount}/${detail.item.automationRuleCount} ${tr ? "sağlıklı kural" : "healthy rules"}`,
        `${detail.item.automationOpenFindingCount} ${tr ? "açık otomasyon bulgusu" : "open automation findings"}`,
      ],
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
      rows: findingCapaRows,
      meta: [`${detail.remediations.length} ${tr ? "CAPA / remediation" : "CAPA / remediation"}`],
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
  const [liveRows, setLiveRows] = useState<AssuranceRow[]>([]);
  const [evidenceIntegrity, setEvidenceIntegrity] = useState<Record<string, EvidenceIntegritySnapshot>>({});
  const [selectedControlId, setSelectedControlId] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([
      fetch(withBasePath("/api/evidence-automation"), { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : {}),
      fetch(withBasePath("/api/findings"), { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : {}),
      fetch(withBasePath("/api/evidence/history"), { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : {}),
    ]).then(([evidenceAutomation, findings, history]) => {
      if (!active) return;
      const projected = buildConnectedGrcEnterpriseRows({
        evidenceAutomation: evidenceAutomation as JsonRecord,
        findings: findings as JsonRecord,
      });
      const snapshots: Record<string, EvidenceIntegritySnapshot> = {};
      const items = Array.isArray((history as JsonRecord).evidenceItems) ? (history as JsonRecord).evidenceItems as JsonRecord[] : [];
      for (const item of items) {
        const id = text(item.id);
        const integrity = text(item.integrity);
        if (!id || !integrity) continue;
        snapshots[id] = {
          integrity,
          checkedVersions: Number(item.checkedVersions || 0),
          failedVersion: Number(item.failedVersion || 0),
        };
      }
      setLiveRows(projected as AssuranceRow[]);
      setEvidenceIntegrity(snapshots);
    }).catch((error: unknown) => {
      if (active && (error as { name?: string })?.name !== "AbortError") {
        setLiveRows([]);
        setEvidenceIntegrity({});
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const mergedRows = useMemo(() => {
    const merged = new Map<string, AssuranceRow>();
    for (const row of [...rows, ...liveRows]) merged.set(row.id, row);
    return Array.from(merged.values()).map((row) => {
      if (row.module !== "Kanıtlar") return row;
      const snapshot = evidenceIntegrity[row.id];
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
  }, [rows, liveRows, evidenceIntegrity]);
  const summary = useMemo(() => buildControlAssurance(mergedRows), [mergedRows]);
  const queue = summary.items.filter((item) => item.state !== "healthy").slice(0, 8);
  const detail = useMemo(
    () => selectedControlId ? buildControlAssuranceDetail(mergedRows, selectedControlId) : null,
    [mergedRows, selectedControlId],
  );
  const stages = detail ? stageDefinitions(detail, lang) : [];
  const stateLabel = (state: string) => state === "healthy" ? (tr ? "Güçlü" : "Healthy") : state === "critical" ? (tr ? "Kritik" : "Critical") : (tr ? "Aksiyon" : "Action");

  return <section className="control-assurance-workspace">
    <header>
      <div><small>{tr ? "SÜREKLİ KONTROL GÜVENCESİ" : "CONTINUOUS CONTROL ASSURANCE"}</small><h3>{tr ? "Güvence sağlığı ve aksiyon kuyruğu" : "Assurance health and action queue"}</h3><p>{tr ? "Kanıt tazeliği ve kriptografik bütünlüğü, otomatik kontrol sağlığı, test, CAPA ve risk izini kontrol bazında tek güvence sinyalinde birleştirir." : "Combines evidence freshness and cryptographic integrity, automated control health, testing, CAPA and risk lineage into one assurance signal per control."}</p></div>
      <button type="button" onClick={() => go("Bağlantılı GRC")}>{tr ? "GRC haritasını aç" : "Open GRC map"}<span>→</span></button>
    </header>
    <div className="control-assurance-kpis">
      <article><small>{tr ? "Güvence skoru" : "Assurance score"}</small><strong>{summary.score}<sup>/100</sup></strong><span>{tr ? "Portföy ortalaması" : "Portfolio average"}</span></article>
      <article><small>{tr ? "Güçlü kontroller" : "Healthy controls"}</small><strong>{summary.healthy}<sup>/{summary.total}</sup></strong><span>{tr ? "Tüm güvence sinyalleri yeterli" : "All assurance signals sufficient"}</span></article>
      <article><small>{tr ? "Güncel güvence" : "Current assurance"}</small><strong>{summary.currentEvidence}<sup>/{summary.total}</sup></strong><span>{tr ? "Manuel veya otomatik güncel kanıt" : "Current manual or automated evidence"}</span></article>
      <article><small>{tr ? "Doğrulanmış kanıt" : "Verified evidence"}</small><strong>{summary.verifiedEvidenceControls}<sup>/{summary.total}</sup></strong><span>{tr ? "Tüm bağlı manuel kanıt zincirleri doğrulanmış" : "All linked manual evidence chains verified"}</span></article>
      <article className={summary.integrityFailures ? "danger" : ""}><small>{tr ? "Bütünlük hatası" : "Integrity failures"}</small><strong>{summary.integrityFailures}</strong><span>{tr ? "Bozuk kanıt zinciri bağlı kontrol" : "Controls linked to broken evidence chains"}</span></article>
      <article><small>{tr ? "Otomasyon sağlığı" : "Automation health"}</small><strong>{summary.automationHealthy}<sup>/{summary.automationCovered}</sup></strong><span>{tr ? "Tam sağlıklı / otomasyona bağlı" : "Fully healthy / automation-linked"}</span></article>
      <article className={summary.openFindings ? "danger" : ""}><small>{tr ? "Açık bulgu/CAPA" : "Open finding/CAPA"}</small><strong>{summary.openFindings}</strong><span>{tr ? "Güvence zincirinde" : "In assurance lineage"}</span></article>
    </div>
    <div className="control-assurance-queue">
      <div className="control-assurance-queue-head"><div><small>{tr ? "ÖNCELİKLİ İŞ LİSTESİ" : "PRIORITY WORKLIST"}</small><h4>{tr ? "Güvence açığı bulunan kontroller" : "Controls with assurance gaps"}</h4></div><span>{queue.length} {tr ? "öncelik" : "priorities"}</span></div>
      {queue.length ? <div className="control-assurance-list">{queue.map((item) => <article key={item.control.id} className={selectedControlId === item.control.id ? "selected" : ""}>
        <div className="control-assurance-score"><strong>{item.score}</strong><span>/100</span></div>
        <div className="control-assurance-copy"><div><span className={`assurance-state ${item.state}`}>{stateLabel(item.state)}</span><b>{item.reference}</b></div><h5>{item.title}</h5><p>{item.owner || (tr ? "Sahip atanmamış" : "Owner unassigned")}</p></div>
        <div className="control-assurance-links">
          <span><b>{item.currentEvidenceCount}/{item.evidenceCount}</b>{tr ? "güncel kanıt" : "current evidence"}</span>
          <span className={item.brokenEvidenceCount ? "overdue" : ""}><b>{item.verifiedEvidenceCount}/{item.evidenceCount}</b>{tr ? "bütünlük doğrulandı" : "integrity verified"}</span>
          <span><b>{item.automationHealthyCount}/{item.automationRuleCount}</b>{tr ? "sağlıklı otomasyon" : "healthy automation"}</span>
          <span className={item.openFindingCount + item.automationOpenFindingCount + item.openRemediationCount ? "overdue" : ""}><b>{item.openFindingCount + item.automationOpenFindingCount + item.openRemediationCount}</b>{tr ? "açık bulgu/CAPA" : "open finding/CAPA"}</span>
        </div>
        <div className="control-assurance-reasons">{item.reasons.slice(0, 5).map((reason) => <span key={reason}>{reasonLabels[reason]?.[lang] || reason}</span>)}</div>
        <div className="control-assurance-actions">
          <button type="button" className="primary" aria-expanded={selectedControlId === item.control.id} aria-controls="control-assurance-drilldown" onClick={() => setSelectedControlId((current) => current === item.control.id ? "" : item.control.id)}>{selectedControlId === item.control.id ? (tr ? "Zinciri kapat" : "Close chain") : (tr ? "Zinciri aç" : "Open chain")}</button>
          <button type="button" onClick={() => go("Kanıtlar")}>{tr ? "Kanıt" : "Evidence"}</button>
          <button type="button" onClick={() => go("Kanıt Otomasyonu")}>{tr ? "Otomasyon" : "Automation"}</button>
          <button type="button" onClick={() => go("Denetim Yönetimi")}>{tr ? "Denetim" : "Audit"}</button>
          <button type="button" onClick={() => go("Bulgular ve CAPA")}>CAPA</button>
          <button type="button" onClick={() => go("Risk Assessment")}>{tr ? "Risk" : "Risk"}</button>
        </div>
      </article>)}</div> : <div className="control-assurance-empty"><b>{tr ? "Tüm kontroller güvence hedefini karşılıyor." : "All controls meet the assurance target."}</b><span>{tr ? "Kanıt bütünlüğü, otomasyon, CAPA ve test sağlığı izlenmeye devam ediyor." : "Evidence integrity, automation, CAPA and test health remain under monitoring."}</span></div>}
    </div>

    {detail && <section id="control-assurance-drilldown" className="control-assurance-drilldown" aria-label={tr ? "Kontrol güvence zinciri" : "Control assurance chain"}>
      <div className="control-assurance-detail-head">
        <div>
          <small>{tr ? "UÇTAN UCA GÜVENCE ZİNCİRİ" : "END-TO-END ASSURANCE CHAIN"}</small>
          <h4>{detail.item.reference} · {detail.item.title}</h4>
          <p>{tr ? "Kontrolden framework gereksinimine, kriptografik kanıt bütünlüğünden otomasyona, testten bulgu/CAPA ve riske kadar izlenebilirlik." : "Traceability from control to framework requirement, cryptographic evidence integrity, automation, testing, finding/CAPA and risk."}</p>
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
                <small>{[rowOwner(row), rowStatus(row, lang)].filter(Boolean).join(" · ") || (tr ? "Bağlı kayıt" : "Linked record")}</small>
              </div>)}</div> : stage.key !== "test" && <div className="control-assurance-stage-empty"><b>{tr ? "Bağlantı yok" : "No linkage"}</b><span>{tr ? "Bu aşama için ilişki kurulmamış." : "No relationship is mapped for this stage."}</span></div>}
              {stageRows.length > 4 && <small className="control-assurance-stage-more">+{stageRows.length - 4} {tr ? "kayıt daha" : "more records"}</small>}
            </article>
            {index < stages.length - 1 && <div className={`control-assurance-chain-arrow ${connected ? "connected" : ""}`} aria-hidden="true"><span>→</span></div>}
          </div>;
        })}
      </div>

      <footer className="control-assurance-detail-footer">
        <div><b>{detail.audits.length}</b><span>{tr ? "denetim izi" : "audit traces"}</span></div>
        <div><b>{detail.findings.length}</b><span>{tr ? "açık bulgu" : "open findings"}</span></div>
        <div><b>{detail.remediations.length}</b><span>{tr ? "CAPA / remediation" : "CAPA / remediation"}</span></div>
        <div><b>{detail.risks.length}</b><span>{tr ? "bağlı risk" : "linked risks"}</span></div>
        <div className={detail.item.brokenEvidenceCount ? "danger" : ""}><b>{detail.item.brokenEvidenceCount}</b><span>{tr ? "bozuk kanıt zinciri" : "broken evidence chains"}</span></div>
        <div className={detail.unresolved.length ? "warning" : ""}><b>{detail.unresolved.length}</b><span>{tr ? "çözümlenmemiş referans" : "unresolved references"}</span></div>
      </footer>
    </section>}
  </section>;
}
