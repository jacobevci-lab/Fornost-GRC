"use client";
/* eslint-disable @next/next/no-img-element -- evidence images are authenticated runtime URLs and cannot use the static image optimizer */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { readSheet as readXlsxSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";
import "./matrix-overrides.css";
import "./i18n.css";
import "./settings.css";
import "./fornost-refresh.css";
import "./product-polish.css";
import "./fornost-premium.css";
import Settings from "./settings";
import { withBasePath } from "./base-path";

type Lang = "tr" | "en";
type Row = {
  id: string;
  module: string;
  data: Record<string, any>;
  createdAt?: string;
};
const modules = [
  "Ana Sayfa",
  "Risk Assessment",
  "BIA",
  "Varlık Envanteri",
  "Uyum",
  "Tedarikçiler",
  "Kontroller",
  "Kanıtlar",
  "Denetim Yönetimi",
  "Raporlar",
  "Ayarlar",
];
const names: Record<Lang, Record<string, string>> = {
  tr: {
    "Ana Sayfa": "Gösterge Paneli",
    "Risk Assessment": "Risk Değerlendirmesi",
    BIA: "İş Etki Analizi (BIA)",
    "Varlık Envanteri": "Varlık Envanteri",
    Uyum: "Uyum Yönetimi",
    Tedarikçiler: "Tedarikçi Yönetimi",
    Kontroller: "Kontrol Kütüphanesi",
    Kanıtlar: "Kanıt Kütüphanesi",
    "Denetim Yönetimi": "Denetim Yönetimi",
    Raporlar: "Raporlama",
    Ayarlar: "Ayarlar",
  },
  en: {
    "Ana Sayfa": "Dashboard",
    "Risk Assessment": "Risk Assessment",
    BIA: "Business Impact Analysis (BIA)",
    "Varlık Envanteri": "Asset Inventory",
    Uyum: "Compliance Management",
    Tedarikçiler: "Vendor Management",
    Kontroller: "Control Library",
    Kanıtlar: "Evidence Library",
    "Denetim Yönetimi": "Audit Management",
    Raporlar: "Reporting",
    Ayarlar: "Settings",
  },
};
const labelMap: Record<Lang, Record<string, string>> = {
  tr: {
    title: "Başlık / Ad",
    owner: "Sahibi",
    businessUnit: "İş Birimi",
    status: "Durum",
    description: "Açıklama",
    asset: "İlgili Varlık",
    likelihood: "Olasılık (1-5)",
    impact: "Etki (1-5)",
    treatment: "Risk Aksiyonu",
    process: "Süreç / Hizmet",
    rto: "RTO (saat)",
    rpo: "RPO (saat)",
    financial: "Finansal Etki (1-5)",
    operational: "Operasyonel Etki (1-5)",
    legal: "Yasal Etki (1-5)",
    reputation: "İtibar Etkisi (1-5)",
    assetType: "Varlık Türü",
    criticality: "Kritiklik",
    environment: "Ortam",
    location: "Lokasyon",
    ip: "IP / FQDN",
    framework: "Standart / Regülasyon",
    controlRef: "Madde No",
    controlTitle: "Kontrol Maddesi",
    implementation: "Uygulama Durumu",
    vendorType: "Hizmet Türü",
    service: "Alınan Hizmet",
    contractEnd: "Sözleşme Bitişi",
    riskLevel: "Risk Seviyesi",
    contact: "İrtibat",
    frequency: "Kontrol Sıklığı",
    evidenceTitle: "Kanıt Başlığı",
    period: "Dönem",
    frameworks: "Kullanıldığı Standartlar",
    notes: "Notlar",
  },
  en: {
    title: "Title / Name",
    owner: "Owner",
    businessUnit: "Business Unit",
    status: "Status",
    description: "Description",
    asset: "Related Asset",
    likelihood: "Likelihood (1-5)",
    impact: "Impact (1-5)",
    treatment: "Risk Treatment",
    process: "Process / Service",
    rto: "RTO (hours)",
    rpo: "RPO (hours)",
    financial: "Financial Impact (1-5)",
    operational: "Operational Impact (1-5)",
    legal: "Legal Impact (1-5)",
    reputation: "Reputational Impact (1-5)",
    assetType: "Asset Type",
    criticality: "Criticality",
    environment: "Environment",
    location: "Location",
    ip: "IP / FQDN",
    framework: "Standard / Regulation",
    controlRef: "Control Ref.",
    controlTitle: "Control Title",
    implementation: "Implementation Status",
    vendorType: "Service Type",
    service: "Service Provided",
    contractEnd: "Contract End Date",
    riskLevel: "Risk Level",
    contact: "Contact",
    frequency: "Control Frequency",
    evidenceTitle: "Evidence Title",
    period: "Period",
    frameworks: "Applicable Standards",
    notes: "Notes",
  },
};
Object.assign(labelMap.tr, {
  processLink: "İlgili Süreç / BIA",
  category: "Risk Kategorisi",
  threat: "Tehdit / Neden",
  event: "Risk Olayı",
  consequence: "Muhtemel Sonuç",
  inherentLikelihood: "Doğal Risk Olasılığı (1-5)",
  inherentImpact: "Doğal Risk Etkisi (1-5)",
  existingControls: "Mevcut Kontroller",
  plannedAction: "Planlanan Aksiyon",
  actionOwner: "Aksiyon Sahibi",
  targetDate: "Hedef Tarih",
  lastReview: "Son Değerlendirme",
  nextReview: "Sonraki Değerlendirme",
  mtpd: "MTPD / MAO (saat)",
  minimumService: "Minimum Hizmet Seviyesi",
  customer: "Müşteri Etkisi (1-5)",
  dataImpact: "Bilgi / Veri Etkisi (1-5)",
  dependencies: "Kritik Bağımlılıklar",
  manualWorkaround: "Manuel Çalışma Alternatifi",
  drStatus: "DR / Failover Durumu",
  lastTestDate: "Son Kurtarma Testi",
  testResult: "Test Sonucu",
  nextTestDate: "Sonraki Test",
  technicalOwner: "Teknik Sorumlu",
  dataClassification: "Veri Sınıflandırması",
  internetFacing: "İnternete Açık",
  personalData: "Kişisel Veri İçeriyor",
  criticalService: "Kritik Hizmeti Destekliyor",
  eolDate: "Destek / EOL Tarihi",
  backupStatus: "Yedekleme",
  edrStatus: "EDR Kapsamı",
  siemStatus: "SIEM / Log Kapsamı",
  vulnScan: "Zafiyet Taraması Kapsamı",
});
Object.assign(labelMap.en, {
  processLink: "Related Process / BIA",
  category: "Risk Category",
  threat: "Threat / Cause",
  event: "Risk Event",
  consequence: "Potential Consequence",
  inherentLikelihood: "Inherent Likelihood (1-5)",
  inherentImpact: "Inherent Impact (1-5)",
  existingControls: "Existing Controls",
  plannedAction: "Planned Action",
  actionOwner: "Action Owner",
  targetDate: "Target Date",
  lastReview: "Last Review",
  nextReview: "Next Review",
  mtpd: "MTPD / MAO (hours)",
  minimumService: "Minimum Service Level",
  customer: "Customer Impact (1-5)",
  dataImpact: "Information / Data Impact (1-5)",
  dependencies: "Critical Dependencies",
  manualWorkaround: "Manual Workaround",
  drStatus: "DR / Failover Status",
  lastTestDate: "Last Recovery Test",
  testResult: "Test Result",
  nextTestDate: "Next Test",
  technicalOwner: "Technical Owner",
  dataClassification: "Data Classification",
  internetFacing: "Internet-facing",
  personalData: "Contains Personal Data",
  criticalService: "Supports Critical Service",
  eolDate: "Support / EOL Date",
  backupStatus: "Backup",
  edrStatus: "EDR Coverage",
  siemStatus: "SIEM / Log Coverage",
  vulnScan: "Vulnerability Scan Scope",
});
Object.assign(labelMap.tr, { ownerEmail: "Risk Sahibi E-posta Adresi" });
Object.assign(labelMap.en, { ownerEmail: "Risk Owner Email Address" });
Object.assign(labelMap.tr, {
  auditName: "Denetim Adı",
  auditType: "Denetim Türü",
  auditor: "Denetçi Kurum / Kişi",
  auditOwner: "Denetim Sorumlusu",
  startDate: "Başlangıç Tarihi",
  endDate: "Hedef Bitiş Tarihi",
  requirementRef: "Madde / Kontrol No",
  requirementTitle: "Madde Açıklaması",
  dueDate: "Madde Son Teslim Tarihi",
  progress: "İlerleme (%)",
  evidenceStatus: "Kanıt Durumu",
  auditorFeedback: "Denetçi Geri Bildirimi",
  responsibleNote: "Sorumlu Notu",
  finding: "Bulgu / Aksiyon",
  delayReason: "Gecikme Nedeni",
  riskRef: "Bağlı Risk",
  evidenceRef: "Bağlı Kanıt",
});
Object.assign(labelMap.en, {
  auditName: "Audit Name",
  auditType: "Audit Type",
  auditor: "Auditor / Organization",
  auditOwner: "Audit Owner",
  startDate: "Start Date",
  endDate: "Target End Date",
  requirementRef: "Requirement / Control Ref.",
  requirementTitle: "Requirement Description",
  dueDate: "Requirement Due Date",
  progress: "Progress (%)",
  evidenceStatus: "Evidence Status",
  auditorFeedback: "Auditor Feedback",
  responsibleNote: "Owner Note",
  finding: "Finding / Action",
  delayReason: "Delay Reason",
  riskRef: "Linked Risk",
  evidenceRef: "Linked Evidence",
});
const ui: Record<Lang, Record<string, string>> = {
  tr: {
    workspace: "ÇALIŞMA ALANI",
    tagline: "Tek doğruluk kaynağın",
    aside:
      "Excel dosyalarını içe aktar; risk, BIA, varlık, uyum, tedarikçi ve kanıtlarını tek yerde yönet.",
    import: "Excel İçe Aktar",
    csv: "CSV İndir",
    new: "+ Yeni Kayıt",
    search: "Kayıtlarda ara...",
    record: "kayıt",
    edit: "Düzenle",
    delete: "Sil",
    empty: "Henüz kayıt yok.",
    cancel: "Vazgeç",
    save: "Kaydet",
    upload: "Kanıtı Yükle",
    file: "Ekran Görüntüsü / Dosya",
    editRecord: "KAYDI DÜZENLE",
    newRecord: "YENİ KAYIT",
    select: "Seçiniz",
    selectFramework: "Standart veya regülasyon seçiniz",
    role: "Bilgi Güvenliği",
  },
  en: {
    workspace: "WORKSPACE",
    tagline: "Your single source of truth",
    aside:
      "Import Excel files and manage risks, BIA, assets, compliance, vendors and evidence in one place.",
    import: "Import Excel",
    csv: "Download CSV",
    new: "+ New Record",
    search: "Search records...",
    record: "records",
    edit: "Edit",
    delete: "Delete",
    empty: "No records yet.",
    cancel: "Cancel",
    save: "Save",
    upload: "Upload Evidence",
    file: "Screenshot / File",
    editRecord: "EDIT RECORD",
    newRecord: "NEW RECORD",
    select: "Select",
    selectFramework: "Select a standard or regulation",
    role: "Information Security",
  },
};
const frameworkGroups = [
  {
    tr: "ISO Standartları",
    en: "ISO Standards",
    items: [
      "ISO/IEC 27001:2022",
      "ISO/IEC 27002:2022",
      "ISO/IEC 27017",
      "ISO/IEC 27018",
      "ISO/IEC 27701",
      "ISO 22301",
      "ISO/IEC 20000-1",
      "ISO 31000",
      "ISO/IEC 42001",
      "ISO 9001",
      "ISO 14001",
      "ISO 45001",
    ],
  },
  {
    tr: "SOC Raporları",
    en: "SOC Reports",
    items: [
      "SOC 1 Type I",
      "SOC 1 Type II",
      "SOC 2 Type I",
      "SOC 2 Type II",
      "SOC 3",
    ],
  },
  {
    tr: "Güvenlik ve Kontrol Çerçeveleri",
    en: "Security and Control Frameworks",
    items: [
      "PCI DSS 4.0.1",
      "NIST Cybersecurity Framework (CSF) 2.0",
      "NIST SP 800-53",
      "CIS Controls v8.1",
      "COBIT 2019",
      "CSA Cloud Controls Matrix (CCM)",
    ],
  },
  {
    tr: "Regülasyonlar",
    en: "Regulations",
    items: [
      "KVKK",
      "GDPR",
      "DORA",
      "NIS2 Directive",
      "SOX",
      "HIPAA",
      "BDDK Bilgi Sistemleri ve Elektronik Bankacılık Hizmetleri Yönetmeliği",
      "TCMB Bilgi Sistemleri Tebliği",
    ],
  },
];
const dataModules = modules.filter(
  (x) => !["Ana Sayfa", "Raporlar", "Kanıtlar"].includes(x),
);
const fields: Record<string, string[]> = {
  "Risk Assessment": [
    "title",
    "category",
    "threat",
    "event",
    "consequence",
    "businessUnit",
    "owner",
    "ownerEmail",
    "asset",
    "processLink",
    "inherentLikelihood",
    "inherentImpact",
    "treatment",
    "existingControls",
    "plannedAction",
    "actionOwner",
    "targetDate",
    "status",
    "lastReview",
    "nextReview",
  ],
  BIA: [
    "process",
    "description",
    "businessUnit",
    "owner",
    "criticality",
    "asset",
    "dependencies",
    "financial",
    "operational",
    "legal",
    "reputation",
    "customer",
    "dataImpact",
    "mtpd",
    "rto",
    "rpo",
    "minimumService",
    "manualWorkaround",
    "drStatus",
    "lastTestDate",
    "testResult",
    "nextTestDate",
    "lastReview",
  ],
  "Varlık Envanteri": [
    "title",
    "assetType",
    "description",
    "businessUnit",
    "owner",
    "technicalOwner",
    "criticality",
    "dataClassification",
    "environment",
    "location",
    "ip",
    "internetFacing",
    "personalData",
    "criticalService",
    "eolDate",
    "backupStatus",
    "edrStatus",
    "siemStatus",
    "vulnScan",
    "processLink",
    "status",
  ],
  Uyum: [
    "framework",
    "controlRef",
    "controlTitle",
    "owner",
    "implementation",
    "status",
  ],
  Tedarikçiler: [
    "title",
    "vendorType",
    "service",
    "businessUnit",
    "owner",
    "criticality",
    "contractEnd",
    "riskLevel",
    "contact",
    "status",
  ],
  Kontroller: [
    "controlRef",
    "controlTitle",
    "description",
    "owner",
    "frequency",
    "status",
    "frameworks",
  ],
  Kanıtlar: [
    "evidenceTitle",
    "controlRef",
    "controlTitle",
    "owner",
    "period",
    "frameworks",
    "notes",
  ],
  "Denetim Yönetimi": [
    "auditName",
    "auditType",
    "auditor",
    "auditOwner",
    "startDate",
    "endDate",
    "requirementRef",
    "requirementTitle",
    "owner",
    "businessUnit",
    "dueDate",
    "status",
    "progress",
    "evidenceStatus",
    "controlRef",
    "riskRef",
    "evidenceRef",
    "responsibleNote",
    "auditorFeedback",
    "finding",
    "delayReason",
  ],
};
const examples: Row[] = [
  {
    id: "RSK-001",
    module: "Risk Assessment",
    data: {
      title: "Ayrıcalıklı hesapların kötüye kullanılması",
      businessUnit: "Bilgi Teknolojileri",
      owner: "Bilgi Güvenliği",
      asset: "Microsoft Entra ID",
      likelihood: 4,
      impact: 5,
      treatment: "Azalt",
      status: "Açık",
    },
  },
  {
    id: "BIA-001",
    module: "BIA",
    data: {
      process: "E-Ticaret Sipariş Yönetimi",
      businessUnit: "Dijital Kanallar",
      owner: "E-Ticaret",
      criticality: "Kritik",
      rto: 2,
      rpo: 1,
      financial: 5,
      operational: 5,
      legal: 3,
      reputation: 4,
      asset: "E-Ticaret Platformu",
    },
  },
  {
    id: "AST-001",
    module: "Varlık Envanteri",
    data: {
      title: "Microsoft Entra ID",
      assetType: "Bulut Servisi",
      businessUnit: "Bilgi Teknolojileri",
      owner: "IT Altyapı",
      criticality: "Kritik",
      environment: "Üretim",
      location: "Azure",
      ip: "entra.microsoft.com",
      status: "Aktif",
    },
  },
  {
    id: "CMP-001",
    module: "Uyum",
    data: {
      framework: "ISO/IEC 27001:2022",
      controlRef: "A.5.15",
      controlTitle: "Erişim kontrolü",
      owner: "Bilgi Güvenliği",
      implementation: "Uygulanıyor",
      status: "Uyumlu",
    },
  },
  {
    id: "VEN-001",
    module: "Tedarikçiler",
    data: {
      title: "Bordro SaaS",
      vendorType: "SaaS",
      service: "Bordro yönetimi",
      businessUnit: "İnsan Kaynakları",
      owner: "İK",
      criticality: "Yüksek",
      contractEnd: "2027-03-31",
      riskLevel: "Orta",
      status: "Aktif",
    },
  },
  {
    id: "CTL-001",
    module: "Kontroller",
    data: {
      controlRef: "CTL-001",
      controlTitle: "Ayrıcalıklı hesaplarda güçlü MFA",
      owner: "IAM Ekibi",
      frequency: "Sürekli",
      status: "Uygulanıyor",
      frameworks: "ISO 27001 A.5.15, NIST CSF PR.AA-03",
    },
  },
];
let linkedRows: Row[] = examples;
const aliases: Record<string, string> = {
  "risk adı": "title",
  "risk name": "title",
  "risk tanımı": "description",
  "risk description": "description",
  "risk sahibi": "owner",
  owner: "owner",
  sahibi: "owner",
  "iş birimi": "businessUnit",
  "business unit": "businessUnit",
  departman: "businessUnit",
  asset: "asset",
  varlık: "asset",
  likelihood: "likelihood",
  olasılık: "likelihood",
  impact: "impact",
  etki: "impact",
  treatment: "treatment",
  aksiyon: "treatment",
  status: "status",
  durum: "status",
  process: "process",
  süreç: "process",
  service: "service",
  hizmet: "service",
  criticality: "criticality",
  kritiklik: "criticality",
  "varlık adı": "title",
  "asset name": "title",
  "varlık türü": "assetType",
  "asset type": "assetType",
  "ip/fqdn": "ip",
  standard: "framework",
  standart: "framework",
  regulation: "framework",
  regülasyon: "framework",
  "control ref": "controlRef",
  "madde no": "controlRef",
  "control title": "controlTitle",
  "kontrol başlığı": "controlTitle",
  "uygulama durumu": "implementation",
  vendor: "title",
  tedarikçi: "title",
  "risk level": "riskLevel",
  "risk seviyesi": "riskLevel",
  "contract end": "contractEnd",
  "sözleşme bitişi": "contractEnd",
};
const valueEN: Record<string, string> = {
  Düşük: "Low",
  Orta: "Medium",
  Yüksek: "High",
  Kritik: "Critical",
  Azalt: "Mitigate",
  "Kabul Et": "Accept",
  "Transfer Et": "Transfer",
  Kaçın: "Avoid",
  Aktif: "Active",
  Açık: "Open",
  Planlandı: "Planned",
  Uygulanıyor: "Implemented",
  Uyumlu: "Compliant",
  Kısmi: "Partial",
  Kapalı: "Closed",
  Üretim: "Production",
  Sürekli: "Continuous",
};
const display = (v: any, lang: Lang) =>
  lang === "en" ? valueEN[String(v)] || v : v;
function score(r: Row) {
  return (
    Number(r.data.inherentLikelihood || r.data.likelihood || 0) *
    Number(r.data.inherentImpact || r.data.impact || 0)
  );
}
function inherentScore(r: Row) {
  return (
    Number(r.data.inherentLikelihood || r.data.likelihood || 0) *
    Number(r.data.inherentImpact || r.data.impact || 0)
  );
}
function band(n: number) {
  return n >= 17 ? "Kritik" : n >= 10 ? "Yüksek" : n >= 5 ? "Orta" : "Düşük";
}
function empty(m: string) {
  return Object.fromEntries((fields[m] || []).map((k) => [k, ""]));
}
function csvDownload(name: string, rows: Row[], lang: Lang) {
  const labels = labelMap[lang],
    all = [...new Set(rows.flatMap((r) => fields[r.module] || []))],
    head = [
      lang === "tr" ? "Kod" : "Code",
      lang === "tr" ? "Modül" : "Module",
      ...all.map((k) => labels[k] || k),
    ],
    body = rows.map((r) => [
      r.id,
      names[lang][r.module] || r.module,
      ...all.map((k) => r.data[k] ?? ""),
    ]);
  const csv = [head, ...body]
    .map((x) => x.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv" }),
  );
  a.download = name;
  a.click();
}

export default function Home() {
  return <AuthGate />;
}

function AuthGate() {
  const [state, setState] = useState<any>(null),
    [error, setError] = useState(""),
    [showLogin, setShowLogin] = useState(false);
  async function check() {
    try{
      const r = await fetch(withBasePath("/api/auth"), { cache: "no-store" });
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||"Kimlik servisine ulaşılamadı.");
      setState(j);setError("");
    }catch(e){setState({loadFailed:true});setError(e instanceof Error?e.message:"Kimlik servisine ulaşılamadı.");}
  }
  useEffect(() => {
    check();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget),
      r = await fetch(withBasePath("/api/auth"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: state.bootstrapRequired && !showLogin ? "bootstrap" : "login",
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      }),
      j = await r.json();
    if (!r.ok) setError(j.error || "Giriş başarısız.");
    else check();
  }
  async function demoLogin(){
    setError("");
    const r=await fetch(withBasePath("/api/auth"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"demo_login"})}),j=await r.json();
    if(!r.ok)setError(j.error||"Demo hesabıyla giriş başarısız.");else check();
  }
  if (!state)
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <b>Fornost GRC</b>
          <p>Güvenli oturum hazırlanıyor…</p>
        </div>
      </div>
    );
  if(state.loadFailed)return <div className="auth-screen"><div className="auth-card"><div className="auth-mark">F</div><small>FORNOST GRC</small><h1>Oturum hazırlanamadı</h1><p>Kimlik servisi geçici olarak yanıt veremedi. Birkaç saniye sonra tekrar deneyin.</p>{error&&<div className="auth-error">{error}</div>}<button className="primary" onClick={()=>{setState(null);check()}}>Tekrar Dene</button></div></div>;
  if (state.authenticated) return <FornostApp currentUser={state.user} />;
  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark">F</div>
        <small>FORNOST GRC</small>
        <h1>
          {state.bootstrapRequired && !showLogin
            ? "Fornost GRC İlk Kurulum"
            : "Yerel Hesapla Giriş"}
        </h1>
        <p>
          {state.bootstrapRequired && !showLogin
            ? "Kurulumu tamamlamak için ilk yerel yönetici hesabını oluşturun. Bu hesap sistem yöneticisi yetkisine sahip olacaktır."
            : "Entra SSO kullanılamadığında yetkili yerel hesabınızla giriş yapın."}
        </p>
        {state.bootstrapRequired && !showLogin && (
          <div className="setup-progress" aria-label="İlk kurulum adımları">
            <span className="active"><b>1</b> Yönetici</span>
            <span><b>2</b> Giriş</span>
            <span><b>3</b> Ayarlar</span>
          </div>
        )}
        {state.bootstrapRequired && !showLogin && (
          <label>
            Ad Soyad
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          E-posta
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Parola
          <input
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete={
              state.bootstrapRequired && !showLogin ? "new-password" : "current-password"
            }
          />
        </label>
        {state.bootstrapRequired && !showLogin && (
          <em>En az 12 karakter; büyük/küçük harf, sayı ve özel karakter.</em>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="primary">
          {state.bootstrapRequired && !showLogin ? "Yönetici Hesabını Oluştur" : "Giriş Yap"}
        </button>
        {state.demoAccount&&<div className="demo-login-box">
          <b>Demo Editor Hesabı</b>
          <span>{state.demoAccount.email}</span>
          <button type="button" className="ghost" onClick={demoLogin}>Demo Hesapla Giriş Yap</button>
        </div>}
        {state.bootstrapRequired&&<button type="button" className="auth-switch" onClick={()=>setShowLogin(x=>!x)}>{showLogin?"İlk yönetici oluşturma ekranına dön":"Mevcut yerel hesapla giriş yap"}</button>}
      </form>
    </div>
  );
}

function FornostApp({ currentUser }: { currentUser: any }) {
  const [lang, setLang] = useState<Lang>("tr"),
    [active, setActive] = useState("Ana Sayfa"),
    [rows, setRows] = useState<Row[]>(examples),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Row | null>(null),
    [form, setForm] = useState<Record<string, any>>({}),
    [notice, setNotice] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [previewEvidence, setPreviewEvidence] = useState<Row | null>(null),
    [selectedAudit, setSelectedAudit] = useState(""),
    [theme, setTheme] = useState<"light" | "dark">("light");
  const labels = labelMap[lang],
    u = ui[lang];
  linkedRows = rows;
  useEffect(() => {
    const saved = localStorage.getItem("fornost-grc-language");
    if (saved === "tr" || saved === "en") setLang(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("fornost-grc-language", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const saved = localStorage.getItem("fornost-grc-theme");
    setTheme(
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
    );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("fornost-grc-theme", theme);
    return () => {
      delete document.documentElement.dataset.theme;
      document.documentElement.style.colorScheme = "";
    };
  }, [theme]);
  useEffect(() => {
    document.title = "Fornost GRC";
    const overview = document.querySelector(".welcome small");
    if (overview)
      overview.textContent =
        lang === "tr" ? "FORNOST GRC GENEL DURUM" : "FORNOST GRC OVERVIEW";
  }, [lang, active]);
  async function load() {
    try {
      const r = await fetch(withBasePath("/api/grc"));
      if (r.ok) {
        const j = await r.json();
        if (j.rows?.length)
          setRows(
            j.rows.map((x: any) => ({ ...x, data: JSON.parse(x.data_json) })),
          );
      }
    } catch {}
  }
  useEffect(() => {
    load();
  }, []);
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.module === active &&
          (!selectedAudit ||
            active !== "Denetim Yönetimi" ||
            r.data.auditName === selectedAudit) &&
          JSON.stringify(r.data)
            .toLocaleLowerCase(lang === "tr" ? "tr-TR" : "en-US")
            .includes(
              query.toLocaleLowerCase(lang === "tr" ? "tr-TR" : "en-US"),
            ),
      ),
    [rows, active, query, lang, selectedAudit],
  );
  function changeLang(next: Lang) {
    setLang(next);
  }
  function openNew() {
    setEditing(null);
    const next = empty(active);
    if (active === "Denetim Yönetimi" && selectedAudit) {
      next.auditName = selectedAudit;
      next.auditType = auditKind(selectedAudit);
      next.progress = "0";
      next.status = "Başlanmadı";
      next.evidenceStatus = "Kanıt Bekleniyor";
    }
    setForm(next);
    setModal(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setForm({ ...r.data });
    setModal(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const r = await fetch(withBasePath("/api/grc"), {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: editing?.id, module: active, data: form }),
    });
    if (r.ok) {
      setModal(false);
      await load();
      setNotice(
        lang === "tr"
          ? editing
            ? "Kayıt güncellendi."
            : "Yeni kayıt eklendi."
          : editing
            ? "Record updated."
            : "New record added.",
      );
    } else {
      const j = await r.json().catch(() => ({}));
      setNotice(
        j.error ||
          (lang === "tr"
            ? "Kayıt kaydedilemedi."
            : "Record could not be saved."),
      );
    }
  }
  async function remove(id: string) {
    if (
      !confirm(lang === "tr" ? "Bu kayıt silinsin mi?" : "Delete this record?")
    )
      return;
    await fetch(withBasePath(`/api/grc?id=${id}`), { method: "DELETE" });
    await load();
  }
  async function uploadEvidence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch(withBasePath("/api/evidence"), {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    if (r.ok) {
      setModal(false);
      await load();
      setNotice(
        lang === "tr"
          ? "Kanıt kütüphanesine eklendi."
          : "Added to the evidence library.",
      );
    } else
      setNotice(
        lang === "tr"
          ? "Kanıt yüklenemedi."
          : "Evidence could not be uploaded.",
      );
  }
  const by = (m: string) => rows.filter((r) => r.module === m),
    desc =
      active === "Risk Assessment"
        ? lang === "tr"
          ? "Riskleri kaydet, 5×5 skorunu ve dağılımını gör."
          : "Record risks and view their 5×5 scores and distribution."
        : active === "BIA"
          ? lang === "tr"
            ? "Kritik süreçleri, iş etkisini ve RTO/RPO hedeflerini tut."
            : "Track critical processes, business impacts and RTO/RPO targets."
          : active === "Kanıtlar"
            ? lang === "tr"
              ? "Ekran görüntülerini kontrol maddeleri ve standartlarla eşleştir."
              : "Map screenshots to controls and applicable standards."
            : active === "Denetim Yönetimi"
              ? lang === "tr"
                ? "Denetim maddelerini, sorumluları, kanıtları ve terminleri uçtan uca takip et."
                : "Track audit requirements, owners, evidence and deadlines end to end."
              : lang === "tr"
                ? "Kayıtlarını sade, aranabilir ve raporlanabilir biçimde yönet."
                : "Manage records in a simple, searchable and reportable format.";
  const navIcons = ["⌂", "◇", "◫", "▦", "✓", "◎", "◈", "▣", "◉", "↗", "⚙"];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>N</span>
          <div>
            <b>Fornost GRC</b>
            <small>
              {lang === "tr"
                ? "Governance · Risk · Compliance"
                : "Governance · Risk · Compliance"}
            </small>
          </div>
        </div>
        <nav>
          {modules.map((m, i) => (
            <button
              className={active === m ? "active" : ""}
              onClick={() => {
                setActive(m);
                setQuery("");
                setNotice("");
              }}
              key={m}
            >
              <i>{navIcons[i]}</i>
              <span>{names[lang][m]}</span>
            </button>
          ))}
        </nav>
        <div className="aside-note">
          <b>{u.tagline}</b>
          <p>{u.aside}</p>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>{u.workspace}</small>
            <h1>{names[lang][active]}</h1>
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={
                theme === "dark"
                  ? lang === "tr" ? "Açık temaya geç" : "Switch to light theme"
                  : lang === "tr" ? "Koyu temaya geç" : "Switch to dark theme"
              }
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            </button>
            <div
              className="language-switch"
              aria-label={lang === "tr" ? "Dil seçimi" : "Language selection"}
            >
              <button
                className={lang === "tr" ? "active" : ""}
                onClick={() => changeLang("tr")}
              >
                TR
              </button>
              <button
                className={lang === "en" ? "active" : ""}
                onClick={() => changeLang("en")}
              >
                EN
              </button>
            </div>
            <div className="user">
              <span>
                {String(currentUser.name || currentUser.email)
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <b>{currentUser.name || currentUser.email}</b>
                <small>
                  {currentUser.role} ·{" "}
                  {currentUser.source === "local" ? "Yerel" : "Entra SSO"}
                </small>
              </div>
            </div>
          </div>
        </header>
        {notice && (
          <div className="notice" onClick={() => setNotice("")}>
            {notice}
            <b>×</b>
          </div>
        )}
        {active === "Ana Sayfa" ? (
          <Dashboard rows={rows} go={setActive} lang={lang} />
        ) : active === "Raporlar" ? (
          <Reports rows={rows} lang={lang} />
        ) : active === "Ayarlar" ? (
          <Settings lang={lang} currentUser={currentUser} />
        ) : active === "Denetim Yönetimi" ? (
          <AuditModule
            rows={by("Denetim Yönetimi")}
            visible={visible}
            selected={selectedAudit}
            select={(x) => {
              setSelectedAudit(x);
              setQuery("");
            }}
            lang={lang}
            query={query}
            setQuery={setQuery}
            openNew={openNew}
            edit={openEdit}
            remove={remove}
            openImport={() => setImportOpen(true)}
            canWrite={currentUser.role !== "Viewer"}
          />
        ) : (
          <>
            <section className="module-head">
              <div>
                <h2>{names[lang][active]}</h2>
                <p>{desc}</p>
              </div>
              <div className="actions">
                {dataModules.includes(active) &&
                  currentUser.role !== "Viewer" && (
                    <button
                      className="ghost"
                      onClick={() => setImportOpen(true)}
                    >
                      {u.import}
                    </button>
                  )}
                <button
                  className="ghost"
                  onClick={() =>
                    csvDownload(`${names[lang][active]}.csv`, visible, lang)
                  }
                >
                  {u.csv}
                </button>
                {currentUser.role !== "Viewer" && (
                  <button className="primary" onClick={openNew}>
                    {u.new}
                  </button>
                )}
              </div>
            </section>
            {active === "Risk Assessment" && (
              <RiskOverview rows={by("Risk Assessment")} lang={lang} />
            )}
            <section
              className={`table-card ${active === "Risk Assessment" ? "risk-register" : "smart-register"}`}
            >
              <div className="table-tools">
                <div className="register-search">
                  <span>⌕</span>
                  <input
                    placeholder={u.search}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <b>
                  {visible.length} {u.record}
                </b>
              </div>
              <div className="table-wrap">
                {active === "Risk Assessment" ? (
                  <RiskRegister
                    rows={visible}
                    lang={lang}
                    edit={openEdit}
                    remove={remove}
                  />
                ) : (
                  <SmartRegister
                    module={active}
                    rows={visible}
                    lang={lang}
                    edit={openEdit}
                    remove={remove}
                    viewEvidence={setPreviewEvidence}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </main>
      {modal && (
        <div className="overlay" onMouseDown={() => setModal(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <small>{editing ? u.editRecord : u.newRecord}</small>
                <h2>{names[lang][active]}</h2>
              </div>
              <button onClick={() => setModal(false)}>×</button>
            </div>
            {active === "Kanıtlar" && !editing ? (
              <form onSubmit={uploadEvidence} className="form">
                <label className="wide">
                  {u.file}
                  <input
                    name="file"
                    type="file"
                    accept="image/*,.pdf"
                    required
                  />
                </label>
                {fields[active].map((k) => (
                  <Field
                    key={k}
                    k={k}
                    form={form}
                    setForm={setForm}
                    nameMode
                    lang={lang}
                  />
                ))}
                <div className="form-actions">
                  <button type="button" onClick={() => setModal(false)}>
                    {u.cancel}
                  </button>
                  <button className="primary">{u.upload}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={save} className="form">
                {fields[active].map((k) => (
                  <Field
                    key={k}
                    k={k}
                    form={form}
                    setForm={setForm}
                    lang={lang}
                  />
                ))}
                <div className="form-actions">
                  <button type="button" onClick={() => setModal(false)}>
                    {u.cancel}
                  </button>
                  <button className="primary">{u.save}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {previewEvidence && (
        <EvidencePreview
          row={previewEvidence}
          lang={lang}
          onClose={() => setPreviewEvidence(null)}
        />
      )}
      {importOpen && (
        <ImportModal
          module={active}
          lang={lang}
          onClose={() => setImportOpen(false)}
          onDone={async (n) => {
            setImportOpen(false);
            await load();
            setNotice(
              lang === "tr"
                ? `${n} kayıt Excel dosyasından içe aktarıldı.`
                : `${n} records imported from the Excel file.`,
            );
          }}
        />
      )}
    </div>
  );
}

function ImportModal({
  module,
  lang,
  onClose,
  onDone,
}: {
  module: string;
  lang: Lang;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [raw, setRaw] = useState<Record<string, any>[]>([]),
    [headers, setHeaders] = useState<string[]>([]),
    [map, setMap] = useState<Record<string, string>>({}),
    [file, setFile] = useState(""),
    [error, setError] = useState(""),
    labels = labelMap[lang];
  async function read(f: File) {
    setError("");
    if (f.size > 5 * 1024 * 1024) {
      setError(
        lang === "tr"
          ? "Dosya en fazla 5 MB olabilir."
          : "The file may not exceed 5 MB.",
      );
      return;
    }
    try {
      const sheet = await readXlsxSheet(f);
      if (!sheet.length) throw new Error("EMPTY");
      const hs = sheet[0]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .slice(0, 100);
      const json: Record<string, any>[] = [];
      sheet.slice(1,1001).forEach((row) => {
        const out: Record<string, any> = {};
        hs.forEach((h, i) => {
          out[h] = String(row[i] ?? "").slice(0, 2000);
        });
        if (Object.values(out).some(Boolean)) json.push(out);
      });
      const auto: Record<string, string> = {};
      hs.forEach((h) => {
        const norm = h
          .trim()
          .toLocaleLowerCase(lang === "tr" ? "tr-TR" : "en-US");
        auto[h] =
          aliases[norm] ||
          (fields[module] || []).find(
            (k) =>
              (labels[k] || k).toLocaleLowerCase(
                lang === "tr" ? "tr-TR" : "en-US",
              ) === norm,
          ) ||
          "";
      });
      setFile(f.name);
      setRaw(json);
      setHeaders(hs);
      setMap(auto);
    } catch {
      setError(
        lang === "tr"
          ? "Dosya okunamadı. Geçerli bir .xlsx dosyası seçin."
          : "The file could not be read. Select a valid .xlsx file.",
      );
    }
  }
  const converted = raw
    .map((r) =>
      Object.fromEntries(
        headers.filter((h) => map[h]).map((h) => [map[h], r[h]]),
      ),
    )
    .filter((r) => Object.values(r).some(Boolean));
  async function commit() {
    const r = await fetch(withBasePath("/api/grc"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module, rows: converted }),
    });
    if (r.ok) onDone(converted.length);
    else
      setError(
        (await r.json().catch(() => ({}))).error ||
          (lang === "tr" ? "İçe aktarma başarısız." : "Import failed."),
      );
  }
  return (
    <div className="overlay">
      <div className="modal import-modal">
        <div className="modal-head">
          <div>
            <small>{lang === "tr" ? "EXCEL İÇE AKTAR" : "IMPORT EXCEL"}</small>
            <h2>{names[lang][module]}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="import-body">
          <div className="drop" onClick={() => input.current?.click()}>
            <b>
              {file ||
                (lang === "tr" ? "Excel dosyanı seç" : "Select an Excel file")}
            </b>
            <span>
              {lang === "tr"
                ? ".xlsx · En fazla 5 MB ve 1.000 satır"
                : ".xlsx · Up to 5 MB and 1,000 rows"}
            </span>
            <input
              ref={input}
              hidden
              type="file"
              accept=".xlsx"
              onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {headers.length > 0 && (
            <>
              <div className="import-summary">
                <b>
                  {raw.length} {lang === "tr" ? "satır bulundu" : "rows found"}
                </b>
                <span>
                  {Object.values(map).filter(Boolean).length}{" "}
                  {lang === "tr" ? "kolon eşleştirildi" : "columns mapped"}
                </span>
              </div>
              <div className="mapping">
                {headers.map((h) => (
                  <label key={h}>
                    <span>{h}</span>
                    <select
                      value={map[h] || ""}
                      onChange={(e) => setMap({ ...map, [h]: e.target.value })}
                    >
                      <option value="">
                        {lang === "tr" ? "İçe aktarma" : "Do not import"}
                      </option>
                      {fields[module].map((k) => (
                        <option key={k} value={k}>
                          {labels[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="preview-note">
                {lang === "tr"
                  ? `Ön izleme: ${converted.length} geçerli satır içe aktarılacak.`
                  : `Preview: ${converted.length} valid rows will be imported.`}
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button onClick={onClose}>{ui[lang].cancel}</button>
          <button
            className="primary"
            disabled={!converted.length}
            onClick={commit}
          >
            {lang === "tr"
              ? `${converted.length} Kaydı İçe Aktar`
              : `Import ${converted.length} Records`}
          </button>
        </div>
      </div>
    </div>
  );
}
function Field({
  k,
  form,
  setForm,
  lang,
  nameMode = false,
}: {
  k: string;
  form: any;
  setForm: any;
  lang: Lang;
  nameMode?: boolean;
}) {
  const scores = ["1", "2", "3", "4", "5"],
    yesNo = ["Evet", "Hayır"],
    coverage = ["Kapsamda", "Kapsam Dışı", "Bilinmiyor"];
  const select: Record<string, string[]> = {
    likelihood: scores,
    impact: scores,
    inherentLikelihood: scores,
    inherentImpact: scores,
    financial: scores,
    operational: scores,
    legal: scores,
    reputation: scores,
    customer: scores,
    dataImpact: scores,
    criticality: ["Düşük", "Orta", "Yüksek", "Kritik"],
    riskLevel: ["Düşük", "Orta", "Yüksek", "Kritik"],
    category: [
      "Siber Güvenlik",
      "Bilgi Güvenliği",
      "Operasyonel",
      "Üçüncü Taraf",
      "Uyum",
      "Gizlilik",
      "İş Sürekliliği",
      "Finansal",
    ],
    assetType: [
      "Sunucu",
      "Uygulama",
      "Veritabanı",
      "Ağ Cihazı",
      "Uç Nokta",
      "Bulut Servisi",
      "Bilgi Varlığı",
      "Tedarikçi Hizmeti",
    ],
    environment: ["Üretim", "Test", "Geliştirme", "Felaket Kurtarma"],
    dataClassification: ["Herkese Açık", "Şirket İçi", "Gizli", "Çok Gizli"],
    treatment: ["Azalt", "Kabul Et", "Transfer Et", "Kaçın"],
    implementation: [
      "Uygulanıyor",
      "Kısmi",
      "Planlandı",
      "Uygulanmıyor",
      "Uygulanamaz",
    ],
    frequency: [
      "Sürekli",
      "Günlük",
      "Haftalık",
      "Aylık",
      "Üç Aylık",
      "Altı Aylık",
      "Yıllık",
    ],
    vendorType: [
      "SaaS",
      "PaaS",
      "IaaS",
      "Yönetilen Hizmet",
      "Danışmanlık",
      "Telekom",
      "Donanım/Bakım",
      "Diğer",
    ],
    internetFacing: yesNo,
    personalData: yesNo,
    criticalService: yesNo,
    manualWorkaround: yesNo,
    backupStatus: coverage,
    edrStatus: coverage,
    siemStatus: coverage,
    vulnScan: coverage,
    drStatus: ["Mevcut", "Kısmi", "Mevcut Değil", "Bilinmiyor"],
    testResult: ["Başarılı", "Kısmen Başarılı", "Başarısız", "Test Edilmedi"],
    status: [
      "Aktif",
      "Açık",
      "Başlanmadı",
      "Devam Ediyor",
      "Kanıt Bekleniyor",
      "Hazır",
      "İncelemede",
      "Uygun Değil",
      "Kapatıldı",
      "Kabul Edildi",
      "Planlandı",
      "Uygulanıyor",
      "Uyumlu",
      "Kısmi",
      "Kapalı",
    ],
  };
  const value = form[k] || "",
    change = (v: string) => setForm({ ...form, [k]: v }),
    u = ui[lang];
  if (k === "frameworks") {
    const selected = String(value)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      toggle = (x: string) =>
        change(
          selected.includes(x)
            ? selected.filter((v) => v !== x).join(", ")
            : [...selected, x].join(", "),
        );
    return (
      <fieldset className="wide framework-picker">
        <legend>{labelMap[lang][k]}</legend>
        <p>
          {lang === "tr"
            ? "Bu kanıt veya kontrol için geçerli olan tüm standartları seçin."
            : "Select every standard that applies to this evidence or control."}
        </p>
        {nameMode && <input type="hidden" name={k} value={value} />}
        <div>
          {frameworkGroups.map((group) => (
            <section key={group.en}>
              <b>{group[lang]}</b>
              {group.items.map((x) => (
                <label key={x}>
                  <input
                    type="checkbox"
                    checked={selected.includes(x)}
                    onChange={() => toggle(x)}
                  />
                  <span>{x}</span>
                </label>
              ))}
            </section>
          ))}
        </div>
      </fieldset>
    );
  }
  const wide = [
    "description",
    "notes",
    "implementation",
    "threat",
    "event",
    "consequence",
    "existingControls",
    "plannedAction",
    "dependencies",
    "minimumService",
    "requirementTitle",
    "responsibleNote",
    "auditorFeedback",
    "finding",
    "delayReason",
  ].includes(k);
  const dateFields = [
    "contractEnd",
    "targetDate",
    "lastReview",
    "nextReview",
    "eolDate",
    "lastTestDate",
    "nextTestDate",
    "startDate",
    "endDate",
    "dueDate",
  ];
  const numberFields = ["rto", "rpo", "mtpd", "progress"];
  if (k === "asset" || k === "processLink") {
    const source =
      k === "asset"
        ? linkedRows
            .filter((r) => r.module === "Varlık Envanteri")
            .map((r) => r.data.title)
        : linkedRows
            .filter((r) => r.module === "BIA")
            .map((r) => r.data.process);
    const options = [...new Set(source.filter(Boolean))];
    return (
      <label>
        {labelMap[lang][k]}
        <select value={value} onChange={(e) => change(e.target.value)}>
          <option value="">{u.select}</option>
          {options.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (k === "controlRef") {
    const options = [
      ...new Set(
        linkedRows
          .filter((r) => r.module === "Kontroller")
          .map((r) => r.data.controlRef)
          .filter(Boolean),
      ),
    ];
    return (
      <label>
        {labelMap[lang][k]}
        <input
          name={nameMode ? k : undefined}
          list="fornost-control-refs"
          value={value}
          onChange={(e) => change(e.target.value)}
        />
        <datalist id="fornost-control-refs">
          {options.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
    );
  }
  return (
    <label className={wide ? "wide" : ""}>
      {labelMap[lang][k]}
      {k === "framework" ? (
        <select
          name={nameMode ? k : undefined}
          value={value}
          onChange={(e) => change(e.target.value)}
          required
        >
          <option value="">{u.selectFramework}</option>
          {frameworkGroups.map((group) => (
            <optgroup key={group.en} label={group[lang]}>
              {group.items.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      ) : select[k] ? (
        <select
          name={nameMode ? k : undefined}
          value={value}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">{u.select}</option>
          {select[k].map((x) => (
            <option key={x} value={x}>
              {display(x, lang)}
            </option>
          ))}
        </select>
      ) : wide ? (
        <textarea
          name={nameMode ? k : undefined}
          rows={3}
          maxLength={2000}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          name={nameMode ? k : undefined}
          type={
            k === "ownerEmail"
              ? "email"
              : numberFields.includes(k)
                ? "number"
                : dateFields.includes(k)
                  ? "date"
                  : "text"
          }
          min={numberFields.includes(k) ? 0 : undefined}
          max={k === "progress" ? 100 : undefined}
          maxLength={2000}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
}

function Dashboard({
  rows,
  go,
  lang,
}: {
  rows: Row[];
  go: (x: string) => void;
  lang: Lang;
}) {
  const by = (m: string) => rows.filter((r) => r.module === m),
    risks = by("Risk Assessment"),
    high = risks.filter((r) => score(r) >= 10),
    assets = by("Varlık Envanteri"),
    bias = by("BIA"),
    compliance = by("Uyum"),
    vendors = by("Tedarikçiler"),
    evidence = by("Kanıtlar"),
    compliant = compliance.filter((r) => r.data.status === "Uyumlu").length,
    coverage = compliance.length
      ? Math.round((compliant / compliance.length) * 100)
      : 0,
    tr = lang === "tr";
  return (
    <>
      <section className="welcome">
        <div>
          <small>{tr ? "FORNOST GRC GENEL DURUM" : "FORNOST GRC OVERVIEW"}</small>
          <h2>
            {tr ? (
              <>
                Risk, süreklilik ve uyumu
                <br />
                tek ekrandan izle.
              </>
            ) : (
              <>
                Monitor risk, resilience and compliance
                <br />
                from one screen.
              </>
            )}
          </h2>
          <p>
            {tr
              ? "Göstergeler platformdaki gerçek kayıtlardan anlık hesaplanır."
              : "Metrics are calculated instantly from live platform records."}
          </p>
        </div>
        <button onClick={() => go("Raporlar")}>
          {tr ? "Yönetim raporu oluştur →" : "Create management report →"}
        </button>
      </section>
      <section
        className="quick-actions"
        aria-label={tr ? "Hızlı erişim" : "Quick access"}
      >
        <button onClick={() => go("Risk Assessment")}>
          <span>01</span><b>{tr ? "Riskleri yönet" : "Manage risks"}</b>
          <small>{tr ? "Risk kaydı ve 5×5 matris" : "Risk register and 5×5 matrix"}</small>
        </button>
        <button onClick={() => go("Denetim Yönetimi")}>
          <span>02</span><b>{tr ? "Denetimleri izle" : "Track audits"}</b>
          <small>{tr ? "Maddeler, kanıtlar ve terminler" : "Requirements, evidence and deadlines"}</small>
        </button>
        <button onClick={() => go("Kanıtlar")}>
          <span>03</span><b>{tr ? "Kanıtları eşleştir" : "Map evidence"}</b>
          <small>{tr ? "Kontrol ve standart bağlantıları" : "Control and framework links"}</small>
        </button>
        <button onClick={() => go("Raporlar")}>
          <span>04</span><b>{tr ? "Yönetim görünümü" : "Executive view"}</b>
          <small>{tr ? "Filtrelenebilir anlık rapor" : "Live filterable reporting"}</small>
        </button>
      </section>
      <section className="kpis">
        <Kpi
          n={risks.length}
          t={tr ? "Toplam Risk" : "Total Risks"}
          s={
            tr ? `${high.length} yüksek/kritik` : `${high.length} high/critical`
          }
        />
        <Kpi
          n={assets.length}
          t={tr ? "Varlık" : "Assets"}
          s={
            tr
              ? `${assets.filter((r) => r.data.criticality === "Kritik").length} kritik`
              : `${assets.filter((r) => r.data.criticality === "Kritik").length} critical`
          }
        />
        <Kpi
          n={bias.length}
          t={tr ? "BIA Kaydı" : "BIA Records"}
          s={
            tr
              ? `${bias.filter((r) => r.data.criticality === "Kritik").length} kritik süreç`
              : `${bias.filter((r) => r.data.criticality === "Kritik").length} critical processes`
          }
        />
        <Kpi
          n={`${coverage}%`}
          t={tr ? "Uyum Oranı" : "Compliance Rate"}
          s={
            tr
              ? `${compliant}/${compliance.length} uyumlu`
              : `${compliant}/${compliance.length} compliant`
          }
        />
        <Kpi
          n={vendors.length}
          t={tr ? "Tedarikçi" : "Vendors"}
          s={
            tr
              ? `${vendors.filter((r) => ["Yüksek", "Kritik"].includes(r.data.riskLevel)).length} yüksek riskli`
              : `${vendors.filter((r) => ["Yüksek", "Kritik"].includes(r.data.riskLevel)).length} high risk`
          }
        />
        <Kpi
          n={evidence.length}
          t={tr ? "Kanıt" : "Evidence"}
          s={
            tr
              ? `${new Set(evidence.map((r) => r.data.controlRef).filter(Boolean)).size} kontrole bağlı`
              : `linked to ${new Set(evidence.map((r) => r.data.controlRef).filter(Boolean)).size} controls`
          }
        />
      </section>
      <section className="dash-grid">
        <div className="panel">
          <h3>{tr ? "Risk Seviyesi Dağılımı" : "Risk Level Distribution"}</h3>
          <Bars
            items={["Kritik", "Yüksek", "Orta", "Düşük"].map((x) => ({
              label: display(x, lang),
              value: risks.filter((r) => band(score(r)) === x).length,
              cls: x.toLowerCase(),
            }))}
          />
        </div>
        <div className="panel">
          <h3>{tr ? "Uyum Durumu" : "Compliance Status"}</h3>
          <Bars
            items={["Uyumlu", "Kısmi", "Açık"].map((x) => ({
              label: display(x, lang),
              value: compliance.filter((r) => r.data.status === x).length,
              cls: x.toLowerCase(),
            }))}
          />
        </div>
        <div className="panel">
          <h3>{tr ? "Yüksek ve Kritik Riskler" : "High and Critical Risks"}</h3>
          {high
            .sort((a, b) => score(b) - score(a))
            .slice(0, 5)
            .map((r) => (
              <div className="dash-row" key={r.id}>
                <div>
                  <b>{r.data.title}</b>
                  <small>
                    {r.data.owner} · {r.data.businessUnit}
                  </small>
                </div>
                <span className={`risk ${band(score(r)).toLowerCase()}`}>
                  {score(r)}
                </span>
              </div>
            ))}
        </div>
        <div className="panel">
          <h3>{tr ? "Kritik İş Süreçleri" : "Critical Business Processes"}</h3>
          {bias
            .filter((r) => r.data.criticality === "Kritik")
            .slice(0, 5)
            .map((r) => (
              <div className="dash-row" key={r.id}>
                <div>
                  <b>{r.data.process}</b>
                  <small>
                    {r.data.owner} · RTO {r.data.rto} {tr ? "saat" : "hours"}
                  </small>
                </div>
                <span className="tag">{tr ? "Kritik" : "Critical"}</span>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
function Kpi({ n, t, s }: { n: number | string; t: string; s: string }) {
  return (
    <div className="kpi">
      <b>{n}</b>
      <span>{t}</span>
      <small>{s}</small>
    </div>
  );
}
function Bars({
  items,
}: {
  items: { label: string; value: number; cls: string }[];
}) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <div className="bars">
      {items.map((x) => (
        <div key={x.label}>
          <span>{x.label}</span>
          <i>
            <em
              className={x.cls}
              style={{ width: `${(x.value / max) * 100}%` }}
            />
          </i>
          <b>{x.value}</b>
        </div>
      ))}
    </div>
  );
}
function Reports({ rows, lang }: { rows: Row[]; lang: Lang }) {
  const all = lang === "tr" ? "Tümü" : "All",
    [module, setModule] = useState(all),
    [unit, setUnit] = useState(all),
    [owner, setOwner] = useState(all),
    [status, setStatus] = useState(all),
    tr = lang === "tr";
  useEffect(() => {
    setModule(all);
    setUnit(all);
    setOwner(all);
    setStatus(all);
  }, [all]);
  const values = (k: string) =>
    [...new Set(rows.map((r) => r.data[k]).filter(Boolean))].sort();
  const filtered = rows.filter(
    (r) =>
      (module === all || r.module === module) &&
      (unit === all || r.data.businessUnit === unit) &&
      (owner === all || r.data.owner === owner) &&
      (status === all || r.data.status === status),
  );
  async function excel() {
    const labels = labelMap[lang];
    const data = filtered.map((r) => ({
      [tr ? "Kod" : "Code"]: r.id,
      [tr ? "Modül" : "Module"]: names[lang][r.module] || r.module,
      ...Object.fromEntries(
        Object.entries(r.data).map(([k, v]) => [labels[k] || k, v]),
      ),
    }));
    const keys = [...new Set(data.flatMap((row) => Object.keys(row)))];
    await writeXlsxFile(
      [keys.map((key) => ({ value: key, fontWeight: "bold" as const })), ...data.map((row) => keys.map((key) => ({ value: String(row[key] ?? "") })))],
    ).toFile(`Fornost-GRC-${tr ? "Raporu" : "Report"}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  return (
    <>
      <section className="module-head">
        <div>
          <h2>{names[lang].Raporlar}</h2>
          <p>
            {tr
              ? "Genel durumu filtrele; yönetim raporunu Excel veya CSV olarak indir."
              : "Filter the overview and download the management report as Excel or CSV."}
          </p>
        </div>
        <div className="actions">
          <button
            className="ghost"
            onClick={() => csvDownload("Fornost-GRC-Report.csv", filtered, lang)}
          >
            {ui[lang].csv}
          </button>
          <button className="primary" onClick={excel}>
            {tr ? "Excel Raporu Al" : "Download Excel Report"}
          </button>
        </div>
      </section>
      <section className="report-filters">
        <ModuleFilter value={module} set={setModule} lang={lang} all={all} />
        <Filter
          label={tr ? "İş Birimi" : "Business Unit"}
          value={unit}
          set={setUnit}
          opts={values("businessUnit")}
          all={all}
        />
        <Filter
          label={tr ? "Sahip" : "Owner"}
          value={owner}
          set={setOwner}
          opts={values("owner")}
          all={all}
        />
        <Filter
          label={tr ? "Durum" : "Status"}
          value={status}
          set={setStatus}
          opts={values("status")}
          all={all}
        />
      </section>
      <section className="report-summary">
        <Kpi
          n={filtered.length}
          t={tr ? "Raporlanan Kayıt" : "Reported Records"}
          s={tr ? "Aktif filtre sonucu" : "Active filter result"}
        />
        <Kpi
          n={
            filtered.filter(
              (r) => r.module === "Risk Assessment" && score(r) >= 10,
            ).length
          }
          t={tr ? "Yüksek/Kritik Risk" : "High/Critical Risks"}
          s={tr ? "Skor 10 ve üzeri" : "Score 10 or above"}
        />
        <Kpi
          n={
            filtered.filter(
              (r) =>
                r.module === "Varlık Envanteri" &&
                r.data.criticality === "Kritik",
            ).length
          }
          t={tr ? "Kritik Varlık" : "Critical Assets"}
          s={tr ? "Envanter kapsamı" : "Inventory scope"}
        />
        <Kpi
          n={
            filtered.filter(
              (r) => r.module === "Uyum" && r.data.status !== "Uyumlu",
            ).length
          }
          t={tr ? "Uyum Açığı" : "Compliance Gaps"}
          s={tr ? "Kısmi veya açık" : "Partial or open"}
        />
      </section>
      <section className="table-card">
        <div className="table-tools">
          <b>
            {filtered.length} {tr ? "kayıt rapora dahil" : "records included"}
          </b>
          <span>
            {tr ? "Oluşturma" : "Created"}:{" "}
            {new Date().toLocaleDateString(tr ? "tr-TR" : "en-GB")}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  tr ? "Kod" : "Code",
                  tr ? "Modül" : "Module",
                  tr ? "Başlık" : "Title",
                  tr ? "İş Birimi" : "Business Unit",
                  tr ? "Sahip" : "Owner",
                  tr ? "Durum" : "Status",
                  tr ? "Seviye" : "Level",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 250).map((r) => (
                <tr key={r.id}>
                  <td>
                    <b className="code">{r.id}</b>
                  </td>
                  <td>{names[lang][r.module] || r.module}</td>
                  <td>
                    {r.data.title ||
                      r.data.process ||
                      r.data.controlTitle ||
                      "—"}
                  </td>
                  <td>{r.data.businessUnit || "—"}</td>
                  <td>{r.data.owner || "—"}</td>
                  <td>{display(r.data.status, lang) || "—"}</td>
                  <td>
                    {display(
                      r.module === "Risk Assessment"
                        ? band(score(r))
                        : r.data.riskLevel || r.data.criticality || "—",
                      lang,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function ModuleFilter({
  value,
  set,
  lang,
  all,
}: {
  value: string;
  set: (x: string) => void;
  lang: Lang;
  all: string;
}) {
  return (
    <label>
      <span>{lang === "tr" ? "Modül" : "Module"}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value={all}>{all}</option>
        {dataModules.map((x) => (
          <option key={x} value={x}>
            {names[lang][x]}
          </option>
        ))}
      </select>
    </label>
  );
}
function Filter({
  label,
  value,
  set,
  opts,
  all,
}: {
  label: string;
  value: string;
  set: (x: string) => void;
  opts: string[];
  all: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value={all}>{all}</option>
        {opts.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
function RiskMatrix({ rows, lang }: { rows: Row[]; lang: Lang }) {
  const count = (l: number, i: number) =>
      rows.filter(
        (r) =>
          Number(r.data.inherentLikelihood || r.data.likelihood) === l &&
          Number(r.data.inherentImpact || r.data.impact) === i,
      ).length,
    tr = lang === "tr";
  return (
    <section className="matrix-card">
      <div>
        <small>{tr ? "5 × 5 RİSK MATRİSİ" : "5 × 5 RISK MATRIX"}</small>
        <h3>{tr ? "Olasılık × Etki" : "Likelihood × Impact"}</h3>
        <p>
          {tr
            ? "Hücrelerdeki sayılar mevcut risk adetlerini gösterir."
            : "Cell values show the number of current risks."}
        </p>
      </div>
      <div className="matrix">
        <b className="axis y">{tr ? "Olasılık" : "Likelihood"}</b>
        {[5, 4, 3, 2, 1].map((l) => (
          <div className="matrix-row" key={l}>
            <em>{l}</em>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={band(l * i).toLowerCase()}>
                {count(l, i) || ""}
              </span>
            ))}
          </div>
        ))}
        <div className="xlabels">
          <i></i>
          {[1, 2, 3, 4, 5].map((i) => (
            <em key={i}>{i}</em>
          ))}
        </div>
        <b className="axis x">{tr ? "Etki" : "Impact"}</b>
      </div>
    </section>
  );
}
function RiskOverview({ rows, lang }: { rows: Row[]; lang: Lang }) {
  const tr = lang === "tr",
    high = rows.filter((r) => score(r) >= 10).length,
    critical = rows.filter((r) => score(r) >= 17).length,
    open = rows.filter(
      (r) => !["Kapalı", "Closed"].includes(String(r.data.status)),
    ).length,
    now = Date.now(),
    upcoming = rows.filter((r) => {
      const d = new Date(r.data.nextReview).getTime();
      return d >= now && d - now <= 15 * 86400000;
    }).length;
  return (
    <section className="risk-overview">
      <div className="risk-summary">
        <div className="risk-summary-head">
          <div>
            <small>{tr ? "RİSK GÖRÜNÜMÜ" : "RISK OVERVIEW"}</small>
            <h3>
              {tr ? "Risk portföyünün güncel durumu" : "Current risk portfolio"}
            </h3>
          </div>
          <span>{tr ? "Canlı görünüm" : "Live overview"}</span>
        </div>
        <div className="risk-metrics">
          {[
            [critical, tr ? "Kritik risk" : "Critical risks", "critical-dot"],
            [high, tr ? "Yüksek + kritik" : "High + critical", "high-dot"],
            [open, tr ? "Açık risk" : "Open risks", "open-dot"],
            [
              upcoming,
              tr ? "15 gün içinde değerlendirme" : "Reviews within 15 days",
              "review-dot",
            ],
          ].map(([n, t, c]) => (
            <article key={String(t)}>
              <i className={`metric-dot ${c}`} />
              <div>
                <b>{n}</b>
                <span>{t}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
      <RiskMatrix rows={rows} lang={lang} />
    </section>
  );
}
function AuditOverview({ rows, lang }: { rows: Row[]; lang: Lang }) {
  const tr = lang === "tr",
    now = new Date().toISOString().slice(0, 10),
    closed = (s: any) =>
      ["Kapatıldı", "Kapalı", "Tamamlandı", "Closed", "Completed"].includes(
        String(s),
      ),
    overdue = rows.filter(
      (r) => r.data.dueDate && r.data.dueDate < now && !closed(r.data.status),
    ).length,
    evidence = rows.filter(
      (r) => r.data.evidenceStatus === "Kanıt Bekleniyor",
    ).length,
    done = rows.filter((r) => closed(r.data.status)).length,
    progress = rows.length
      ? Math.round(
          rows.reduce((n, r) => n + Number(r.data.progress || 0), 0) /
            rows.length,
        )
      : 0,
    audits = new Set(rows.map((r) => r.data.auditName).filter(Boolean)).size;
  return (
    <section className="audit-overview">
      <div>
        <small>{tr ? "DENETİM HAZIRLIK DURUMU" : "AUDIT READINESS"}</small>
        <h3>
          {tr
            ? "Denetim portföyü ve madde ilerleyişi"
            : "Audit portfolio and requirement progress"}
        </h3>
      </div>
      <div className="audit-kpis">
        <article>
          <b>{audits}</b>
          <span>{tr ? "Aktif denetim" : "Active audits"}</span>
        </article>
        <article>
          <b>%{progress}</b>
          <span>{tr ? "Ortalama ilerleme" : "Average progress"}</span>
        </article>
        <article className={overdue ? "danger" : ""}>
          <b>{overdue}</b>
          <span>{tr ? "Geciken madde" : "Overdue requirements"}</span>
        </article>
        <article>
          <b>{evidence}</b>
          <span>{tr ? "Kanıt bekleyen" : "Awaiting evidence"}</span>
        </article>
        <article>
          <b>
            {done}/{rows.length}
          </b>
          <span>{tr ? "Kapatılan madde" : "Closed requirements"}</span>
        </article>
      </div>
    </section>
  );
}
function RiskRegister({
  rows,
  lang,
  edit,
  remove,
}: {
  rows: Row[];
  lang: Lang;
  edit: (r: Row) => void;
  remove: (id: string) => void;
}) {
  const tr = lang === "tr",
    u = ui[lang];
  return (
    <table className="risk-table">
      <thead>
        <tr>
          <th>{tr ? "Kod" : "Code"}</th>
          <th>{tr ? "Risk Başlığı" : "Risk Title"}</th>
          <th>{tr ? "Kategori" : "Category"}</th>
          <th>{tr ? "İş Birimi" : "Business Unit"}</th>
          <th>{tr ? "Risk Sahibi" : "Risk Owner"}</th>
          <th>{tr ? "Doğal Risk" : "Inherent Risk"}</th>
          <th>{tr ? "Risk Aksiyonu" : "Treatment"}</th>
          <th>{tr ? "Durum" : "Status"}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const il = Number(
              r.data.inherentLikelihood || r.data.likelihood || 0,
            ),
            ii = Number(r.data.inherentImpact || r.data.impact || 0),
            is = il * ii;
          return (
            <tr key={r.id} onDoubleClick={() => edit(r)}>
              <td>
                <b className="code">{r.id}</b>
              </td>
              <td className="risk-title">
                <b>{r.data.title || "—"}</b>
                <small>{r.data.asset || r.data.processLink || ""}</small>
              </td>
              <td>{display(r.data.category, lang) || "—"}</td>
              <td>{r.data.businessUnit || "—"}</td>
              <td>{r.data.owner || "—"}</td>
              <td>
                <RiskScore l={il} i={ii} n={is} lang={lang} />
              </td>
              <td>{display(r.data.treatment, lang) || "—"}</td>
              <td>{display(r.data.status, lang) || "—"}</td>
              <td>
                <div className="row-actions">
                  <button onClick={() => edit(r)}>{u.edit}</button>
                  <button onClick={() => remove(r.id)}>{u.delete}</button>
                </div>
              </td>
            </tr>
          );
        })}
        {!rows.length && (
          <tr>
            <td colSpan={9} className="empty">
              {u.empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
function RiskScore({
  l,
  i,
  n,
  lang,
}: {
  l: number;
  i: number;
  n: number;
  lang: Lang;
}) {
  return (
    <div className="score-cell">
      <span>
        {lang === "tr" ? "O" : "L"} {l || "—"} <i>×</i>{" "}
        {lang === "tr" ? "E" : "I"} {i || "—"}
      </span>
      {n > 0 ? (
        <b className={`risk ${band(n).toLowerCase()}`}>
          {n} · {display(band(n), lang)}
        </b>
      ) : (
        <b>—</b>
      )}
    </div>
  );
}

const auditCatalog = [
  "ISO/IEC 27001:2022",
  "SOC 1 Type I",
  "SOC 1 Type II",
  "SOC 2 Type I",
  "SOC 2 Type II",
];
function auditKind(name: string) {
  return name.startsWith("ISO")
    ? "ISO Denetimi"
    : name.startsWith("SOC")
      ? "SOC Denetimi"
      : "Diğer Denetim";
}
function AuditModule({
  rows,
  visible,
  selected,
  select,
  lang,
  query,
  setQuery,
  openNew,
  edit,
  remove,
  openImport,
  canWrite,
}: {
  rows: Row[];
  visible: Row[];
  selected: string;
  select: (x: string) => void;
  lang: Lang;
  query: string;
  setQuery: (x: string) => void;
  openNew: () => void;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  openImport: () => void;
  canWrite: boolean;
}) {
  const tr = lang === "tr",
    actual = [
      ...new Set(
        rows.map((r) => String(r.data.auditName || "")).filter(Boolean),
      ),
    ],
    audits = [...new Set([...auditCatalog, ...actual])];
  if (!selected)
    return (
      <>
        <section className="module-head">
          <div>
            <h2>{tr ? "Denetim Portföyü" : "Audit Portfolio"}</h2>
            <p>
              {tr
                ? "Bir denetimi açarak maddelerini, sorumlularını, kanıtlarını ve ilerlemesini yönetin."
                : "Open an audit to manage its requirements, owners, evidence and progress."}
            </p>
          </div>
          <div className="actions">
            {canWrite && (
              <button
                className="primary"
                onClick={() => select("Yeni Denetim")}
              >
                {tr ? "+ Yeni Denetim" : "+ New Audit"}
              </button>
            )}
          </div>
        </section>
        <AuditOverview rows={rows} lang={lang} />
        <section className="audit-portfolio">
          {audits.map((name) => {
            const items = rows.filter((r) => r.data.auditName === name),
              progress = items.length
                ? Math.round(
                    items.reduce(
                      (n, r) => n + Number(r.data.progress || 0),
                      0,
                    ) / items.length,
                  )
                : 0,
              closed = items.filter((r) =>
                ["Kapatıldı", "Kapalı", "Tamamlandı"].includes(r.data.status),
              ).length,
              late = items.filter(
                (r) =>
                  r.data.dueDate &&
                  r.data.dueDate < new Date().toISOString().slice(0, 10) &&
                  !["Kapatıldı", "Kapalı", "Tamamlandı"].includes(
                    r.data.status,
                  ),
              ).length;
            return (
              <button
                className="audit-card"
                key={name}
                onClick={() => select(name)}
              >
                <div className="audit-card-top">
                  <span>{name.startsWith("ISO") ? "ISO" : "SOC"}</span>
                  <em>
                    {items.length
                      ? tr
                        ? "Aktif"
                        : "Active"
                      : tr
                        ? "Taslak"
                        : "Draft"}
                  </em>
                </div>
                <h3>{name}</h3>
                <p>
                  {items[0]?.data.auditor ||
                    items[0]?.data.auditType ||
                    (tr ? "Denetim çalışma alanı" : "Audit workspace")}
                </p>
                <div className="audit-card-progress">
                  <span>
                    <i style={{ width: `${progress}%` }} />
                  </span>
                  <b>%{progress}</b>
                </div>
                <footer>
                  <span>
                    {items.length} {tr ? "madde" : "requirements"}
                  </span>
                  <span>
                    {closed} {tr ? "kapalı" : "closed"}
                  </span>
                  {late > 0 && (
                    <strong>
                      {late} {tr ? "geciken" : "overdue"}
                    </strong>
                  )}
                </footer>
              </button>
            );
          })}
        </section>
      </>
    );
  const items = selected === "Yeni Denetim" ? [] : visible,
    avg = items.length
      ? Math.round(
          items.reduce((n, r) => n + Number(r.data.progress || 0), 0) /
            items.length,
        )
      : 0;
  return (
    <>
      <section className="audit-detail-head">
        <button className="audit-back" onClick={() => select("")}>
          ← {tr ? "Tüm denetimler" : "All audits"}
        </button>
        <div>
          <small>{tr ? "DENETİM ÇALIŞMA ALANI" : "AUDIT WORKSPACE"}</small>
          <h2>{selected}</h2>
          <p>
            {items[0]?.data.auditor || auditKind(selected)} ·{" "}
            {items[0]?.data.auditOwner ||
              (tr ? "Sorumlu henüz atanmadı" : "Owner not assigned")}
          </p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={openImport}>
            {tr ? "Excel İçe Aktar" : "Import Excel"}
          </button>
          <button
            className="ghost"
            onClick={() => csvDownload(`${selected}.csv`, items, lang)}
          >
            {tr ? "CSV İndir" : "Download CSV"}
          </button>
          {canWrite && (
            <button className="primary" onClick={openNew}>
              {tr ? "+ Madde Ekle" : "+ Add Requirement"}
            </button>
          )}
        </div>
      </section>
      <section className="audit-detail-kpis">
        <article>
          <b>{items.length}</b>
          <span>{tr ? "Toplam madde" : "Total requirements"}</span>
        </article>
        <article>
          <b>%{avg}</b>
          <span>{tr ? "Genel ilerleme" : "Overall progress"}</span>
        </article>
        <article>
          <b>
            {
              items.filter((r) => r.data.evidenceStatus === "Kanıt Bekleniyor")
                .length
            }
          </b>
          <span>{tr ? "Kanıt bekleyen" : "Awaiting evidence"}</span>
        </article>
        <article>
          <b>
            {
              items.filter((r) =>
                ["Kapatıldı", "Kapalı", "Tamamlandı"].includes(r.data.status),
              ).length
            }
          </b>
          <span>{tr ? "Kapatılan" : "Closed"}</span>
        </article>
      </section>
      <section className="table-card smart-register">
        <div className="table-tools">
          <div className="register-search">
            <span>⌕</span>
            <input
              placeholder={
                tr
                  ? "Bu denetimin maddelerinde ara..."
                  : "Search this audit's requirements..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <b>
            {items.length} {tr ? "madde" : "requirements"}
          </b>
        </div>
        <div className="table-wrap">
          {items.length ? (
            <SmartRegister
              module="Denetim Yönetimi"
              rows={items}
              lang={lang}
              edit={edit}
              remove={remove}
            />
          ) : (
            <div className="audit-empty">
              <b>
                {tr
                  ? "Bu denetimde henüz madde yok."
                  : "This audit has no requirements yet."}
              </b>
              <p>
                {tr
                  ? "İlk maddeyi ekleyin veya Excel dosyasından toplu içe aktarın."
                  : "Add the first requirement or import them from Excel."}
              </p>
              {canWrite && (
                <button className="primary" onClick={openNew}>
                  {tr ? "İlk Maddeyi Ekle" : "Add First Requirement"}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

const registerColumns: Record<
  string,
  { key: string; tr: string; en: string }[]
> = {
  BIA: [
    { key: "process", tr: "Süreç", en: "Process" },
    { key: "ownership", tr: "İş Birimi / Sahip", en: "Business Unit / Owner" },
    { key: "criticality", tr: "Kritiklik", en: "Criticality" },
    { key: "businessImpact", tr: "İş Etkisi", en: "Business Impact" },
    { key: "mtpd", tr: "MTPD / MAO", en: "MTPD / MAO" },
    { key: "recovery", tr: "RTO / RPO", en: "RTO / RPO" },
    { key: "readiness", tr: "Kurtarma Hazırlığı", en: "Recovery Readiness" },
    { key: "test", tr: "Son Test / Durum", en: "Last Test / Status" },
  ],
  "Varlık Envanteri": [
    { key: "title", tr: "Varlık", en: "Asset" },
    { key: "assetType", tr: "Tür / Ortam", en: "Type / Environment" },
    { key: "ownership", tr: "İş Birimi / Sahip", en: "Business Unit / Owner" },
    { key: "criticality", tr: "Kritiklik", en: "Criticality" },
    { key: "dataClassification", tr: "Veri Sınıfı", en: "Data Class" },
    { key: "exposure", tr: "Maruziyet", en: "Exposure" },
    { key: "coverage", tr: "Güvenlik Kapsamı", en: "Security Coverage" },
    { key: "lifecycle", tr: "Yaşam Döngüsü", en: "Lifecycle" },
  ],
  Uyum: [
    {
      key: "framework",
      tr: "Standart / Regülasyon",
      en: "Standard / Regulation",
    },
    { key: "control", tr: "Madde / Kontrol", en: "Ref / Control" },
    { key: "owner", tr: "Kontrol Sahibi", en: "Control Owner" },
    { key: "implementation", tr: "Uygulama", en: "Implementation" },
    { key: "evidence", tr: "Kanıt", en: "Evidence" },
    { key: "status", tr: "Uyum Durumu", en: "Compliance Status" },
  ],
  Tedarikçiler: [
    { key: "title", tr: "Tedarikçi / Hizmet", en: "Vendor / Service" },
    { key: "ownership", tr: "İş Birimi / Sahip", en: "Business Unit / Owner" },
    { key: "criticality", tr: "Kritiklik", en: "Criticality" },
    { key: "riskLevel", tr: "Risk Seviyesi", en: "Risk Level" },
    { key: "contractEnd", tr: "Sözleşme Bitişi", en: "Contract End" },
    { key: "status", tr: "Durum", en: "Status" },
  ],
  Kontroller: [
    { key: "control", tr: "Kontrol", en: "Control" },
    { key: "owner", tr: "Kontrol Sahibi", en: "Control Owner" },
    { key: "frameworks", tr: "İlgili Standartlar", en: "Applicable Standards" },
    { key: "frequency", tr: "Sıklık", en: "Frequency" },
    { key: "evidence", tr: "Kanıt Kapsamı", en: "Evidence Coverage" },
    { key: "status", tr: "Durum", en: "Status" },
  ],
  Kanıtlar: [
    { key: "evidenceTitle", tr: "Kanıt", en: "Evidence" },
    { key: "control", tr: "Bağlı Kontrol", en: "Linked Control" },
    { key: "owner", tr: "Sahip", en: "Owner" },
    { key: "period", tr: "Dönem", en: "Period" },
    {
      key: "frameworks",
      tr: "Kullanıldığı Standartlar",
      en: "Applicable Standards",
    },
    { key: "freshness", tr: "Güncellik", en: "Freshness" },
  ],
  "Denetim Yönetimi": [
    { key: "audit", tr: "Denetim / Madde", en: "Audit / Requirement" },
    {
      key: "ownership",
      tr: "İş Birimi / Sorumlu",
      en: "Business Unit / Owner",
    },
    { key: "dueDate", tr: "Termin", en: "Due Date" },
    { key: "progress", tr: "İlerleme", en: "Progress" },
    { key: "evidenceStatus", tr: "Kanıt", en: "Evidence" },
    { key: "links", tr: "Bağlantılar", en: "Links" },
    { key: "status", tr: "Durum", en: "Status" },
  ],
};
function maxImpact(r: Row) {
  return Math.max(
    0,
    ...[
      "financial",
      "operational",
      "legal",
      "reputation",
      "customer",
      "dataImpact",
    ].map((k) => Number(r.data[k] || 0)),
  );
}
function ageInDays(value: any) {
  if (!value) return null;
  const n = (Date.now() - new Date(value).getTime()) / 86400000;
  return Number.isFinite(n) ? n : null;
}
function biaWarnings(r: Row, lang: Lang) {
  const tr = lang === "tr",
    d = r.data,
    out: string[] = [];
  if (!d.rto || !d.rpo) out.push(tr ? "Eksik Bilgi" : "Missing Data");
  if (Number(d.rto) > Number(d.mtpd) && d.mtpd)
    out.push(tr ? "Hedef Uyumsuz" : "Target Conflict");
  if (d.criticality === "Kritik" && d.drStatus !== "Mevcut")
    out.push(tr ? "DR Eksik" : "DR Gap");
  if (d.nextTestDate && new Date(d.nextTestDate) < new Date())
    out.push(tr ? "Test Gecikmiş" : "Test Overdue");
  const reviewAge = ageInDays(d.lastReview);
  if (reviewAge !== null && reviewAge > 365)
    out.push(tr ? "Gözden Geçir" : "Review Due");
  if (d.criticality === "Kritik" && !d.asset)
    out.push(tr ? "Varlık Eksik" : "Asset Missing");
  return out;
}
function StatusPill({ value, lang }: { value: any; lang: Lang }) {
  return value ? (
    <span
      className={`state-pill ${String(value).toLocaleLowerCase("tr-TR").replaceAll(" ", "-")}`}
    >
      {display(value, lang)}
    </span>
  ) : (
    <>—</>
  );
}
function SmartCell({
  module,
  column,
  row,
  lang,
  viewEvidence,
}: {
  module: string;
  column: string;
  row: Row;
  lang: Lang;
  viewEvidence?: (row: Row) => void;
}) {
  const d = row.data,
    tr = lang === "tr";
  if (module === "Denetim Yönetimi" && column === "audit")
    return (
      <div className="stack title-stack">
        <b>{d.auditName || "—"}</b>
        <small>
          {d.requirementRef || "—"} · {d.requirementTitle || "—"}
        </small>
      </div>
    );
  if (module === "Denetim Yönetimi" && column === "progress")
    return (
      <div className="audit-progress">
        <span>
          <i
            style={{
              width: `${Math.max(0, Math.min(100, Number(d.progress || 0)))}%`,
            }}
          />
        </span>
        <b>%{Number(d.progress || 0)}</b>
      </div>
    );
  if (module === "Denetim Yönetimi" && column === "links")
    return (
      <div className="audit-links">
        {[d.controlRef, d.riskRef, d.evidenceRef]
          .filter(Boolean)
          .map((x: any) => (
            <span key={x}>{x}</span>
          ))}
      </div>
    );
  if (module === "Denetim Yönetimi" && column === "dueDate") {
    const late =
      d.dueDate &&
      d.dueDate < new Date().toISOString().slice(0, 10) &&
      !["Kapatıldı", "Kapalı", "Tamamlandı"].includes(d.status);
    return (
      <div className={`stack ${late ? "late" : ""}`}>
        <b>{d.dueDate || "—"}</b>
        <small>{late ? (tr ? "Gecikmiş" : "Overdue") : d.endDate || ""}</small>
      </div>
    );
  }
  if (column === "ownership")
    return (
      <div className="stack">
        <b>{d.businessUnit || "—"}</b>
        <small>{d.owner || "—"}</small>
      </div>
    );
  if (column === "control")
    return (
      <div className="stack">
        <b>{d.controlRef || "—"}</b>
        <small>{d.controlTitle || "—"}</small>
      </div>
    );
  if (["criticality", "riskLevel", "status", "implementation"].includes(column))
    return <StatusPill value={d[column]} lang={lang} />;
  if (module === "BIA" && column === "process")
    return (
      <div className="stack title-stack">
        <b>{d.process || "—"}</b>
        <small>{d.asset || ""}</small>
      </div>
    );
  if (column === "businessImpact") {
    const n = maxImpact(row);
    return n ? (
      <div className="impact-score">
        <b>{n}</b>
        <span>{display(band(n * 5), lang)}</span>
      </div>
    ) : (
      <>—</>
    );
  }
  if (column === "mtpd")
    return d.mtpd ? (
      <b>
        {d.mtpd} {tr ? "saat" : "hours"}
      </b>
    ) : (
      <>—</>
    );
  if (column === "recovery")
    return (
      <div className="stack">
        <b>RTO {d.rto || "—"}h</b>
        <small>RPO {d.rpo || "—"}h</small>
      </div>
    );
  if (column === "readiness")
    return (
      <div className="readiness">
        <span className={d.backupStatus === "Kapsamda" ? "ok" : "miss"}>
          Backup
        </span>
        <span className={d.drStatus === "Mevcut" ? "ok" : "miss"}>DR</span>
        <span className={d.manualWorkaround === "Evet" ? "ok" : "miss"}>
          {tr ? "Manuel" : "Manual"}
        </span>
      </div>
    );
  if (column === "test") {
    const warnings = biaWarnings(row, lang);
    return (
      <div className="stack">
        <b>{display(d.testResult, lang) || (tr ? "Test yok" : "No test")}</b>
        <small>{d.lastTestDate || "—"}</small>
        <div className="warnings">
          {warnings.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      </div>
    );
  }
  if (module === "Varlık Envanteri" && column === "title")
    return (
      <div className="stack title-stack">
        <b>
          {row.id} · {d.title || "—"}
        </b>
        <small>{d.ip || d.location || ""}</small>
      </div>
    );
  if (column === "assetType")
    return (
      <div className="stack">
        <b>{display(d.assetType, lang) || "—"}</b>
        <small>{display(d.environment, lang) || "—"}</small>
      </div>
    );
  if (column === "exposure")
    return (
      <div className="readiness">
        <span className={d.internetFacing === "Evet" ? "warn" : "ok"}>
          Internet
        </span>
        <span className={d.personalData === "Evet" ? "warn" : "ok"}>
          {tr ? "KV" : "PD"}
        </span>
      </div>
    );
  if (column === "coverage")
    return (
      <div className="readiness">
        {[
          ["EDR", d.edrStatus],
          ["SIEM", d.siemStatus],
          [tr ? "Yedek" : "Backup", d.backupStatus],
          [tr ? "Tarama" : "Scan", d.vulnScan],
        ].map(([x, v]) => (
          <span key={x} className={v === "Kapsamda" ? "ok" : "miss"}>
            {x}
          </span>
        ))}
      </div>
    );
  if (column === "lifecycle")
    return (
      <div className="stack">
        <StatusPill value={d.status} lang={lang} />
        <small>
          {d.eolDate
            ? `EOL ${d.eolDate}`
            : tr
              ? "EOL girilmemiş"
              : "No EOL date"}
        </small>
      </div>
    );
  if (module === "Uyum" && column === "framework")
    return <b>{d.framework || "—"}</b>;
  if (column === "evidence") {
    const count = linkedRows.filter(
      (x) => x.module === "Kanıtlar" && x.data.controlRef === d.controlRef,
    ).length;
    return (
      <span className={count ? "coverage-count ok" : "coverage-count miss"}>
        {count} {tr ? "kanıt" : "evidence"}
      </span>
    );
  }
  if (module === "Tedarikçiler" && column === "title")
    return (
      <div className="stack title-stack">
        <b>
          {row.id} · {d.title || "—"}
        </b>
        <small>{d.service || d.vendorType || "—"}</small>
      </div>
    );
  if (column === "frameworks")
    return <span className="clamp-text">{d.frameworks || "—"}</span>;
  if (module === "Kanıtlar" && column === "evidenceTitle")
    return (
      <button className="evidence-link" onClick={() => viewEvidence?.(row)}>
        <span className="evidence-thumb-mark">▣</span>
        <span><b>{d.evidenceTitle || row.id}</b><small>{d.fileName || (tr ? "Örnek ekran görüntüsü" : "Sample screenshot")}</small></span>
      </button>
    );
  if (column === "freshness") {
    const days = ageInDays(row.createdAt);
    return (
      <StatusPill
        value={
          days !== null && days > 365
            ? tr
              ? "Gözden Geçir"
              : "Review Due"
            : tr
              ? "Güncel"
              : "Current"
        }
        lang={lang}
      />
    );
  }
  return display(d[column], lang) || "—";
}
function EvidencePreview({row,lang,onClose}:{row:Row;lang:Lang;onClose:()=>void}){
 const d=row.data,tr=lang==="tr",source=d.demoImage?withBasePath(d.demoImage):(d.fileKey?withBasePath(`/api/evidence?key=${encodeURIComponent(d.fileKey)}&inline=1`):"");
 const isPdf=d.fileType==="application/pdf";
 return <div className="overlay evidence-overlay" onMouseDown={onClose}>
  <section className="evidence-preview" onMouseDown={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr?"Kanıt önizleme":"Evidence preview"}>
   <header className="evidence-preview-head"><div><small>{row.id} · {tr?"KANIT ÖNİZLEME":"EVIDENCE PREVIEW"}</small><h2>{d.evidenceTitle||row.id}</h2><p>{d.controlRef||"—"} · {d.owner||"—"} · {d.period||"—"}</p></div><button onClick={onClose} aria-label={tr?"Kapat":"Close"}>×</button></header>
   <div className="evidence-stage">{source?(isPdf?<iframe src={source} title={d.evidenceTitle||row.id}/>:<><img src={source} alt={`${d.evidenceTitle||row.id} ${tr?"ekran görüntüsü":"screenshot"}`}/></>):<div className="evidence-missing">{tr?"Bu kanıta henüz görsel eklenmemiş.":"No image has been attached to this evidence yet."}</div>}</div>
   <footer className="evidence-meta"><div><b>{tr?"Dosya":"File"}</b><span>{d.fileName|| (tr?"Demo ekran görüntüsü":"Demo screenshot")}</span></div><div><b>{tr?"Standartlar":"Standards"}</b><span>{d.frameworks||"—"}</span></div><div><b>{tr?"Not":"Note"}</b><span>{d.notes||"—"}</span></div>{d.fileKey&&<a href={withBasePath(`/api/evidence?key=${encodeURIComponent(d.fileKey)}`)}>{tr?"Orijinal dosyayı indir":"Download original"}</a>}</footer>
  </section>
 </div>;
}

function SmartRegister({
  module,
  rows,
  lang,
  edit,
  remove,
  viewEvidence,
}: {
  module: string;
  rows: Row[];
  lang: Lang;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  viewEvidence?: (row: Row) => void;
}) {
  const cols = registerColumns[module] || [],
    u = ui[lang];
  return (
    <table className={`smart-table ${module === "BIA" ? "bia-table" : ""}`}>
      <thead>
        <tr>
          <th>{lang === "tr" ? "Kod" : "Code"}</th>
          {cols.map((c) => (
            <th key={c.key}>{c[lang]}</th>
          ))}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onDoubleClick={() => edit(r)}>
            <td>{module === "Kanıtlar" ? <button className="code code-link" onClick={() => viewEvidence?.(r)}>{r.id}</button> : <b className="code">{r.id}</b>}</td>
            {cols.map((c) => (
              <td key={c.key}>
                <SmartCell module={module} column={c.key} row={r} lang={lang} viewEvidence={viewEvidence} />
              </td>
            ))}
            <td>
              <div className="row-actions">
                <button onClick={() => edit(r)}>{u.edit}</button>
                <button onClick={() => remove(r.id)}>{u.delete}</button>
              </div>
            </td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={cols.length + 2} className="empty">
              {u.empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
