"use client";

import { savedFindingTarget, type FindingReferenceField, type FindingTarget } from "./findings/record-references";
import {findingLabel} from "./findings/presentation";
import { navigateToFornost, type FornostNavigationRequest } from "./navigation-focus";
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

type Check = { key: string; labelTr: string; labelEn: string; ok: boolean };

const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const normalized = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");

const SOURCE_MODULE: Record<string, string> = {
  audit: "Denetim Yönetimi",
  ai: "AI Yönetişimi",
  control: "Kontroller",
  risk: "Risk Assessment",
  vendor: "Tedarikçiler",
  regulatory: "Regülasyon Merkezi",
  policy: "Politika Merkezi",
  incident: "Güvenlik Olayları",
  "continuous-control": "Kanıt Otomasyonu",
};

export default function FindingLineageLens({finding,lang,close,targets,coreState,retryCore}:{
  finding:Finding;lang:Lang;close:()=>void;targets:Record<FindingReferenceField, FindingTarget[]>;
  coreState:"ready"|"loading"|"error";retryCore:()=>void;
}) {
  const navigate=(request:FornostNavigationRequest)=>{close();navigateToFornost(request);};
  const tr = lang === "tr";
  const sourceModule = Object.hasOwn(SOURCE_MODULE,normalized(finding.sourceType))?SOURCE_MODULE[normalized(finding.sourceType)]:undefined;
  const checks: Check[] = [
    { key: "source", labelTr: "Kaynak bağlantısı", labelEn: "Source linkage", ok: Boolean(clean(finding.sourceRef) && sourceModule) },
    { key: "owner", labelTr: "Aksiyon sahibi", labelEn: "Action owner", ok: Boolean(clean(finding.owner)) },
    { key: "reviewer", labelTr: "Bağımsız doğrulayıcı", labelEn: "Independent reviewer", ok: Boolean(clean(finding.reviewer) && normalized(finding.reviewer)!==normalized(finding.owner)) },
    { key: "root", labelTr: "Kök neden", labelEn: "Root cause", ok: Boolean(clean(finding.rootCause)) },
    { key: "corrective", labelTr: "Düzeltici aksiyon", labelEn: "Corrective action", ok: Boolean(clean(finding.correctiveAction)) },
    { key: "preventive", labelTr: "Önleyici aksiyon", labelEn: "Preventive action", ok: Boolean(clean(finding.preventiveAction)) },
    { key: "due", labelTr: "SLA / termin", labelEn: "SLA / due date", ok: Boolean(clean(finding.dueDate)) },
    { key: "governance", labelTr: "Risk veya kontrol izi", labelEn: "Risk or control lineage", ok: Boolean(clean(finding.riskRef) || clean(finding.controlRef)) },
  ];
  const complete = checks.filter((item) => item.ok).length;
  const completeness = Math.round((complete / checks.length) * 100);
  const tone = completeness >= 88 ? "healthy" : completeness >= 63 ? "attention" : "critical";

  return <section className="finding-lineage-lens finding-lineage-lens-mount">
    <header>
      <div>
        <small>{tr ? "CONNECTED FINDING TRACEABILITY" : "CONNECTED FINDING TRACEABILITY"}</small>
        <strong>{tr ? "Bulgu → CAPA → Risk/Kontrol izi" : "Finding → CAPA → Risk/Control lineage"}</strong>
      </div>
      <div className={`fll-score ${tone}`}><b>{completeness}%</b><span>{tr ? "alan doluluğu" : "fields complete"}</span></div>
    </header>

    <div className="fll-route">
      <button type="button" disabled={!sourceModule||!clean(finding.sourceRef)} onClick={() => sourceModule && navigate({ module: sourceModule, ref: finding.sourceRef, kind: finding.sourceType==="ai"?"ai-finding":finding.sourceType, source: "finding-lineage",filter:{recordRef:finding.sourceRef} })}>
        <small>{tr ? "Kaynak" : "Source"}</small><b>{findingLabel(finding.sourceType,lang)}</b><span>{finding.sourceRef || (tr ? "Referans yok" : "No reference")}</span><em>→</em>
      </button>
      {(["controlRef", "riskRef"] as const).map(field => {
        const reference = finding[field];
        const target = savedFindingTarget(targets[field], reference);
        const label = field === "riskRef" ? "Risk" : tr ? "Kontrol" : "Control";
        const status = !reference ? (tr ? "Bağlantı yok" : "Not linked")
          : coreState === "loading" ? (tr ? "Yükleniyor…" : "Loading…")
          : coreState === "error" ? (tr ? "Kayıtlar yüklenemedi" : "Records unavailable")
          : (tr ? "Tek bir kayıtla eşleşmedi" : "No unique record match");
        return <button key={field} type="button" disabled={!target} onClick={() => target && navigate({
          module: target.module, ref: target.id, kind: "record", source: "finding-lineage",
          returnTo: {module: "Bulgular ve CAPA", filter: {findingRef: finding.id}},
        })}>
          <small>{label}</small><b>{target?.code || reference || "—"}</b>
          <span>{target?.title || status}</span>{target && <em aria-hidden="true">→</em>}
        </button>;
      })}
    </div>

    {coreState === "error" && (finding.controlRef || finding.riskRef) && <button type="button" onClick={retryCore}>{tr ? "Bağlı kayıtları yeniden yükle" : "Reload linked records"}</button>}
    <p>{tr?"Bu göstergeler alan doluluğunu gösterir; bağlantılı kaydın varlığını, erişimini veya kanıt geçerliliğini doğrulamaz.":"These indicators show field completeness; they do not verify linked-record existence, access or evidence validity."}</p>
    <div className="fll-checks">
      {checks.map((item) => <div key={item.key} className={item.ok ? "ok" : "missing"}>
        <i>{item.ok ? "✓" : "!"}</i><span>{tr ? item.labelTr : item.labelEn}</span>
      </div>)}
    </div>

    {checks.some((item) => !item.ok) && <p>{tr
      ? "Eksik alanlar CAPA'nın kapanış kanıtını, denetim izini veya risk geri beslemesini zayıflatabilir. Kayıt kapanmadan önce tamamlanması önerilir."
      : "Missing fields can weaken CAPA closure evidence, audit traceability or risk feedback. Complete them before closure."}</p>}
  </section>;

}
