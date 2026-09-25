"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildAuditEvidenceAssurance, type AssuranceRecord } from "./audit-evidence-assurance";
import { withBasePath } from "./base-path";
import { navigateToFornost } from "./navigation-focus";
import "./audit-readiness-gate.css";

type Lang = "tr" | "en";
type RawRow = {id?:unknown;code?:unknown;recordCode?:unknown;record_code?:unknown;module?:unknown;data?:unknown;data_json?:unknown};
type Row = AssuranceRecord & { module: string; code?: string };
type AssurancePriority={id:string;kind:"control"|"finding"|"work-item";state:string;title:string;ruleId:string;findingId:string;targetControlRef:string;owner:string;dueDate:string;reason:string;priority:number};
type AssuranceDashboard={summary?:{failing?:number;integrityFailures?:number;failedRetest?:number;openFindings?:number};priorities?:AssurancePriority[]};

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).normalize("NFKC").toLocaleLowerCase("tr-TR");
const blockingStates=new Set(["integrity-failed","failing","failed-retest","retest-error","overdue-remediation"]);
const blockingReasons=new Set(["evidence-integrity-failed","control-failing","failed-retest","retest-error","remediation-overdue"]);

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function normalizeRows(body: unknown): Row[] {
  if (!body || typeof body !== "object") return [];
  const source = Array.isArray((body as { rows?: unknown }).rows) ? (body as { rows: RawRow[] }).rows : [];
  return source.map((raw, index) => {
    let data: Record<string, unknown> = {};
    if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) data = raw.data as Record<string, unknown>;
    else if (typeof raw.data_json === "string") {
      try {const parsed = JSON.parse(raw.data_json);if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;} catch {}
    }
    return {id:text(raw.id)||`audit-readiness-${index}`,code:text(raw.code||raw.recordCode||raw.record_code)||undefined,module:text(raw.module),data};
  }).filter((row) => row.module);
}

function activeAuditName() {
  const detail = document.querySelector<HTMLElement>(".audit-detail-head");
  if (!detail || detail.getClientRects().length === 0) return "";
  return text(detail.querySelector("h1,h2,h3")?.textContent);
}

function formatDate(value: string, lang: Lang) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function priorityBlocksAudit(priority:AssurancePriority){return blockingStates.has(normalized(priority.state))||blockingReasons.has(normalized(priority.reason))}

