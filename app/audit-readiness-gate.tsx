"use client";

import { auditEligibilityLabels, filterAuditRequirements, parseAuditReadinessResult, type AuditRequirementFilter } from "./audit-readiness-view";
import {assessmentStateText} from "./evidence/assessment-labels";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAuditEvidenceAssurance, type AssuranceRecord, type AuditEvidenceRequirementState } from "./audit-evidence-assurance";
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
  const [snapshot, setSnapshot] = useState<{ scope: string; result: AuditReadinessResult } | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [gapLimit, setGapLimit] = useState(8), [signalLimit, setSignalLimit] = useState(6);
  const [requirementFilter, setRequirementFilter] = useState<AuditRequirementFilter>("gaps"), [requirementQuery, setRequirementQuery] = useState("");
  const [signalFilter, setSignalFilter] = useState<"all" | "blockers">("all");
  const requirementsRef = useRef<HTMLDetailsElement>(null), signalsRef = useRef<HTMLDetailsElement>(null);
  const request = useRef<{ id: number; controller?: AbortController }>({ id: 0 });
  // Parent edits trigger a fresh authoritative evaluation; parent render frequency does not.
  const recordsKey = JSON.stringify(records?.map(row => [row.id, row.data]).sort(([a], [b]) => String(a).localeCompare(String(b))) || []);
  const scopeKey = JSON.stringify([auditName.trim(), recordsKey]);
  const load = useCallback(async () => {
    request.current.controller?.abort();
    const controller = new AbortController(), id = request.current.id + 1;
    request.current = { id, controller };
    setLoading(true); setLoadError(false); setSnapshot(null);
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(withBasePath(`/api/audits/readiness?auditName=${encodeURIComponent(auditName)}`), { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("readiness-unavailable");
      const data = parseAuditReadinessResult(await response.json(), auditName);
      if (!data) throw new Error("invalid-readiness");
      if (id === request.current.id) setSnapshot({ scope: scopeKey, result: data });
    } catch { if (id === request.current.id) setLoadError(true); }
    finally { window.clearTimeout(timeout); if (id === request.current.id) setLoading(false); }
  }, [auditName, scopeKey]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => { window.clearInterval(timer); request.current.id++; request.current.controller?.abort(); };
  }, [load, recordsKey]);

  const checking = loading || (!!snapshot && snapshot.scope !== scopeKey);
  const result = !checking && !loadError && snapshot?.scope === scopeKey ? snapshot.result : null;
  const reliable = !!result?.verified;
  const tr = lang === "tr", assurance = reliable ? result.evidence : emptyAssurance;
  const scopedPriorities = reliable ? result.signals : [], assuranceBlockers = scopedPriorities.filter(item => item.blocking);
  const visibleRequirements = filterAuditRequirements(assurance.requirements, requirementFilter, requirementQuery);
  const visibleSignals = signalFilter === "blockers" ? assuranceBlockers : scopedPriorities;
  const effectiveGate = checking ? "checking" : loadError || !result ? "unavailable" : result.gate;
  const canExport = reliable;
  const gateLabel = effectiveGate === "checking" ? (tr ? "KONTROL EDİLİYOR" : "CHECKING") : ["unavailable", "unverified"].includes(effectiveGate) ? (tr ? "DOĞRULANAMADI" : "UNVERIFIED") : effectiveGate === "ready" ? (tr ? "DENETİME HAZIR" : "AUDIT READY") : effectiveGate === "attention" ? (tr ? "GÖZDEN GEÇİR" : "REVIEW") : effectiveGate === "empty" ? (tr ? "KAPSAM BEKLİYOR" : "WAITING FOR SCOPE") : (tr ? "HAZIR DEĞİL" : "NOT READY");
  const headline = checking ? (tr ? "Denetim kapsamı kontrol ediliyor" : "Checking the audit scope") : ["unavailable", "unverified"].includes(effectiveGate) ? (tr ? "Denetim hazırlığı doğrulanamadı" : "Audit readiness could not be verified") : assuranceBlockers.length ? (tr ? `${assuranceBlockers.length} Continuous Assurance engeli çözülmeli` : `${assuranceBlockers.length} Continuous Assurance blockers must be resolved`) : effectiveGate === "ready" ? (tr ? "Kapsamdaki kanıt ve kontrol sinyalleri güncel" : "In-scope evidence and control signals are current") : effectiveGate === "empty" ? (tr ? "Önce denetim maddelerini kapsama alın" : "Add audit requirements to scope first") : tr ? `${assurance.gaps.length} kanıt boşluğu · ${scopedPriorities.length} güvence sinyali` : `${assurance.gaps.length} evidence gaps · ${scopedPriorities.length} assurance signals`;

  const requirementLabels: Record<AuditRequirementFilter, string> = { gaps: tr ? "Kanıt açıkları" : "Evidence gaps", current: tr ? "Güncel kanıtı olan" : "Current evidence", stale: tr ? "Yenileme / onay gereken" : "Refresh / approval needed", missing: tr ? "Kanıtı olmayan" : "Missing evidence", all: tr ? "Tüm maddeler" : "All requirements" };
  const expand = (element: HTMLDetailsElement | null) => { if (!element) return; element.open = true; element.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  const showRequirements = (filter: AuditRequirementFilter) => { if (!reliable) return; setRequirementFilter(filter); setRequirementQuery(""); setGapLimit(8); expand(requirementsRef.current); };
  const showSignals = () => { if (!reliable) return; setSignalFilter(assuranceBlockers.length ? "blockers" : "all"); setSignalLimit(6); expand(signalsRef.current); };
  const openRequirement = (row: AuditEvidenceRequirementState) => { if (reliable && row.requirementIds.length === 1) navigateToFornost({ module: "Denetim Yönetimi", kind: "record", ref: row.requirementIds[0], source: "audit-readiness-requirement" }); };
  const openGap = (reference: string, status: "current" | "stale" | "missing") => {
    if (!reliable) return;
    if (status === "missing") {navigateToFornost({ module: "Kontroller", ref: reference, kind: "control", source: "audit-readiness",filter:{controlRef:reference} });return;}
    navigateToFornost({module:"Kanıtlar",kind:"evidence",source:"audit-readiness",filter:{controlRef:reference}});
  };
  const openAssurancePriority=(priority:AssurancePriority)=>{
    if (!reliable) return;
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
    <section className={`audit-readiness-gate gate-${effectiveGate}`} aria-busy={checking} aria-label={tr ? "Denetim hazırlık kapısı" : "Audit readiness gate"}>
      <header className="audit-readiness-head"><div><small>AUDIT READINESS GATE</small><h3 title={headline}>{headline}</h3><p>{auditName ? `${tr ? "Kapsam" : "Scope"}: ${auditName}` : (tr ? "Denetim portföyündeki kanıt hazırlığını ve aynı kontrollere bağlı Continuous Assurance sinyallerini birlikte değerlendirir." : "Evaluates audit evidence readiness together with Continuous Assurance signals mapped to the same controls.")}</p></div><div className="audit-readiness-state"><span>{gateLabel}</span><strong>{canExport && assurance.total ? `${assurance.readiness}%` : "—"}</strong><small>{tr ? "kanıt hazırlığı" : "evidence readiness"}</small></div></header>

      <div className="audit-readiness-feedback" aria-live="polite">
      {checking && <p className="audit-readiness-scope-note">{tr ? "Güncel değerlendirme bekleniyor. Raporlar kontrol tamamlandığında açılır." : "Waiting for the current evaluation. Reports become available when the check completes."}</p>}
      {!checking && loadError && <div className="audit-readiness-notice" role="alert">{tr ? "Veriler yüklenemedi. Sonuç güncel kabul edilmez; yeniden deneyin." : "Data could not be loaded. The result is not current; retry the check."}</div>}
      {!checking && !loadError && !!result?.issues.length && <div className="audit-readiness-notice" role="alert"><ul>{result.issues.map(issue => <li key={issue}>{readinessIssueText[issue]?.[lang] || issue}</li>)}</ul></div>}
      {!checking && !loadError && !!result?.unmonitored.length && <p className="audit-readiness-scope-note">{tr ? `${result.unmonitored.length} madde için otomatik kontrol tanımlı değil; bu maddelerin hazırlığı onaylı kanıta dayanır.` : `${result.unmonitored.length} requirements have no automated control; their readiness relies on approved evidence.`}</p>}
      {!checking && !loadError && result && !result.issues.length && !result.unmonitored.length && <p className="audit-readiness-scope-note">{tr ? "Değerlendirme tamamlandı. Madde ve kontrol ayrıntılarını aşağıdan açabilirsiniz." : "Evaluation complete. Expand the requirement and control details below."}</p>}
      </div>
      <div className="audit-readiness-metrics">
        <button type="button" disabled={!reliable} onClick={() => showRequirements("current")}><small>{tr ? "Güncel" : "Current"}</small><strong>{reliable ? assurance.current : "—"}</strong><span>{tr ? "güncel kanıtı olan madde" : "requirements with current evidence"}</span></button>
        <button type="button" disabled={!reliable} className={assurance.stale ? "warning" : ""} onClick={() => showRequirements("stale")}><small>{tr ? "Yenileme / onay gerekli" : "Refresh / approval needed"}</small><strong>{reliable ? assurance.stale : "—"}</strong><span>{tr ? "kanıtı henüz uygun olmayan madde" : "requirements without eligible evidence"}</span></button>
        <button type="button" disabled={!reliable} className={assurance.missing.length ? "danger" : ""} onClick={() => showRequirements("missing")}><small>{tr ? "Kanıtsız" : "Missing"}</small><strong>{reliable ? assurance.missing.length : "—"}</strong><span>{tr ? "kanıt bekleyen madde" : "requirements awaiting evidence"}</span></button>
        <button type="button" disabled={!reliable} onClick={() => showRequirements("all")}><small>{tr ? "Bağlantı kapsamı" : "Link coverage"}</small><strong>{reliable && assurance.total ? `${assurance.coverage}%` : "—"}</strong><span>{tr ? "tüm kapsamı incele" : "review the full scope"}</span></button>
        <button type="button" disabled={!reliable} className={assuranceBlockers.length?"danger":scopedPriorities.length?"warning":""} onClick={showSignals}><small>Continuous Assurance</small><strong>{reliable ? assuranceBlockers.length : "—"}</strong><span>{reliable ? scopedPriorities.length : "—"} {tr?"kapsam sinyali":"scoped signals"}</span></button>
      </div>

      <details ref={requirementsRef} className="audit-readiness-gaps">
        <summary className="audit-readiness-gaps-head"><div><small>{tr ? "MADDE BAZINDA KANIT" : "EVIDENCE BY REQUIREMENT"}</small><b>{requirementLabels[requirementFilter]}</b></div><span>{reliable ? visibleRequirements.length : "—"}</span></summary>
        <div className="audit-readiness-toolbar">
          <label>{tr ? "Madde görünümü" : "Requirement view"}<select disabled={!reliable} value={requirementFilter} onChange={event => { setRequirementFilter(event.target.value as AuditRequirementFilter); setGapLimit(8); }}>{Object.entries(requirementLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>{tr ? "Maddelerde ara" : "Search requirements"}<input disabled={!reliable} type="search" value={requirementQuery} onChange={event => { setRequirementQuery(event.target.value); setGapLimit(8); }} placeholder={tr ? "Referans, başlık veya sorumlu" : "Reference, title or owner"}/></label>
        </div>
        <p className="audit-readiness-scope-note">{tr ? "Liste filtreleri indirilen raporun kapsamını değiştirmez; rapor tüm değerlendirmeyi içerir." : "List filters do not change the downloaded report scope; the report includes the full evaluation."}</p>
        {!visibleRequirements.length && <p className="audit-readiness-scope-note">{checking ? (tr ? "Kontrol ediliyor…" : "Checking…") : !reliable ? (tr ? "Güncel değerlendirme doğrulanmadan maddeler gösterilmez." : "Requirements remain hidden until the current evaluation is verified.") : requirementFilter === "gaps" && !requirementQuery && assurance.total > 0 ? (tr ? "Tüm kapsamdaki maddelerin güncel, onaylı kanıtı var." : "Every in-scope requirement has current approved evidence.") : (tr ? "Bu görünümde eşleşen madde yok." : "No requirements match this view.")}</p>}
        <div className="audit-readiness-list">{visibleRequirements.slice(0, gapLimit).map(gap => <article key={gap.reference} className={`audit-readiness-gap ${gap.status}`}>
          <i aria-hidden="true"/><div className="audit-readiness-gap-copy"><b>{gap.reference}</b><span>{gap.title || (tr ? "Denetim maddesi" : "Audit requirement")}</span><small>{gap.owner || (tr ? "Sahip atanmadı" : "Owner unassigned")} · {gap.dueDate ? formatDate(gap.dueDate, lang) : (tr ? "Termin yok" : "No due date")}</small>
            {gap.status === "current" && <small>{tr ? "Güncel kanıt mevcut." : "Current evidence is available."}</small>}
            {gap.status === "missing" && <small>{tr ? "Bu referansa bağlı kanıt yok." : "No evidence is linked to this reference."}</small>}
            {gap.status === "current" && (gap.eligibilityIssues.length > 0 || gap.assessmentIssues.length > 0) && <small>{tr ? "Diğer bağlı kanıtlarda:" : "In other linked evidence:"}</small>}
            {gap.eligibilityIssues.map(reason => <small key={reason}>{auditEligibilityLabels[reason]?.[lang] || reason}</small>)}
            {gap.assessmentIssues.map(reason => <small key={reason}>{assessmentStateText[reason]?.[lang] || reason}</small>)}
          </div><div className="audit-readiness-gap-state">
            <button type="button" onClick={() => openGap(gap.reference, gap.status)}>{gap.status === "missing" ? (tr ? "Kontrol / kanıt aç" : "Open control / evidence") : (tr ? "Kanıtları incele" : "Review evidence")}</button>
            {gap.requirementIds.length === 1 ? <button type="button" onClick={() => openRequirement(gap)}>{tr ? "Maddeyi aç" : "Open requirement"}</button> : <small>{gap.requirementIds.length} {tr ? "kaynak madde aynı referansı paylaşıyor" : "source requirements share this reference"}</small>}
            <small>{gap.currentEvidence}/{gap.linkedEvidence} {tr ? "güncel kanıt" : "current evidence"}</small>
          </div>
        </article>)}</div>
        {visibleRequirements.length > gapLimit && <div className="audit-readiness-more"><button type="button" onClick={() => setGapLimit(value => value + 20)}>{requirementFilter === "gaps" ? (tr ? "Daha fazla boşluk göster" : "Show more gaps") : (tr ? "Daha fazla madde göster" : "Show more requirements")} ({Math.min(gapLimit,visibleRequirements.length)} / {visibleRequirements.length})</button></div>}
      </details>

      <details ref={signalsRef} className="audit-readiness-assurance"><summary className="audit-readiness-gaps-head"><b>{tr?"Kontrol sinyallerini incele":"Review control signals"}</b><span>{reliable ? scopedPriorities.length : "—"}</span></summary>
        <div className="audit-readiness-signal-filters">{(["all","blockers"] as const).map(filter => <button type="button" key={filter} disabled={!reliable} aria-pressed={signalFilter === filter} onClick={() => { setSignalFilter(filter); setSignalLimit(6); }}>{filter === "all" ? (tr ? "Tüm sinyaller" : "All signals") : (tr ? "Yalnız engeller" : "Blockers only")}</button>)}</div>
        {!visibleSignals.length && <p className="audit-readiness-scope-note">{checking ? (tr ? "Kontrol ediliyor…" : "Checking…") : !reliable ? (tr ? "Güncel değerlendirme doğrulanmadan sinyaller gösterilmez." : "Signals remain hidden until the current evaluation is verified.") : (tr ? "Bu görünümde kontrol sinyali yok." : "No control signals match this view.")}</p>}
        <div className="audit-readiness-list">{visibleSignals.slice(0,signalLimit).map(priority=><button type="button" key={priority.id} className={`audit-readiness-gap ${priority.blocking?"assurance-blocker":"assurance-attention"}`} onClick={()=>openAssurancePriority(priority)}><i aria-hidden="true"/><div className="audit-readiness-gap-copy"><b>{priority.targetControlRef||priority.ruleId}</b><span>{priority.title}</span><small>{assessmentStateText[priority.reason]?.[lang]||`${priority.state} · ${priority.reason}`}{priority.owner?` · ${priority.owner}`:""}</small></div><div className="audit-readiness-gap-state"><strong>{priority.blocking?(tr?"Engeli incele":"Review blocker"):(tr?"Sinyali incele":"Review signal")}</strong><small>{tr?"Canlı kayda git":"Open live record"} · →</small></div></button>)}</div>
        {visibleSignals.length>signalLimit&&<div className="audit-readiness-more"><button type="button" onClick={()=>setSignalLimit(value=>value+20)}>{tr?"Daha fazla sinyal göster":"Show more signals"} ({signalLimit} / {visibleSignals.length})</button></div>}
      </details>

      <footer className="audit-readiness-actions"><div><small>{!result && (tr ? "Değerlendirme zamanı: —" : "Evaluated at: —")}{result && <>{tr ? "Değerlendirme zamanı" : "Evaluated at"}: <time dateTime={result.generatedAt}>{new Date(result.generatedAt).toLocaleString(tr ? "tr-TR" : "en-GB")}</time></>}</small></div><div><button type="button" className="secondary" disabled={!canExport} onClick={()=>exportSnapshot("html")}>{tr?"HTML Özeti":"HTML Snapshot"}</button><button type="button" className="secondary" disabled={!canExport} onClick={()=>exportSnapshot("csv")}>CSV</button><button type="button" className="secondary" onClick={() => navigateToFornost("Kontroller")}>{tr ? "Kontroller" : "Controls"}</button><button type="button" className="secondary" onClick={() => navigateToFornost("Bulgular ve CAPA")}>{tr ? "Bulgular / CAPA" : "Findings / CAPA"}</button><button type="button" className="secondary" onClick={()=>navigateToFornost("Kanıt Otomasyonu")}>Continuous Assurance</button><button type="button" onClick={() => navigateToFornost("Kanıtlar")}>{tr ? "Kanıtları Tamamla" : "Complete Evidence"}</button><button type="button" className="refresh" aria-label={tr ? "Hazırlığı yeniden kontrol et" : "Recheck readiness"} disabled={checking} onClick={() => void load()}>{checking ? "…" : "↻"}</button></div></footer>
    </section>
  );
}
