"use client";
import { useMemo } from "react";
import { navigateToFornost } from "./navigation-focus";
import { evaluateEvidenceEligibility } from "./evidence/eligibility";
import type { EvidenceRegisterAssessment } from "./use-evidence-assurance";
import "./evidence-quality-lens.css";
type Lang = "tr" | "en";
type QualityIssue = { id: string; recordRef: string; title: string; owner: string; controlRefs: string[]; kind: "broken" | "stale" | "legacy" | "unlinked" | "owner" | "unknown" | "review"; detail: string };
const text = (value: unknown) => String(value ?? "").trim();
const splitRefs = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(splitRefs) : text(value).split(/[;,|\n]+/).map(item => item.trim()).filter(Boolean);
function formatIssue(kind: QualityIssue["kind"], lang: Lang, failedVersion = 0) {
  const tr = lang === "tr";
  if (kind === "broken") return tr ? `Bütünlük zinciri bozuk${failedVersion ? ` · v${failedVersion}` : ""}` : `Integrity chain broken${failedVersion ? ` · v${failedVersion}` : ""}`;
  if (kind === "stale") return tr ? "Kanıt güncel değil veya süresi doldu" : "Evidence is stale or expired";
  if (kind === "review") return tr ? "İnceleme, doğrulama veya otomasyon değerlendirmesi gerekiyor" : "Review, validation or automation assessment is required";
  if (kind === "legacy") return tr ? "Versiyon zinciri doğrulanmamış" : "Version chain is unverified";
  if (kind === "unlinked") return tr ? "Kontrole bağlanmamış" : "Not linked to a control";
  if (kind === "owner") return tr ? "Kanıt sahibi atanmadı" : "Evidence owner is missing";
  return tr ? "Bütünlük doğrulaması kullanılamıyor" : "Integrity verification unavailable";
}

