"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { withBasePath } from "./base-path";
import "./finding-lineage-lens.css";

type Lang = "tr" | "en";
type Finding = {
  id: string;
  code: string;
  sourceType: string;
  sourceRef: string;
  sourceTitle: string;
  title: string;
  severity: string;
  owner: string;
  reviewer: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  dueDate: string;
  status: string;
  riskRef?: string;
  controlRef?: string;
};

type FindingsPayload = { findings?: Finding[] };

type Check = { key: string; labelTr: string; labelEn: string; ok: boolean };

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");

const NAV_LABELS: Record<string, string[]> = {
  "Risk Assessment": ["Risk Değerlendirmesi", "Risk Assessment"],
  Kontroller: ["Kontrol Kütüphanesi", "Control Library"],
  "Denetim Yönetimi": ["Denetim Yönetimi", "Audit Management"],
  Tedarikçiler: ["Tedarikçi Yönetimi", "Vendor Management"],
  "Regülasyon Merkezi": ["Regülasyon Merkezi", "Regulatory Change Center"],
  "Politika Merkezi": ["Politika Merkezi", "Policy Center"],
  "Güvenlik Olayları": ["Güvenlik Olayları ve Kriz", "Security Incidents & Crisis"],
  "Kanıt Otomasyonu": ["Kanıt Otomasyonu", "Evidence Automation"],
  "Bulgular ve CAPA": ["Bulgular ve CAPA", "Findings & CAPA"],
};

const SOURCE_MODULE: Record<string, string> = {
  audit: "Denetim Yönetimi",
  control: "Kontroller",
  risk: "Risk Assessment",
  vendor: "Tedarikçiler",
  regulatory: "Regülasyon Merkezi",
  policy: "Politika Merkezi",
  incident: "Güvenlik Olayları",
  "continuous-control": "Kanıt Otomasyonu",
};

function currentLanguage(): Lang {
  return document.querySelector(".language-switch button.active")?.textContent?.trim().toLowerCase() === "en" ? "en" : "tr";
}

function navigateTo(module: string) {
  const labels = NAV_LABELS[module] || [module];
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#fornost-navigation button[aria-label]"));
  const target = buttons.find((button) => labels.some((label) => normalized(button.getAttribute("aria-label")).includes(normalized(label))));
  target?.click();
}

function selectedFindingCode() {
  const detail = document.querySelector<HTMLElement>(".finding-detail");
  const text = detail?.querySelector("header small")?.textContent || "";
  return clean(text.split("·")[0]);
}

