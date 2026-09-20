import { buildControlAssurance, type AssuranceRow } from "./control-assurance";
import "./control-assurance.css";

type Props = { rows: AssuranceRow[]; lang: "tr" | "en"; go: (module: string) => void };

const reasonLabels: Record<string, { tr: string; en: string }> = {
  "owner-missing": { tr: "Kontrol sahibi eksik", en: "Control owner missing" },
  "test-owner-missing": { tr: "Test sahibi eksik", en: "Test owner missing" },
  "test-date-missing": { tr: "Test tarihi planlanmamış", en: "Test date not planned" },
  "test-overdue": { tr: "Kontrol testi gecikmiş", en: "Control test overdue" },
  "evidence-missing": { tr: "Bağlı kanıt yok", en: "No linked evidence" },
  "evidence-stale": { tr: "Kanıt güncel değil", en: "Evidence is not current" },
  "audit-missing": { tr: "Denetim izi yok", en: "No audit trace" },
  "control-needs-improvement": { tr: "Kontrol iyileştirme bekliyor", en: "Control needs improvement" },
};

export default function ControlAssuranceWorkspace({ rows, lang, go }: Props) {
  const tr = lang === "tr";
  const summary = buildControlAssurance(rows);
  const queue = summary.items.filter((item) => item.state !== "healthy").slice(0, 8);
  const stateLabel = (state: string) => state === "healthy" ? (tr ? "Güçlü" : "Healthy") : state === "critical" ? (tr ? "Kritik" : "Critical") : (tr ? "Aksiyon" : "Action");
  return <section className="control-assurance-workspace">
    <header>
      <div><small>{tr ? "SÜREKLİ KONTROL GÜVENCESİ" : "CONTINUOUS CONTROL ASSURANCE"}</small><h3>{tr ? "Güvence sağlığı ve aksiyon kuyruğu" : "Assurance health and action queue"}</h3><p>{tr ? "Kanıt, test ve denetim izini kontrol bazında birleştirir; eksikleri önceliklendirir." : "Combines evidence, testing and audit trace by control, then prioritizes gaps."}</p></div>
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
      {queue.length ? <div className="control-assurance-list">{queue.map((item) => <article key={item.control.id}>
        <div className="control-assurance-score"><strong>{item.score}</strong><span>/100</span></div>
        <div className="control-assurance-copy"><div><span className={`assurance-state ${item.state}`}>{stateLabel(item.state)}</span><b>{item.reference}</b></div><h5>{item.title}</h5><p>{item.owner || (tr ? "Sahip atanmamış" : "Owner unassigned")}</p></div>
        <div className="control-assurance-links"><span><b>{item.currentEvidenceCount}/{item.evidenceCount}</b>{tr ? "güncel kanıt" : "current evidence"}</span><span><b>{item.auditCount}</b>{tr ? "denetim izi" : "audit traces"}</span><span className={item.testOverdue ? "overdue" : ""}><b>{item.nextTestDate || "—"}</b>{tr ? "sonraki test" : "next test"}</span></div>
        <div className="control-assurance-reasons">{item.reasons.slice(0, 3).map((reason) => <span key={reason}>{reasonLabels[reason]?.[lang] || reason}</span>)}</div>
        <div className="control-assurance-actions"><button type="button" onClick={() => go("Kanıtlar")}>{tr ? "Kanıt" : "Evidence"}</button><button type="button" onClick={() => go("Kanıt Otomasyonu")}>{tr ? "Otomasyon" : "Automation"}</button><button type="button" onClick={() => go("Denetim Yönetimi")}>{tr ? "Denetim" : "Audit"}</button></div>
      </article>)}</div> : <div className="control-assurance-empty"><b>{tr ? "Tüm kontroller güvence hedefini karşılıyor." : "All controls meet the assurance target."}</b><span>{tr ? "Kanıt ve test sağlığı izlenmeye devam ediyor." : "Evidence and test health remains under monitoring."}</span></div>}
    </div>
  </section>;
}
