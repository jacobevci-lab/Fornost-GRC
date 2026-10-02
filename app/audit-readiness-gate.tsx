"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAuditEvidenceAssurance, type AssuranceRecord } from "./audit-evidence-assurance";
import { readinessIssueText, type AuditReadinessResult } from "./audit-readiness";
import { downloadAuditReadinessReport } from "./audit-readiness-export";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./audit-readiness-gate.css";

type Lang = "tr" | "en";
type Row = AssuranceRecord & { module: string; code?: string };
type AssurancePriority = AuditReadinessResult["signals"][number];
const emptyAssurance = buildAuditEvidenceAssurance([], []);

function formatDate(value: string, lang: Lang) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default function AuditReadinessGate({lang, auditName = "", records}: {lang: Lang; auditName?: string; records?: Row[]}) {
  const [result, setResult] = useState<AuditReadinessResult | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [gapLimit, setGapLimit] = useState(8), [signalLimit, setSignalLimit] = useState(6);
  const request = useRef<{ id: number; controller?: AbortController }>({ id: 0 });
  // Parent edits trigger a fresh authoritative evaluation; parent render frequency does not.
  const recordsKey = JSON.stringify(records?.map(row => [row.id, row.data]).sort(([a], [b]) => String(a).localeCompare(String(b))) || []);
  const load = useCallback(async () => {
    request.current.controller?.abort();
    const controller = new AbortController(), id = request.current.id + 1;
    request.current = { id, controller };
    setLoading(true); setLoadError(false);
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(withBasePath(`/api/audits/readiness?auditName=${encodeURIComponent(auditName)}`), { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("readiness-unavailable");
      const data = await response.json() as AuditReadinessResult;
      if (!data.evidence || !Array.isArray(data.signals) || !Array.isArray(data.issues) || typeof data.verified !== "boolean" || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error("invalid-readiness");
      if (id === request.current.id) setResult(data);
    } catch { if (id === request.current.id) setLoadError(true); }
    finally { window.clearTimeout(timeout); if (id === request.current.id) setLoading(false); }
  }, [auditName]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => { window.clearInterval(timer); request.current.id++; request.current.controller?.abort(); };
  }, [load, recordsKey]);

  const tr = lang === "tr", assurance = result?.evidence || emptyAssurance;
  const scopedPriorities = result?.signals || [], assuranceBlockers = scopedPriorities.filter(item => item.blocking);
  const effectiveGate = loading ? "checking" : loadError || !result ? "unavailable" : result.gate;
  const canExport = !!result?.verified && !loading && !loadError;
  const gateLabel = effectiveGate === "checking" ? (tr ? "KONTROL EDİLİYOR" : "CHECKING") : ["unavailable", "unverified"].includes(effectiveGate) ? (tr ? "DOĞRULANAMADI" : "UNVERIFIED") : effectiveGate === "ready" ? (tr ? "DENETİME HAZIR" : "AUDIT READY") : effectiveGate === "attention" ? (tr ? "GÖZDEN GEÇİR" : "REVIEW") : effectiveGate === "empty" ? (tr ? "KAPSAM BEKLİYOR" : "WAITING FOR SCOPE") : (tr ? "HAZIR DEĞİL" : "NOT READY");
  const headline = loading ? (tr ? "Denetim kapsamı kontrol ediliyor" : "Checking the audit scope") : ["unavailable", "unverified"].includes(effectiveGate) ? (tr ? "Denetim hazırlığı doğrulanamadı" : "Audit readiness could not be verified") : assuranceBlockers.length ? (tr ? `${assuranceBlockers.length} Continuous Assurance engeli çözülmeli` : `${assuranceBlockers.length} Continuous Assurance blockers must be resolved`) : effectiveGate === "ready" ? (tr ? "Kapsamdaki kanıt ve kontrol sinyalleri güncel" : "In-scope evidence and control signals are current") : effectiveGate === "empty" ? (tr ? "Önce denetim maddelerini kapsama alın" : "Add audit requirements to scope first") : tr ? `${assurance.gaps.length} kanıt boşluğu · ${scopedPriorities.length} güvence sinyali` : `${assurance.gaps.length} evidence gaps · ${scopedPriorities.length} assurance signals`;

  const openGap = (reference: string, status: "current" | "stale" | "missing") => {
    if (status === "missing") {navigateToFornost({ module: "Kontroller", ref: reference, kind: "control", source: "audit-readiness",filter:{controlRef:reference} });return;}
    navigateToFornost({module:"Kanıtlar",kind:"evidence",source:"audit-readiness",filter:{controlRef:reference}});
  };
  const openAssurancePriority=(priority:AssurancePriority)=>{
    if(priority.kind==="finding"&&priority.findingId){navigateToFornost({module:"Kanıt Otomasyonu",ref:priority.findingId,source:"audit-readiness-assurance",filter:{findingRef:priority.findingId}});return}
    if(priority.ruleId){navigateToFornost({module:"Kanıt Otomasyonu",ref:priority.ruleId,source:"audit-readiness-assurance",filter:{ruleRef:priority.ruleId}});return}
    if(priority.targetControlRef)navigateToFornost({module:"Kontroller",ref:priority.targetControlRef,source:"audit-readiness-assurance",filter:{controlRef:priority.targetControlRef}});
  };
  const exportSnapshot = (format: "html" | "csv") => {
    if (!canExport || !result) return;
    downloadAuditReadinessReport({
      auditName: auditName || (tr ? "Denetim Portföyü" : "Audit Portfolio"), generatedAt: result.generatedAt, gateLabel, lang, unmonitoredControls: result.unmonitored,
      readiness: assurance.total ? assurance.readiness : null, coverage: assurance.total ? assurance.coverage : null,
      total: assurance.total, current: assurance.current, stale: assurance.stale, missing: assurance.missing.length,
      requirements: assurance.requirements,
      assuranceSignals: scopedPriorities.map(item => ({ id: item.id, state: item.state, title: item.title, targetControlRef: item.targetControlRefs?.join(", ") || item.targetControlRef, owner: item.owner, dueDate: item.dueDate, reason: item.reason, blocking: item.blocking })),
    }, format);
  };

  return (
    <section className={`audit-readiness-gate gate-${effectiveGate}`} aria-label={tr ? "Denetim hazırlık kapısı" : "Audit readiness gate"}>
      <header className="audit-readiness-head"><div><small>AUDIT READINESS GATE</small><h3>{headline}</h3><p>{auditName ? `${tr ? "Kapsam" : "Scope"}: ${auditName}` : (tr ? "Denetim portföyündeki kanıt hazırlığını ve aynı kontrollere bağlı Continuous Assurance sinyallerini birlikte değerlendirir." : "Evaluates audit evidence readiness together with Continuous Assurance signals mapped to the same controls.")}</p></div><div className="audit-readiness-state"><span>{gateLabel}</span><strong>{canExport && assurance.total ? `${assurance.readiness}%` : "—"}</strong><small>{tr ? "kanıt hazırlığı" : "evidence readiness"}</small></div></header>

      {loadError && <div className="audit-readiness-notice" role="alert">{tr ? "Veriler yüklenemedi. Sonuç güncel kabul edilmez; yeniden deneyin." : "Data could not be loaded. The result is not current; retry the check."}</div>}
      {!loading && !loadError && !!result?.issues.length && <div className="audit-readiness-notice" role="alert"><ul>{result.issues.map(issue => <li key={issue}>{readinessIssueText[issue]?.[lang] || issue}</li>)}</ul></div>}
      {!loading && !loadError && !!result?.unmonitored.length && <p className="audit-readiness-scope-note">{tr ? `${result.unmonitored.length} madde için otomatik kontrol tanımlı değil; bu maddelerin hazırlığı onaylı kanıta dayanır.` : `${result.unmonitored.length} requirements have no automated control; their readiness relies on approved evidence.`}</p>}
      <div className="audit-readiness-metrics">
        <button type="button" onClick={() => navigateToFornost("Kanıtlar")}><small>{tr ? "Güncel" : "Current"}</small><strong>{assurance.current}</strong><span>{tr ? "onaylı kanıt" : "approved evidence"}</span></button>
        <button type="button" className={assurance.stale ? "warning" : ""} onClick={() => navigateToFornost("Kanıtlar")}><small>{tr ? "Bayat / süresi dolan" : "Stale / expired"}</small><strong>{assurance.stale}</strong><span>{tr ? "yenilenmeli" : "needs refresh"}</span></button>
        <button type="button" className={assurance.missing.length ? "danger" : ""} onClick={() => navigateToFornost("Kanıtlar")}><small>{tr ? "Kanıtsız" : "Missing"}</small><strong>{assurance.missing.length}</strong><span>{tr ? "kanıt bekliyor" : "needs evidence"}</span></button>
        <article><small>{tr ? "Bağlantı kapsamı" : "Link coverage"}</small><strong>{assurance.total ? `${assurance.coverage}%` : "—"}</strong><span>{tr ? "en az bir kanıt bağlı" : "at least one evidence linked"}</span></article>
        <button type="button" className={assuranceBlockers.length?"danger":scopedPriorities.length?"warning":""} onClick={()=>navigateToFornost("Kanıt Otomasyonu")}><small>Continuous Assurance</small><strong>{assuranceBlockers.length}</strong><span>{scopedPriorities.length} {tr?"kapsam sinyali":"scoped signals"}</span></button>
      </div>

      {assurance.gaps.length > 0 ? <details className="audit-readiness-gaps"><summary className="audit-readiness-gaps-head"><div><small>{tr ? "ÖNCELİKLİ KANIT BOŞLUKLARI" : "PRIORITY EVIDENCE GAPS"}</small><b>{tr ? "Sadece aksiyon gerektiren maddeler" : "Only requirements that need action"}</b></div><span>{assurance.gaps.length}</span></summary><div className="audit-readiness-list">{assurance.gaps.slice(0, gapLimit).map((gap) => <button type="button" key={gap.reference} className={`audit-readiness-gap ${gap.status}`} onClick={() => openGap(gap.reference, gap.status)}><i aria-hidden="true"/><div className="audit-readiness-gap-copy"><b>{gap.reference}</b><span>{gap.title || (tr ? "Denetim maddesi" : "Audit requirement")}</span><small>{gap.owner || (tr ? "Sahip atanmadı" : "Owner unassigned")} · {gap.dueDate ? formatDate(gap.dueDate, lang) : (tr ? "Termin yok" : "No due date")}</small></div><div className="audit-readiness-gap-state"><strong>{gap.status === "missing" ? (tr ? "Kontrol / kanıt aç" : "Open control / evidence") : (tr ? "Kanıtı yenile" : "Refresh evidence")}</strong><small>{gap.linkedEvidence} {tr ? "bağlı" : "linked"} · →</small></div></button>)}</div>{assurance.gaps.length > gapLimit && <div className="audit-readiness-more"><button type="button" onClick={() => setGapLimit(value => value + 20)}>{tr ? "Daha fazla boşluk göster" : "Show more gaps"} ({gapLimit} / {assurance.gaps.length})</button></div>}</details> : canExport && assurance.total > 0 && !assuranceBlockers.length ? <div className="audit-readiness-complete"><b>✓ {tr ? "Tüm kapsamdaki maddelerin güncel, onaylı kanıtı var." : "Every in-scope requirement has current approved evidence."}</b></div> : null}

      {scopedPriorities.length>0&&<details className="audit-readiness-assurance"><summary className="audit-readiness-gaps-head"><b>{tr?"Kontrol sinyallerini incele":"Review control signals"}</b><span>{scopedPriorities.length}</span></summary><div className="audit-readiness-gaps-head"><div><small>CONTINUOUS ASSURANCE</small><b>{tr?"Denetim kapsamındaki kontrollerin canlı güvence sinyalleri":"Live assurance signals for in-scope controls"}</b></div><span>{scopedPriorities.length}</span></div><div className="audit-readiness-list">{scopedPriorities.slice(0,signalLimit).map(priority=><button type="button" key={priority.id} className={`audit-readiness-gap ${priority.blocking?"assurance-blocker":"assurance-attention"}`} onClick={()=>openAssurancePriority(priority)}><i aria-hidden="true"/><div className="audit-readiness-gap-copy"><b>{priority.targetControlRef||priority.ruleId}</b><span>{priority.title}</span><small>{priority.state} · {priority.reason}{priority.owner?` · ${priority.owner}`:""}</small></div><div className="audit-readiness-gap-state"><strong>{priority.blocking?(tr?"Engeli incele":"Review blocker"):(tr?"Sinyali incele":"Review signal")}</strong><small>{tr?"Canlı kayda git":"Open live record"} · →</small></div></button>)}</div>{scopedPriorities.length>signalLimit&&<div className="audit-readiness-more"><button type="button" onClick={()=>setSignalLimit(value=>value+20)}>{tr?"Daha fazla sinyal göster":"Show more signals"} ({signalLimit} / {scopedPriorities.length})</button></div>}</details>}

      <footer className="audit-readiness-actions"><div><small>{result ? `${tr ? "Değerlendirme zamanı" : "Evaluated at"}: ${new Date(result.generatedAt).toLocaleString(tr ? "tr-TR" : "en-GB")}` : ""}</small></div><div><button type="button" className="secondary" disabled={!canExport} onClick={()=>exportSnapshot("html")}>{tr?"HTML Özeti":"HTML Snapshot"}</button><button type="button" className="secondary" disabled={!canExport} onClick={()=>exportSnapshot("csv")}>CSV</button><button type="button" className="secondary" onClick={() => navigateToFornost("Kontroller")}>{tr ? "Kontroller" : "Controls"}</button><button type="button" className="secondary" onClick={() => navigateToFornost("Bulgular ve CAPA")}>{tr ? "Bulgular / CAPA" : "Findings / CAPA"}</button><button type="button" className="secondary" onClick={()=>navigateToFornost("Kanıt Otomasyonu")}>Continuous Assurance</button><button type="button" onClick={() => navigateToFornost("Kanıtlar")}>{tr ? "Kanıtları Tamamla" : "Complete Evidence"}</button><button type="button" className="refresh" aria-label={tr ? "Hazırlığı yeniden kontrol et" : "Recheck readiness"} disabled={loading} onClick={() => void load()}>{loading ? "…" : "↻"}</button></div></footer>
    </section>
  );
}