export default function FindingLineageLens() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [code, setCode] = useState("");

  useEffect(() => {
    let created: HTMLDivElement | null = null;
    const discover = () => {
      setLang(currentLanguage());
      const detail = document.querySelector<HTMLElement>(".finding-detail");
      if (!detail) {
        setMount(null);
        setCode("");
        return;
      }
      const nextCode = selectedFindingCode();
      setCode((current) => current === nextCode ? current : nextCode);
      created = detail.querySelector<HTMLDivElement>(":scope > .finding-lineage-lens-mount");
      if (!created) {
        created = document.createElement("div");
        created.className = "finding-lineage-lens-mount";
        const body = detail.querySelector(".finding-detail-grid");
        if (body) body.insertAdjacentElement("afterend", created);
        else detail.appendChild(created);
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

  useEffect(() => {
    if (!mount) return;
    let active = true;
    fetch(withBasePath("/api/findings"), { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<FindingsPayload> : Promise.reject(new Error("findings")))
      .then((body) => { if (active) setFindings(body.findings || []); })
      .catch(() => { if (active) setFindings([]); });
    return () => { active = false; };
  }, [mount, code]);

  const finding = useMemo(() => findings.find((item) => clean(item.code) === code) || null, [findings, code]);
  if (!mount || !finding) return null;

  const tr = lang === "tr";
  const sourceModule = SOURCE_MODULE[normalized(finding.sourceType)];
  const checks: Check[] = [
    { key: "source", labelTr: "Kaynak bağlantısı", labelEn: "Source linkage", ok: Boolean(clean(finding.sourceRef) && sourceModule) },
    { key: "owner", labelTr: "Aksiyon sahibi", labelEn: "Action owner", ok: Boolean(clean(finding.owner)) },
    { key: "reviewer", labelTr: "Bağımsız reviewer", labelEn: "Independent reviewer", ok: Boolean(clean(finding.reviewer)) },
    { key: "root", labelTr: "Kök neden", labelEn: "Root cause", ok: Boolean(clean(finding.rootCause)) },
    { key: "corrective", labelTr: "Düzeltici aksiyon", labelEn: "Corrective action", ok: Boolean(clean(finding.correctiveAction)) },
    { key: "preventive", labelTr: "Önleyici aksiyon", labelEn: "Preventive action", ok: Boolean(clean(finding.preventiveAction)) },
    { key: "due", labelTr: "SLA / termin", labelEn: "SLA / due date", ok: Boolean(clean(finding.dueDate)) },
    { key: "governance", labelTr: "Risk veya kontrol izi", labelEn: "Risk or control lineage", ok: Boolean(clean(finding.riskRef) || clean(finding.controlRef)) },
  ];
  const complete = checks.filter((item) => item.ok).length;
  const completeness = Math.round((complete / checks.length) * 100);
  const tone = completeness >= 88 ? "healthy" : completeness >= 63 ? "attention" : "critical";

  const content = <section className="finding-lineage-lens">
    <header>
      <div>
        <small>{tr ? "CONNECTED FINDING TRACEABILITY" : "CONNECTED FINDING TRACEABILITY"}</small>
        <strong>{tr ? "Bulgu → CAPA → Risk/Kontrol izi" : "Finding → CAPA → Risk/Control lineage"}</strong>
      </div>
      <div className={`fll-score ${tone}`}><b>{completeness}%</b><span>{tr ? "tamlık" : "complete"}</span></div>
    </header>

    <div className="fll-route">
      <button type="button" disabled={!sourceModule} onClick={() => sourceModule && navigateTo(sourceModule)}>
        <small>{tr ? "Kaynak" : "Source"}</small><b>{finding.sourceType || "—"}</b><span>{finding.sourceRef || (tr ? "Referans yok" : "No reference")}</span><em>→</em>
      </button>
      <button type="button" disabled={!finding.controlRef} onClick={() => finding.controlRef && navigateTo("Kontroller")}>
        <small>{tr ? "Kontrol" : "Control"}</small><b>{finding.controlRef || "—"}</b><span>{finding.controlRef ? (tr ? "Kontrol izini aç" : "Open control lineage") : (tr ? "Bağlantı yok" : "Not linked")}</span><em>→</em>
      </button>
      <button type="button" disabled={!finding.riskRef} onClick={() => finding.riskRef && navigateTo("Risk Assessment")}>
        <small>{tr ? "Risk" : "Risk"}</small><b>{finding.riskRef || "—"}</b><span>{finding.riskRef ? (tr ? "Risk geri beslemesini aç" : "Open risk feedback") : (tr ? "Bağlantı yok" : "Not linked")}</span><em>→</em>
      </button>
    </div>

    <div className="fll-checks">
      {checks.map((item) => <div key={item.key} className={item.ok ? "ok" : "missing"}>
        <i>{item.ok ? "✓" : "!"}</i><span>{tr ? item.labelTr : item.labelEn}</span>
      </div>)}
    </div>

    {checks.some((item) => !item.ok) && <p>{tr
      ? "Eksik alanlar CAPA'nın kapanış kanıtını, denetim izini veya risk geri beslemesini zayıflatabilir. Kayıt kapanmadan önce tamamlanması önerilir."
      : "Missing fields can weaken CAPA closure evidence, audit traceability or risk feedback. Complete them before closure."}</p>}
  </section>;

  return createPortal(content, mount);
}