export default function EvidenceQualityLens({ state, lang }: { state: EvidenceRegisterAssessment; lang: Lang }) {
  const rows = useMemo(() => state.rows.filter(row => row.module === "Kanıtlar"), [state.rows]);
  const loading = state.loading, tr = lang === "tr";
  const lastUpdated = state.generatedAt ? new Date(state.generatedAt) : null;
  const quality = useMemo(() => {
    const evaluatedAt = state.generatedAt ? new Date(state.generatedAt) : new Date();
    let current = 0;
    let stale = 0;
    let broken = 0;
    let legacy = 0;
    let unlinked = 0;
    const issues: QualityIssue[] = [];

    for (const row of rows) {
      const title = text(row.data.evidenceTitle || row.id);
      const recordRef = text(row.data.evidenceId || row.id);
      const owner = text(row.data.owner);
      const controlRefs = [...new Set([...splitRefs(row.data.controlRefs), ...splitRefs(row.data.controlRef)])];
      const integrityState = { state: text(row.data.evidenceIntegrity), failedVersion: Number(row.data.evidenceIntegrityFailedVersion || 0) };
      const eligibility = evaluateEvidenceEligibility(row.data, evaluatedAt);
      const expired = eligibility.reasons.includes("expired") || eligibility.reasons.includes("rejected");
      if (eligibility.current) current += 1;
      if (expired) stale += 1;
      if (integrityState.state === "broken") broken += 1;
      if (integrityState.state === "legacy-unverified") legacy += 1;
      if (!controlRefs.length) unlinked += 1;

      const issueKinds: QualityIssue["kind"][] = [];
      if (integrityState.state === "broken") issueKinds.push("broken");
      if (expired) issueKinds.push("stale");
      if (!eligibility.current && !expired && !["broken", "unavailable"].includes(integrityState.state)) issueKinds.push("review");
      if (integrityState.state === "legacy-unverified") issueKinds.push("legacy");
      else if (integrityState.state === "unavailable") issueKinds.push("unknown");
      if (!controlRefs.length) issueKinds.push("unlinked");
      if (!owner) issueKinds.push("owner");

      for (const kind of issueKinds) {
        issues.push({ id: `${row.id}:${kind}`, recordRef, title, owner, controlRefs, kind, detail: formatIssue(kind, lang, integrityState.failedVersion) });
      }
    }

    const weight: Record<QualityIssue["kind"], number> = { broken: 0, stale: 1, unlinked: 2, owner: 3, legacy: 4, unknown: 5, review: 2 };
    issues.sort((a, b) => weight[a.kind] - weight[b.kind] || a.title.localeCompare(b.title, lang === "tr" ? "tr" : "en"));
    const total = rows.length;
    const health = total ? Math.round((current / total) * 100) : 100;
    return { total, current, stale, broken, legacy, unlinked, issues, health };
  }, [rows, state.generatedAt, lang]);

  return (
    <section className="evidence-quality-lens" aria-label={tr ? "Kanıt kalite görünümü" : "Evidence quality lens"}>
      <header>
        <div>
          <small>{tr ? "EVIDENCE QUALITY" : "EVIDENCE QUALITY"}</small>
          <h3>{tr ? "Kanıt tazeliği ve bütünlüğü" : "Evidence freshness and integrity"}</h3>
          <p>{tr ? "Denetim hazırlığı için kanıtın yalnız varlığını değil; güncelliğini, kontrol bağlantısını ve versiyon bütünlüğünü izler." : "Tracks not only evidence existence, but also freshness, control linkage and version integrity for audit readiness."}</p>
        </div>
        <div className="eql-health"><strong>{state.ready && quality.total ? `${quality.health}%` : "—"}</strong><span>{tr ? "güncel kanıt" : "current evidence"}</span></div>
      </header>

      {!state.ready && <p role="status">{loading ? (tr ? "Kanıtlar değerlendiriliyor…" : "Assessing evidence…") : (tr ? "Kanıt kaynağı doğrulanamadı; yeniden deneyin." : "Evidence source could not be verified; retry.")}</p>}
      <div className="eql-metrics">
        <article><small>{tr ? "Toplam" : "Total"}</small><strong>{state.ready ? quality.total : "—"}</strong><span>{tr ? "kanıt kaydı" : "evidence records"}</span></article>
        <article><small>{tr ? "Güncel" : "Current"}</small><strong>{state.ready ? quality.current : "—"}</strong><span>{tr ? "kullanıma hazır" : "ready to use"}</span></article>
        <article className={quality.stale ? "warning" : ""}><small>{tr ? "Bayat" : "Stale"}</small><strong>{state.ready ? quality.stale : "—"}</strong><span>{tr ? "yenilenmeli" : "needs refresh"}</span></article>
        <article className={quality.broken ? "danger" : ""}><small>{tr ? "Bütünlük hatası" : "Integrity failure"}</small><strong>{state.ready ? quality.broken : "—"}</strong><span>{tr ? "zincir bozuk" : "broken chain"}</span></article>
        <article className={quality.unlinked ? "warning" : ""}><small>{tr ? "Bağlantısız" : "Unlinked"}</small><strong>{state.ready ? quality.unlinked : "—"}</strong><span>{tr ? "kontrol referansı yok" : "no control reference"}</span></article>
      </div>

      {state.ready && quality.issues.length > 0 ? (
        <details className="eql-issues">
          <summary className="eql-issues-head"><div><small>{tr ? "ÖNCELİKLİ KALİTE SİNYALLERİ" : "PRIORITY QUALITY SIGNALS"}</small><b>{tr ? "Önce en yüksek güvence risklerini düzelt" : "Fix the highest assurance risks first"}</b></div><span>{quality.issues.length}</span></summary>
          <div className="eql-list">
            {quality.issues.slice(0, 6).map((issue) => (
              <button type="button" key={issue.id} className={`eql-issue ${issue.kind}`} onClick={() => navigateToFornost({ module: "Kanıtlar", ref: issue.recordRef, kind: "record", source: "evidence-quality", filter: { recordRef: issue.recordRef } })}>
                <i aria-hidden="true" />
                <div><b>{issue.title}</b><span>{issue.detail}</span><small>{issue.owner || (tr ? "Sahip yok" : "No owner")} · {issue.controlRefs.length ? issue.controlRefs.join(", ") : (tr ? "Kontrol bağlantısı yok" : "No control linkage")} · →</small></div>
              </button>
            ))}
          </div>
          {quality.issues.length > 6 && <small className="eql-more">+{quality.issues.length - 6} {tr ? "ek kalite sinyali" : "more quality signals"}</small>}
        </details>
      ) : state.ready && quality.total > 0 ? <div className="eql-complete">✓ {tr ? "Kanıt portföyünde açık kalite sinyali yok." : "No open quality signals in the evidence portfolio."}</div> : null}

      <footer><small>{lastUpdated ? `${tr ? "Son kontrol" : "Last check"}: ${lastUpdated.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</small><button type="button" disabled={loading} onClick={state.refresh}>{loading ? "…" : (tr ? "Yenile" : "Refresh")}</button></footer>
    </section>
  );
}
