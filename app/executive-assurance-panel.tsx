import { buildExecutiveAssurance } from "./executive-assurance";
import type { AssuranceRow } from "./control-assurance";
import "./executive-assurance.css";

export default function ExecutiveAssurancePanel({ rows, lang, go }: { rows: AssuranceRow[]; lang: "tr" | "en"; go: (module: string) => void }) {
  const tr = lang === "tr", assurance = buildExecutiveAssurance(rows);
  const state = assurance.state === "strong" ? (tr ? "Güçlü" : "Strong") : assurance.state === "developing" ? (tr ? "Gelişiyor" : "Developing") : (tr ? "Kritik" : "Critical");
  const metrics = [
    [assurance.traceabilityScore, tr ? "Zincir bütünlüğü" : "Chain integrity", `${assurance.completeChains}/${assurance.totalChains} ${tr ? "tam" : "complete"}`],
    [assurance.controlScore, tr ? "Kontrol güvencesi" : "Control assurance", tr ? "Test + kanıt" : "Test + evidence"],
    [assurance.evidenceScore, tr ? "Kanıt güveni" : "Evidence confidence", `${assurance.currentEvidence}/${assurance.totalEvidence} ${tr ? "güncel" : "current"}`],
    [assurance.auditScore, tr ? "Denetim readiness" : "Audit readiness", `${assurance.readyAudits}/${assurance.totalAudits} ${tr ? "hazır" : "ready"}`],
  ] as const;
  return <section className="executive-assurance-panel">
    <header><div><small>{tr ? "BAĞLI GRC GÜVENCE POSTURE" : "CONNECTED GRC ASSURANCE POSTURE"}</small><h3>{tr ? "Riskten kanıta karar görünümü" : "Risk-to-evidence decision view"}</h3><p>{tr ? "Kontrol, kanıt ve denetim zincirinin gerçek tamlığını ölçer." : "Measures actual completeness across controls, evidence and audits."}</p></div><button onClick={() => go("Bağlantılı GRC")}>{tr ? "Açıkları incele" : "Review gaps"}<span>→</span></button></header>
    <div className="executive-assurance-body"><div className={`executive-assurance-score ${assurance.state}`}><small>{tr ? "BÜTÜNLEŞİK SKOR" : "COMPOSITE SCORE"}</small><strong>{assurance.score}<sup>/100</sup></strong><b>{state}</b><span>{assurance.partialChains} {tr ? "kısmi zincir" : "partial chains"}</span></div><div className="executive-assurance-metrics">{metrics.map(([value,label,detail]) => <article key={label}><div><b>{label}</b><strong>{value}%</strong></div><i><em style={{width:`${value}%`}}/></i><span>{detail}</span></article>)}</div></div>
  </section>;
}