export default function AuditReadinessGate() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [rows, setRows] = useState<Row[]>([]);
  const [assuranceDashboard,setAssuranceDashboard]=useState<AssuranceDashboard>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [auditName, setAuditName] = useState("");

  useEffect(() => {
    const discover = () => {
      setLang(currentLanguage());
      setAuditName(activeAuditName());
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(".audit-evidence-assurance"));
      const visible = candidates.find((candidate) => candidate.getClientRects().length > 0) || null;
      setTarget((current) => current === visible ? current : visible);
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    const onClick = () => window.setTimeout(discover, 0);
    document.addEventListener("click", onClick);
    return () => {observer.disconnect();document.removeEventListener("click", onClick);};
  }, []);

  useEffect(() => {
    if (!target) {setMount(null);return;}
    target.classList.add("audit-readiness-legacy-hidden");
    const created = document.createElement("div");
    created.className = "audit-readiness-gate-mount";
    target.insertAdjacentElement("afterend", created);
    setMount(created);
    return () => {target.classList.remove("audit-readiness-legacy-hidden");created.remove();setMount(null);};
  }, [target]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grcResult,assuranceResult]=await Promise.allSettled([
        fetch(withBasePath("/api/grc"), { cache: "no-store" }),
        fetch(withBasePath("/api/continuous-assurance/dashboard"), { cache: "no-store" }),
      ]);
      if(grcResult.status==="fulfilled"&&grcResult.value.ok)setRows(normalizeRows(await grcResult.value.json()));
      if(assuranceResult.status==="fulfilled"&&assuranceResult.value.ok)setAssuranceDashboard(await assuranceResult.value.json());
      setLastUpdated(new Date());
    } finally {setLoading(false);}
  }, []);

  useEffect(() => {
    if (!mount) return;
    void load();
    const timer = window.setInterval(() => void load(), 300_000);
    return () => window.clearInterval(timer);
  }, [mount, load]);

  const assurance = useMemo(() => {
    const allAuditRows = rows.filter((row) => row.module === "Denetim Yönetimi");
    const auditRows = auditName ? allAuditRows.filter((row) => normalized(row.data.auditName) === normalized(auditName)) : allAuditRows;
    const evidence = rows.filter((row) => row.module === "Kanıtlar");
    return buildAuditEvidenceAssurance(auditRows, evidence);
  }, [rows, auditName]);
  const scopedPriorities=useMemo(()=>{
    const refs=new Set(assurance.requirements.map(item=>normalized(item.reference)).filter(Boolean));
    if(!refs.size)return[];
    return (assuranceDashboard.priorities||[]).filter(item=>refs.has(normalized(item.targetControlRef)));
  },[assurance.requirements,assuranceDashboard.priorities]);
  const assuranceBlockers=useMemo(()=>scopedPriorities.filter(priorityBlocksAudit),[scopedPriorities]);
  const effectiveGate=assurance.gate!=="empty"&&assuranceBlockers.length?"not-ready":assurance.gate==="ready"&&scopedPriorities.length?"attention":assurance.gate;

  if (!mount) return null;
  const tr = lang === "tr";
  const gateLabel = effectiveGate === "ready" ? (tr ? "DENETİME HAZIR" : "AUDIT READY") : effectiveGate === "attention" ? (tr ? "GÖZDEN GEÇİR" : "REVIEW") : effectiveGate === "empty" ? (tr ? "KAPSAM BEKLİYOR" : "WAITING FOR SCOPE") : (tr ? "HAZIR DEĞİL" : "NOT READY");
  const headline = assuranceBlockers.length ? (tr?`${assuranceBlockers.length} Continuous Assurance engeli çözülmeli`:`${assuranceBlockers.length} Continuous Assurance blockers must be resolved`) : effectiveGate === "ready" ? (tr ? "Kanıt zinciri ve sürekli güvence hazır" : "Evidence chain and continuous assurance are ready") : effectiveGate === "empty" ? (tr ? "Önce denetim maddelerini kapsama alın" : "Add audit requirements to scope first") : tr ? `${assurance.gaps.length} madde denetim öncesi aksiyon istiyor` : `${assurance.gaps.length} requirements need action before audit`;

  const openGap = (reference: string, status: "current" | "stale" | "missing") => {
    if (status === "missing") {navigateToFornost({ module: "Kontroller", ref: reference, kind: "control", source: "audit-readiness",filter:{controlRef:reference} });return;}
    navigateToFornost({module:"Kanıtlar",kind:"evidence",source:"audit-readiness",filter:{controlRef:reference}});
  };
  const openAssurancePriority=(priority:AssurancePriority)=>{
    if(priority.kind==="finding"&&priority.findingId){navigateToFornost({module:"Kanıt Otomasyonu",ref:priority.findingId,source:"audit-readiness-assurance",filter:{findingRef:priority.findingId}});return}
    if(priority.ruleId){navigateToFornost({module:"Kanıt Otomasyonu",ref:priority.ruleId,source:"audit-readiness-assurance",filter:{ruleRef:priority.ruleId}});return}
    if(priority.targetControlRef)navigateToFornost({module:"Kontroller",ref:priority.targetControlRef,source:"audit-readiness-assurance",filter:{controlRef:priority.targetControlRef}});
  };

  return createPortal(
    <section className={`audit-readiness-gate ${effectiveGate}`} aria-label={tr ? "Denetim hazırlık kapısı" : "Audit readiness gate"}>
      <header className="audit-readiness-head"><div><small>AUDIT READINESS GATE</small><h3>{headline}</h3><p>{auditName ? `${tr ? "Kapsam" : "Scope"}: ${auditName}` : (tr ? "Denetim portföyündeki kanıt hazırlığını ve aynı kontrollere bağlı Continuous Assurance sinyallerini birlikte değerlendirir." : "Evaluates audit evidence readiness together with Continuous Assurance signals mapped to the same controls.")}</p></div><div className="audit-readiness-state"><span>{gateLabel}</span><strong>{assurance.total ? `${assurance.readiness}%` : "—"}</strong><small>{tr ? "kanıt hazırlığı" : "evidence readiness"}</small></div></header>

      <div className="audit-readiness-metrics">
        <button type="button" onClick={() => navigateToFornost("Kanıtlar")}><small>{tr ? "Güncel" : "Current"}</small><strong>{assurance.current}</strong><span>{tr ? "onaylı kanıt" : "approved evidence"}</span></button>
        <button type="button" className={assurance.stale ? "warning" : ""} onClick={() => navigateToFornost("Kanıtlar")}><small>{tr ? "Bayat / süresi dolan" : "Stale / expired"}</small><strong>{assurance.stale}</strong><span>{tr ? "yenilenmeli" : "needs refresh"}</span></button>
        <button type="button" className={assurance.missing.length ? "danger" : ""} onClick={() => navigateToFornost("Kanıtlar")}><small>{tr ? "Kanıtsız" : "Missing"}</small><strong>{assurance.missing.length}</strong><span>{tr ? "kanıt bekliyor" : "needs evidence"}</span></button>
        <article><small>{tr ? "Bağlantı kapsamı" : "Link coverage"}</small><strong>{assurance.total ? `${assurance.coverage}%` : "—"}</strong><span>{tr ? "en az bir kanıt bağlı" : "at least one evidence linked"}</span></article>
        <button type="button" className={assuranceBlockers.length?"danger":scopedPriorities.length?"warning":""} onClick={()=>navigateToFornost("Kanıt Otomasyonu")}><small>Continuous Assurance</small><strong>{assuranceBlockers.length}</strong><span>{scopedPriorities.length} {tr?"kapsam sinyali":"scoped signals"}</span></button>
      </div>

      {assurance.gaps.length > 0 ? <div className="audit-readiness-gaps"><div className="audit-readiness-gaps-head"><div><small>{tr ? "ÖNCELİKLİ KANIT BOŞLUKLARI" : "PRIORITY EVIDENCE GAPS"}</small><b>{tr ? "Sadece aksiyon gerektiren maddeler" : "Only requirements that need action"}</b></div><span>{assurance.gaps.length}</span></div><div className="audit-readiness-list">{assurance.gaps.slice(0, 8).map((gap) => <button type="button" key={gap.reference} className={`audit-readiness-gap ${gap.status}`} onClick={() => openGap(gap.reference, gap.status)}><i aria-hidden="true"/><div className="audit-readiness-gap-copy"><b>{gap.reference}</b><span>{gap.title || (tr ? "Denetim maddesi" : "Audit requirement")}</span><small>{gap.owner || (tr ? "Sahip atanmadı" : "Owner unassigned")} · {gap.dueDate ? formatDate(gap.dueDate, lang) : (tr ? "Termin yok" : "No due date")}</small></div><div className="audit-readiness-gap-state"><strong>{gap.status === "missing" ? (tr ? "Kontrol / kanıt aç" : "Open control / evidence") : (tr ? "Kanıtı yenile" : "Refresh evidence")}</strong><small>{gap.linkedEvidence} {tr ? "bağlı" : "linked"} · →</small></div></button>)}</div>{assurance.gaps.length > 8 && <div className="audit-readiness-more">+{assurance.gaps.length - 8} {tr ? "ek boşluk" : "more gaps"}</div>}</div> : assurance.total > 0 && !assuranceBlockers.length ? <div className="audit-readiness-complete"><b>✓ {tr ? "Tüm kapsamdaki maddelerin güncel, onaylı kanıtı var." : "Every in-scope requirement has current approved evidence."}</b></div> : null}

      {scopedPriorities.length>0&&<div className="audit-readiness-assurance"><div className="audit-readiness-gaps-head"><div><small>CONTINUOUS ASSURANCE</small><b>{tr?"Denetim kapsamındaki kontrollerin canlı güvence sinyalleri":"Live assurance signals for in-scope controls"}</b></div><span>{scopedPriorities.length}</span></div><div className="audit-readiness-list">{scopedPriorities.slice(0,6).map(priority=><button type="button" key={priority.id} className={`audit-readiness-gap ${priorityBlocksAudit(priority)?"assurance-blocker":"assurance-attention"}`} onClick={()=>openAssurancePriority(priority)}><i aria-hidden="true"/><div className="audit-readiness-gap-copy"><b>{priority.targetControlRef||priority.ruleId}</b><span>{priority.title}</span><small>{priority.state} · {priority.reason}{priority.owner?` · ${priority.owner}`:""}</small></div><div className="audit-readiness-gap-state"><strong>{priorityBlocksAudit(priority)?(tr?"Engeli incele":"Review blocker"):(tr?"Sinyali incele":"Review signal")}</strong><small>{tr?"Canlı kayda git":"Open live record"} · →</small></div></button>)}</div></div>}

      <footer className="audit-readiness-actions"><div><small>{lastUpdated ? `${tr ? "Son kontrol" : "Last check"}: ${lastUpdated.toLocaleTimeString(tr ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</small></div><div><button type="button" className="secondary" onClick={() => navigateToFornost("Kontroller")}>{tr ? "Kontroller" : "Controls"}</button><button type="button" className="secondary" onClick={() => navigateToFornost("Bulgular ve CAPA")}>{tr ? "Bulgular / CAPA" : "Findings / CAPA"}</button><button type="button" className="secondary" onClick={()=>navigateToFornost("Kanıt Otomasyonu")}>Continuous Assurance</button><button type="button" onClick={() => navigateToFornost("Kanıtlar")}>{tr ? "Kanıtları Tamamla" : "Complete Evidence"}</button><button type="button" className="refresh" disabled={loading} onClick={() => void load()}>{loading ? "…" : "↻"}</button></div></footer>
    </section>,mount,
  );
}
