"use client";
/* eslint-disable @next/next/no-img-element -- evidence images are authenticated runtime URLs and cannot use the static image optimizer */

import {
  CSSProperties,
  FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readSheet as readXlsxSheet } from "read-excel-file/browser";
import writeXlsxFile from "write-excel-file/browser";
import "./matrix-overrides.css";
import "./i18n.css";
import "./settings.css";
import "./fornost-refresh.css";
import "./soc2-audit.css";
import "./product-polish.css";
import "./fornost-premium.css";
import "./command-center.css";
import "./cockpit.css";
import "./ui-accessibility.css";
import "./module-registers.css";
import "./layout-guardrails.css";
import Settings from "./settings";
import { withBasePath } from "./base-path";
import { calculatedRiskScore, effectiveImpact } from "./risk-methodology";
import { defaultCatalogs, type CatalogMap } from "./catalogs";
import { safeSpreadsheetCell } from "./export-security";

type Lang = "tr" | "en";
type Row = {
  id: string;
  module: string;
  data: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
};
type AuditPortfolioItem = {
  id: string;
  name: string;
  template: string;
  audit_type: string;
  auditor: string;
  audit_owner: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};
const modules = [
  "Ana Sayfa",
  "Risk Assessment",
  "BIA",
  "Varlık Envanteri",
  "Uyum",
  "Tedarikçiler",
  "Kanıtlar",
  "Denetim Yönetimi",
  "Raporlar",
  "Sistem Ayarları",
  "Ana Veri Yönetimi",
  "İş Akışı Entegrasyonları",
  "E-posta ve Bildirimler",
  "Kimlik ve Erişim",
];
const adminModules = new Set([
  "Sistem Ayarları",
  "Ana Veri Yönetimi",
  "İş Akışı Entegrasyonları",
  "E-posta ve Bildirimler",
  "Kimlik ve Erişim",
]);
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
    "Sistem Ayarları": "Sistem Ayarları",
    "Ana Veri Yönetimi": "Ana Veri Yönetimi",
    "İş Akışı Entegrasyonları": "İş Akışı Entegrasyonları",
    "E-posta ve Bildirimler": "E-posta ve Bildirimler",
    "Kimlik ve Erişim": "Kimlik ve Erişim",
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
    "Sistem Ayarları": "System Settings",
    "Ana Veri Yönetimi": "Master Data",
    "İş Akışı Entegrasyonları": "Workflow Integrations",
    "E-posta ve Bildirimler": "Email & Notifications",
    "Kimlik ve Erişim": "Identity & Access",
  },
};
function NavIcon({ module }: { module: string }) {
  let paths;
  switch (module) {
    case "Ana Sayfa":
      paths = (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      );
      break;
    case "Risk Assessment":
      paths = (
        <>
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      );
      break;
    case "BIA":
      paths = (
        <>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </>
      );
      break;
    case "Varlık Envanteri":
      paths = (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 4v16" />
        </>
      );
      break;
    case "Uyum":
      paths = (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      );
      break;
    case "Tedarikçiler":
      paths = (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        </>
      );
      break;
    case "Kontroller":
      paths = (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
          <circle cx="8" cy="6" r="2" />
          <circle cx="16" cy="12" r="2" />
          <circle cx="10" cy="18" r="2" />
        </>
      );
      break;
    case "Kanıtlar":
      paths = (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="m9 15 2 2 4-4" />
        </>
      );
      break;
    case "Denetim Yönetimi":
      paths = (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 3v4h6V3" />
          <path d="m8 13 2 2 5-5" />
        </>
      );
      break;
    case "Raporlar":
      paths = (
        <>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="m7 15 4-4 3 2 5-6" />
        </>
      );
      break;
    case "Sistem Ayarları":
      paths = (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
        </>
      );
      break;
    case "Ana Veri Yönetimi":
      paths = (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </>
      );
      break;
    case "İş Akışı Entegrasyonları":
      paths = (
        <>
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M8.5 7.5 15.5 16.5" />
          <path d="M15 6h4v4" />
          <path d="m19 6-5 5" />
        </>
      );
      break;
    case "E-posta ve Bildirimler":
      paths = (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </>
      );
      break;
    case "Kimlik ve Erişim":
      paths = (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M18 10h4" />
          <path d="M20 8v4" />
        </>
      );
      break;
    default:
      paths = <circle cx="12" cy="12" r="8" />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
}
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
    processCategory: "BIA Süreç Kategorisi",
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
    processCategory: "BIA Process Category",
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
  confidentialityImpact: "Gizlilik Etkisi (1-5)",
  integrityImpact: "Bütünlük Etkisi (1-5)",
  availabilityImpact: "Erişilebilirlik Etkisi (1-5)",
  calculatedImpact: "Hesaplanan Etki",
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
  peakPeriod: "Kritik / Yoğun Dönem",
  peopleDependency: "Kritik Personel / Rol Bağımlılığı",
  technologyDependency: "Teknoloji / Sistem Bağımlılığı",
  facilityDependency: "Lokasyon / Tesis Bağımlılığı",
  supplierDependency: "Tedarikçi Bağımlılığı",
  regulatoryDeadline: "Yasal / Düzenleyici Zaman Sınırı",
  recoveryStrategy: "Kurtarma Stratejisi",
  singlePointOfFailure: "Tek Hata Noktası Var",
  approver: "BIA Onaylayan",
  approvalDate: "BIA Onay Tarihi",
  assetId: "Varlık Envanter Kodu",
  custodian: "Varlık Sorumlusu / Custodian",
  vendor: "Üretici / Tedarikçi",
  confidentialityRating: "Gizlilik Değeri (1-5)",
  integrityRating: "Bütünlük Değeri (1-5)",
  availabilityRating: "Erişilebilirlik Değeri (1-5)",
  regulatoryScope: "Yasal / Düzenleyici Kapsam",
  retentionPeriod: "Saklama Süresi",
  version: "Sürüm / Model",
  lifecycleStage: "Yaşam Döngüsü Aşaması",
  acquisitionDate: "Edinim / Devreye Alma Tarihi",
  encryptionStatus: "Şifreleme Durumu",
  accessReviewStatus: "Erişim Gözden Geçirme",
  patchStatus: "Yama Güncelliği",
});
Object.assign(labelMap.en, {
  processLink: "Related Process / BIA",
  category: "Risk Category",
  threat: "Threat / Cause",
  event: "Risk Event",
  consequence: "Potential Consequence",
  inherentLikelihood: "Inherent Likelihood (1-5)",
  inherentImpact: "Inherent Impact (1-5)",
  confidentialityImpact: "Confidentiality Impact (1-5)",
  integrityImpact: "Integrity Impact (1-5)",
  availabilityImpact: "Availability Impact (1-5)",
  calculatedImpact: "Calculated Impact",
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
  peakPeriod: "Peak / Critical Period",
  peopleDependency: "Critical People / Role Dependency",
  technologyDependency: "Technology / System Dependency",
  facilityDependency: "Facility / Location Dependency",
  supplierDependency: "Supplier Dependency",
  regulatoryDeadline: "Regulatory Deadline",
  recoveryStrategy: "Recovery Strategy",
  singlePointOfFailure: "Single Point of Failure",
  approver: "BIA Approver",
  approvalDate: "BIA Approval Date",
  assetId: "Asset Inventory ID",
  custodian: "Asset Custodian",
  vendor: "Manufacturer / Vendor",
  confidentialityRating: "Confidentiality Value (1-5)",
  integrityRating: "Integrity Value (1-5)",
  availabilityRating: "Availability Value (1-5)",
  regulatoryScope: "Legal / Regulatory Scope",
  retentionPeriod: "Retention Period",
  version: "Version / Model",
  lifecycleStage: "Lifecycle Stage",
  acquisitionDate: "Acquisition / Go-live Date",
  encryptionStatus: "Encryption Status",
  accessReviewStatus: "Access Review",
  patchStatus: "Patch Status",
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
  frameworkTemplate: "Framework Şablonu",
  scopeCategory: "SOC 2 Kapsam Kategorisi",
  designEffectiveness: "Tasarım Etkinliği",
  operatingEffectiveness: "Operasyonel Etkinlik",
  expectedEvidence: "Beklenen Kanıt / Doküman",
  typeIITestApproach: "Type II Test Yaklaşımı",
  testOwner: "Kontrol Test Sorumlusu",
  testDate: "Kontrol Test Tarihi",
  populationSize: "Popülasyon Büyüklüğü",
  sampleSize: "Örneklem Sayısı",
  exceptions: "İstisna Sayısı",
  auditorResult: "Denetçi Sonucu",
  followUpOwner: "Takip Eden / Koordinatör",
  lastAssessment: "Son Değerlendirme",
  nextAssessment: "Sonraki Değerlendirme",
  evidenceOwner: "Kanıt Sorumlusu",
  reviewStatus: "İnceleme Durumu",
  reviewer: "İnceleyen",
  collectedAt: "Toplanma Tarihi",
  expiresAt: "Geçerlilik Bitişi",
  sourceSystem: "Kaynak Sistem",
  dataAccess: "Veri Erişim Seviyesi",
  hostingLocation: "Barındırma Lokasyonu",
  incidentSla: "Olay Bildirim SLA",
  exitPlan: "Çıkış / Geçiş Planı",
  riskTreatment: "Tedarikçi Risk Aksiyonu",
  controlType: "Kontrol Türü",
  controlObjective: "Kontrol Hedefi",
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
  frameworkTemplate: "Framework Template",
  scopeCategory: "SOC 2 Scope Category",
  designEffectiveness: "Design Effectiveness",
  operatingEffectiveness: "Operating Effectiveness",
  expectedEvidence: "Expected Evidence / Document",
  typeIITestApproach: "Type II Test Approach",
  testOwner: "Control Test Owner",
  testDate: "Control Test Date",
  populationSize: "Population Size",
  sampleSize: "Sample Size",
  exceptions: "Exception Count",
  auditorResult: "Auditor Result",
  followUpOwner: "Follower / Coordinator",
  lastAssessment: "Last Assessment",
  nextAssessment: "Next Assessment",
  evidenceOwner: "Evidence Owner",
  reviewStatus: "Review Status",
  reviewer: "Reviewer",
  collectedAt: "Collected At",
  expiresAt: "Expiry Date",
  sourceSystem: "Source System",
  dataAccess: "Data Access Level",
  hostingLocation: "Hosting Location",
  incidentSla: "Incident Notification SLA",
  exitPlan: "Exit / Transition Plan",
  riskTreatment: "Vendor Risk Treatment",
  controlType: "Control Type",
  controlObjective: "Control Objective",
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
    "confidentialityImpact",
    "integrityImpact",
    "availabilityImpact",
    "calculatedImpact",
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
    "processCategory",
    "description",
    "businessUnit",
    "owner",
    "criticality",
    "asset",
    "dependencies",
    "peakPeriod",
    "peopleDependency",
    "technologyDependency",
    "facilityDependency",
    "supplierDependency",
    "regulatoryDeadline",
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
    "recoveryStrategy",
    "singlePointOfFailure",
    "drStatus",
    "lastTestDate",
    "testResult",
    "nextTestDate",
    "lastReview",
    "nextReview",
    "approver",
    "approvalDate",
  ],
  "Varlık Envanteri": [
    "title",
    "assetId",
    "assetType",
    "description",
    "businessUnit",
    "owner",
    "technicalOwner",
    "custodian",
    "vendor",
    "criticality",
    "dataClassification",
    "confidentialityRating",
    "integrityRating",
    "availabilityRating",
    "regulatoryScope",
    "retentionPeriod",
    "environment",
    "location",
    "version",
    "lifecycleStage",
    "acquisitionDate",
    "ip",
    "internetFacing",
    "personalData",
    "criticalService",
    "eolDate",
    "backupStatus",
    "edrStatus",
    "siemStatus",
    "vulnScan",
    "encryptionStatus",
    "accessReviewStatus",
    "patchStatus",
    "dependencies",
    "processLink",
    "status",
    "lastReview",
    "nextReview",
  ],
  Uyum: [
    "framework",
    "controlRef",
    "controlTitle",
    "businessUnit",
    "owner",
    "followUpOwner",
    "implementation",
    "evidenceStatus",
    "lastAssessment",
    "nextAssessment",
    "dueDate",
    "status",
    "notes",
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
    "dataAccess",
    "hostingLocation",
    "lastAssessment",
    "nextAssessment",
    "incidentSla",
    "exitPlan",
    "riskTreatment",
    "status",
  ],
  Kontroller: [
    "controlRef",
    "controlTitle",
    "description",
    "businessUnit",
    "owner",
    "controlType",
    "controlObjective",
    "frequency",
    "evidenceOwner",
    "testOwner",
    "lastTestDate",
    "nextTestDate",
    "testResult",
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
    "sourceSystem",
    "collectedAt",
    "expiresAt",
    "reviewer",
    "reviewStatus",
    "notes",
  ],
  "Denetim Yönetimi": [
    "auditName",
    "auditType",
    "frameworkTemplate",
    "auditor",
    "auditOwner",
    "startDate",
    "endDate",
    "requirementRef",
    "requirementTitle",
    "scopeCategory",
    "owner",
    "followUpOwner",
    "businessUnit",
    "designEffectiveness",
    "operatingEffectiveness",
    "dueDate",
    "status",
    "progress",
    "evidenceStatus",
    "expectedEvidence",
    "typeIITestApproach",
    "testOwner",
    "testDate",
    "populationSize",
    "sampleSize",
    "exceptions",
    "auditorResult",
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
let catalogOptions: CatalogMap = Object.fromEntries(
  Object.entries(defaultCatalogs).map(([key, values]) => [key, [...values]]),
) as CatalogMap;
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
  Stratejik: "Strategic",
  "Kurumsal Yönetim": "Corporate Governance",
  "Sermaye Piyasaları ve KAP": "Capital Markets and Public Disclosure",
  "Hukuk ve Regülasyon": "Legal and Regulatory",
  "Finansal Raporlama ve İç Kontrol":
    "Financial Reporting and Internal Control",
  Finansal: "Financial",
  "Hazine ve Likidite": "Treasury and Liquidity",
  Vergi: "Tax",
  "İnsan Kaynakları": "Human Resources",
  Operasyonel: "Operational",
  "Bilgi Teknolojileri": "Information Technology",
  "Siber Güvenlik": "Cybersecurity",
  "Bilgi Güvenliği": "Information Security",
  "Veri Yönetimi ve Yapay Zekâ": "Data Management and AI",
  "Kişisel Verilerin Korunması": "Privacy and Personal Data Protection",
  "Üçüncü Taraf ve Tedarik Zinciri": "Third Party and Supply Chain",
  "İş Sürekliliği ve Kriz Yönetimi":
    "Business Continuity and Crisis Management",
  "Suistimal, Etik ve Yolsuzluk": "Fraud, Ethics and Anti-Corruption",
  İtibar: "Reputation",
  "Proje ve Değişiklik Yönetimi": "Project and Change Management",
  "Fiziksel Güvenlik": "Physical Security",
  "İş Sağlığı ve Güvenliği": "Occupational Health and Safety",
  "ESG, Sürdürülebilirlik ve İklim": "ESG, Sustainability and Climate",
  "Müşteri ve Ürün": "Customer and Product",
  "Pazar ve Rekabet": "Market and Competition",
};
const display = (v: any, lang: Lang) =>
  lang === "en" ? valueEN[String(v)] || v : v;
function score(r: Row) {
  return calculatedRiskScore(r.data);
}
function inherentScore(r: Row) {
  return calculatedRiskScore(r.data);
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
    .map((x) =>
      x
        .map((v) => `"${safeSpreadsheetCell(v).replaceAll('"', '""')}"`)
        .join(";"),
    )
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
    try {
      const r = await fetch(withBasePath("/api/auth"), { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Kimlik servisine ulaşılamadı.");
      setState(j);
      setError("");
    } catch (e) {
      setState({ loadFailed: true });
      setError(
        e instanceof Error ? e.message : "Kimlik servisine ulaşılamadı.",
      );
    }
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
  async function demoLogin() {
    setError("");
    const r = await fetch(withBasePath("/api/auth"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "demo_login" }),
      }),
      j = await r.json();
    if (!r.ok) setError(j.error || "Demo hesabıyla giriş başarısız.");
    else check();
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
  if (state.loadFailed)
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-mark">F</div>
          <small>FORNOST GRC</small>
          <h1>Oturum hazırlanamadı</h1>
          <p>
            Kimlik servisi geçici olarak yanıt veremedi. Birkaç saniye sonra
            tekrar deneyin.
          </p>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="primary"
            onClick={() => {
              setState(null);
              check();
            }}
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
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
            <span className="active">
              <b>1</b> Yönetici
            </span>
            <span>
              <b>2</b> Giriş
            </span>
            <span>
              <b>3</b> Ayarlar
            </span>
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
              state.bootstrapRequired && !showLogin
                ? "new-password"
                : "current-password"
            }
          />
        </label>
        {state.bootstrapRequired && !showLogin && (
          <em>En az 12 karakter; büyük/küçük harf, sayı ve özel karakter.</em>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="primary">
          {state.bootstrapRequired && !showLogin
            ? "Yönetici Hesabını Oluştur"
            : "Giriş Yap"}
        </button>
        {state.demoAccount && (
          <div className="demo-login-box">
            <b>Demo Editor Hesabı</b>
            <span>{state.demoAccount.email}</span>
            <button type="button" className="ghost" onClick={demoLogin}>
              Demo Hesapla Giriş Yap
            </button>
          </div>
        )}
        {state.bootstrapRequired && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => setShowLogin((x) => !x)}
          >
            {showLogin
              ? "İlk yönetici oluşturma ekranına dön"
              : "Mevcut yerel hesapla giriş yap"}
          </button>
        )}
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
    [auditPortfolio, setAuditPortfolio] = useState<AuditPortfolioItem[]>([]),
    [columnPickerOpen, setColumnPickerOpen] = useState(false),
    [filterPanelOpen, setFilterPanelOpen] = useState(false),
    [columnPreferences, setColumnPreferences] = useState<
      Record<string, string[]>
    >({}),
    [registerFilters, setRegisterFilters] = useState<Record<string, string>>(
      {},
    ),
    [catalogs, setCatalogs] = useState<CatalogMap>(catalogOptions),
    [theme, setTheme] = useState<"light" | "dark">("dark");
  const labels = labelMap[lang],
    u = ui[lang];
  linkedRows = rows;
  catalogOptions = catalogs;
  useEffect(() => {
    const saved = localStorage.getItem("fornost-grc-language");
    if (saved === "tr" || saved === "en") setLang(saved);
    try {
      const columns = JSON.parse(
        localStorage.getItem("fornost-grc-columns") || "{}",
      );
      if (columns && typeof columns === "object") setColumnPreferences(columns);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem("fornost-grc-language", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const saved = localStorage.getItem("fornost-grc-theme");
    setTheme(saved === "dark" || saved === "light" ? saved : "dark");
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
        setRows(
          Array.isArray(j.rows)
            ? j.rows.map((x: any) => ({
                ...x,
                data: JSON.parse(x.data_json),
                createdAt: x.createdAt || x.created_at,
                updatedAt: x.updatedAt || x.updated_at,
              }))
            : [],
        );
      }
    } catch {}
  }
  async function loadCatalogs() {
    try {
      const response = await fetch(withBasePath("/api/catalogs"), {
        cache: "no-store",
      });
      if (response.ok) setCatalogs((await response.json()).catalogs);
    } catch {}
  }
  async function loadAudits() {
    try {
      const response = await fetch(withBasePath("/api/audits"), {
        cache: "no-store",
      });
      if (response.ok) setAuditPortfolio((await response.json()).audits || []);
    } catch {}
  }
  useEffect(() => {
    loadAudits().then(load);
    loadCatalogs();
  }, []);
  useEffect(() => {
    setRegisterFilters({});
    setColumnPickerOpen(false);
    setFilterPanelOpen(false);
    setQuery("");
  }, [active]);
  const selectedColumnKeys =
    columnPreferences[active] || defaultRegisterColumnKeys(active);
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
            ) &&
          Object.entries(registerFilters).every(
            ([key, value]) => !value || String(r.data[key] ?? "") === value,
          ),
      ),
    [rows, active, query, lang, selectedAudit, registerFilters],
  );
  function setModuleColumns(keys: string[]) {
    if (!keys.length) return;
    const next = { ...columnPreferences, [active]: keys };
    setColumnPreferences(next);
    localStorage.setItem("fornost-grc-columns", JSON.stringify(next));
  }
  function changeLang(next: Lang) {
    setLang(next);
  }
  function openNew(seed: Record<string, any> = {}) {
    setEditing(null);
    const next = empty(active);
    if (active === "Denetim Yönetimi" && selectedAudit) {
      next.auditName = selectedAudit;
      next.auditType = auditKind(selectedAudit);
      next.progress = "0";
      next.status = "Başlanmadı";
      next.evidenceStatus = "Kanıt Bekleniyor";
    }
    Object.assign(next, seed);
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
    const r = await fetch(withBasePath(`/api/grc?id=${id}`), {
      method: "DELETE",
    });
    if (r.ok) {
      await load();
      setNotice(lang === "tr" ? "Kayıt silindi." : "Record deleted.");
      return;
    }
    const j = await r.json().catch(() => ({}));
    setNotice(
      j.error ||
        (lang === "tr" ? "Kayıt silinemedi." : "Record could not be deleted."),
    );
  }
  async function createAudit(input: {
    name: string;
    template: string;
    auditType: string;
    auditor: string;
    auditOwner: string;
  }) {
    const response = await fetch(withBasePath("/api/audits"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(
        result.error ||
          (lang === "tr"
            ? "Denetim oluşturulamadı."
            : "Audit could not be created."),
      );
      return false;
    }
    await Promise.all([load(), loadAudits()]);
    setSelectedAudit(input.name);
    setNotice(
      lang === "tr"
        ? "Denetim portföye eklendi."
        : "Audit added to the portfolio.",
    );
    return true;
  }
  async function deleteAudit(audit: AuditPortfolioItem) {
    if (
      !confirm(
        lang === "tr"
          ? `“${audit.name}” denetimi ve içindeki tüm maddeler silinsin mi? Bu işlem yönetici arşivine kaydedilir.`
          : `Delete “${audit.name}” and all of its requirements? This action is retained in the administrator archive.`,
      )
    )
      return;
    const response = await fetch(
      withBasePath(`/api/audits?id=${encodeURIComponent(audit.id)}`),
      { method: "DELETE" },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(
        result.error ||
          (lang === "tr"
            ? "Denetim silinemedi."
            : "Audit could not be deleted."),
      );
      return;
    }
    setSelectedAudit("");
    await Promise.all([load(), loadAudits()]);
    setNotice(
      lang === "tr"
        ? `Denetim ve ${result.deletedRequirements || 0} maddesi silindi.`
        : `Audit and ${result.deletedRequirements || 0} requirements deleted.`,
    );
  }
  async function createTicket(row: Row) {
    const response = await fetch(withBasePath("/api/integrations"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "ticketing",
        action: "create-ticket",
        sourceId: row.id,
        title: `[Fornost GRC] ${row.data.requirementRef || row.id} - ${row.data.requirementTitle || row.data.title || "GRC Aksiyonu"}`,
        description: [row.data.finding, row.data.responsibleNote]
          .filter(Boolean)
          .join("\n\n"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(
        result.error ||
          (lang === "tr"
            ? "Ticket oluşturulamadı."
            : "Ticket could not be created."),
      );
      return;
    }
    const ticketRef = String(result.id || "created"),
      ticketUrl = String(result.url || "");
    const update = await fetch(withBasePath("/api/grc"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        module: row.module,
        data: { ...row.data, ticketRef, ticketUrl, ticketStatus: "Open" },
      }),
    });
    if (update.ok) await load();
    setNotice(
      lang === "tr"
        ? `Ticket oluşturuldu: ${ticketRef}`
        : `Ticket created: ${ticketRef}`,
    );
  }
  async function uploadEvidence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch(withBasePath("/api/evidence"), {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    const result = await r.json().catch(() => ({}));
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
        String(result.error || (lang === "tr"
          ? "Kanıt yüklenemedi. Dosya türünü ve 10 MB sınırını kontrol edin."
          : "Evidence could not be uploaded. Check the file type and 10 MB limit.")),
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
  const navGroups = [
    { label: lang === "tr" ? "KOMUTA" : "COMMAND", items: modules.slice(0, 1) },
    {
      label: lang === "tr" ? "GRC OPERASYONLARI" : "GRC OPERATIONS",
      items: modules.slice(1, 8),
    },
    { label: lang === "tr" ? "İÇGÖRÜ" : "INSIGHTS", items: ["Raporlar"] },
    ...(currentUser.role === "Admin"
      ? [
          {
            label: lang === "tr" ? "AYARLAR" : "SETTINGS",
            items: modules.filter((m) => adminModules.has(m)),
          },
        ]
      : []),
  ];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>F</span>
          <div>
            <b>Fornost GRC</b>
            <small>Governance Intelligence</small>
          </div>
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <small>{group.label}</small>
              {group.items.map((m) => {
                return (
                  <button
                    className={active === m ? "active" : ""}
                    onClick={() => {
                      setActive(m);
                      setQuery("");
                      setNotice("");
                    }}
                    key={m}
                  >
                    <i>
                      <NavIcon module={m} />
                    </i>
                    <span>{names[lang][m]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="aside-note">
          <div className="platform-state">
            <i />
            {lang === "tr" ? "Tüm sistemler aktif" : "All systems operational"}
          </div>
          <b>
            {lang === "tr" ? "Kurumsal çalışma alanı" : "Enterprise workspace"}
          </b>
          <p>
            {lang === "tr"
              ? "Risk, uyum ve kanıt verileri anlık güncel."
              : "Risk, compliance and evidence data is current."}
          </p>
        </div>
      </aside>
      <main>
        <header>
          <div className="header-context">
            <small>FORNOST / {u.workspace}</small>
            <h1>{names[lang][active]}</h1>
          </div>
          <div className="header-actions">
            <div className="header-live">
              <i />
              {lang === "tr" ? "Canlı veri" : "Live data"}
            </div>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={
                theme === "dark"
                  ? lang === "tr"
                    ? "Açık temaya geç"
                    : "Switch to light theme"
                  : lang === "tr"
                    ? "Koyu temaya geç"
                    : "Switch to dark theme"
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
        ) : adminModules.has(active) ? (
          <Settings
            lang={lang}
            currentUser={currentUser}
            catalogs={catalogs}
            onCatalogChange={loadCatalogs}
            page={
              active === "Ana Veri Yönetimi"
                ? "catalogs"
                : active === "İş Akışı Entegrasyonları"
                  ? "workflow"
                  : active === "E-posta ve Bildirimler"
                    ? "email"
                    : active === "Kimlik ve Erişim"
                      ? "identity"
                      : "system"
            }
          />
        ) : active === "Denetim Yönetimi" ? (
          <AuditModule
            rows={by("Denetim Yönetimi")}
            audits={auditPortfolio}
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
            createAudit={createAudit}
            deleteAudit={deleteAudit}
            canDeleteAudit={currentUser.role === "Admin"}
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
                  <button className="primary" onClick={() => openNew()}>
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
              <RegisterToolbar
                module={active}
                lang={lang}
                rows={by(active)}
                resultCount={visible.length}
                query={query}
                setQuery={setQuery}
                selectedColumnKeys={selectedColumnKeys}
                setSelectedColumnKeys={setModuleColumns}
                filters={registerFilters}
                setFilters={setRegisterFilters}
                columnPickerOpen={columnPickerOpen}
                setColumnPickerOpen={setColumnPickerOpen}
                filterPanelOpen={filterPanelOpen}
                setFilterPanelOpen={setFilterPanelOpen}
              />
              <div className="table-wrap">
                {active === "Risk Assessment" ? (
                  <RiskRegister
                    rows={visible}
                    lang={lang}
                    edit={openEdit}
                    remove={remove}
                    columns={selectedColumnKeys}
                    canWrite={currentUser.role !== "Viewer"}
                  />
                ) : (
                  <SmartRegister
                    module={active}
                    rows={visible}
                    lang={lang}
                    edit={openEdit}
                    remove={remove}
                    viewEvidence={setPreviewEvidence}
                    columns={selectedColumnKeys}
                    canWrite={currentUser.role !== "Viewer"}
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
      sheet.slice(1, 1001).forEach((row) => {
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
    confidentialityImpact: scores,
    integrityImpact: scores,
    availabilityImpact: scores,
    confidentialityRating: scores,
    integrityRating: scores,
    availabilityRating: scores,
    financial: scores,
    operational: scores,
    legal: scores,
    reputation: scores,
    customer: scores,
    dataImpact: scores,
    criticality: catalogOptions.criticalities,
    riskLevel: ["Düşük", "Orta", "Yüksek", "Kritik"],
    category: catalogOptions.riskCategories,
    processCategory: catalogOptions.biaCategories,
    assetType: catalogOptions.assetTypes,
    businessUnit: catalogOptions.businessUnits,
    environment: catalogOptions.environments,
    dataClassification: catalogOptions.dataClassifications,
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
    singlePointOfFailure: yesNo,
    backupStatus: coverage,
    edrStatus: coverage,
    siemStatus: coverage,
    vulnScan: coverage,
    encryptionStatus: ["Kapsamda", "Kısmi", "Kapsam Dışı", "Bilinmiyor"],
    accessReviewStatus: ["Güncel", "Gecikmiş", "Planlandı", "Bilinmiyor"],
    patchStatus: ["Güncel", "Gecikmiş", "Muaf", "Bilinmiyor"],
    lifecycleStage: [
      "Planlama",
      "Aktif",
      "Bakım",
      "Kullanımdan Kaldırma",
      "Arşiv",
    ],
    drStatus: ["Mevcut", "Kısmi", "Mevcut Değil", "Bilinmiyor"],
    testResult: ["Başarılı", "Kısmen Başarılı", "Başarısız", "Test Edilmedi"],
    designEffectiveness: [
      "Etkili",
      "Kısmen Etkili",
      "Etkisiz",
      "Test Bekliyor",
    ],
    operatingEffectiveness: [
      "Etkili",
      "Kısmen Etkili",
      "Etkisiz",
      "Test Bekliyor",
    ],
    auditorResult: ["Bekliyor", "Uygun", "İstisnalı", "Uygun Değil"],
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
    u = ui[lang],
    requiredField = [
      "asset",
      "category",
      "processCategory",
      "assetType",
    ].includes(k);
  if (k === "calculatedImpact") {
    const impact = effectiveImpact(form),
      likelihood = Number(form.inherentLikelihood || 0),
      total = likelihood * impact;
    return (
      <div className="wide cia-calculation">
        <div>
          <small>{lang === "tr" ? "GİZLİLİK" : "CONFIDENTIALITY"}</small>
          <b>{form.confidentialityImpact || "—"}</b>
        </div>
        <div>
          <small>{lang === "tr" ? "BÜTÜNLÜK" : "INTEGRITY"}</small>
          <b>{form.integrityImpact || "—"}</b>
        </div>
        <div>
          <small>{lang === "tr" ? "ERİŞİLEBİLİRLİK" : "AVAILABILITY"}</small>
          <b>{form.availabilityImpact || "—"}</b>
        </div>
        <div className="cia-result">
          <small>
            {lang === "tr"
              ? "ETKİN ETKİ / RİSK SKORU"
              : "EFFECTIVE IMPACT / RISK SCORE"}
          </small>
          <b>
            {impact || "—"} / {total || "—"}
          </b>
          <span>
            {total
              ? display(band(total), lang)
              : lang === "tr"
                ? "CIA değerlerini girin"
                : "Enter CIA values"}
          </span>
        </div>
      </div>
    );
  }
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
    "peopleDependency",
    "technologyDependency",
    "facilityDependency",
    "supplierDependency",
    "recoveryStrategy",
    "regulatoryScope",
    "minimumService",
    "requirementTitle",
    "responsibleNote",
    "auditorFeedback",
    "finding",
    "delayReason",
    "expectedEvidence",
    "typeIITestApproach",
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
    "approvalDate",
    "acquisitionDate",
    "testDate",
    "lastAssessment",
    "nextAssessment",
    "collectedAt",
    "expiresAt",
  ];
  const numberFields = [
    "rto",
    "rpo",
    "mtpd",
    "progress",
    "populationSize",
    "sampleSize",
    "exceptions",
  ];
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
    if (k === "asset" && "category" in form) {
      const selected = String(value)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      return (
        <fieldset className="wide asset-multi-picker">
          <legend>{labelMap[lang][k]}</legend>
          <p>
            {lang === "tr"
              ? "Riskten etkilenen bir veya birden fazla varlığı seçin."
              : "Select one or more assets affected by the risk."}
          </p>
          <select
            multiple
            required
            value={selected}
            onChange={(e) =>
              change(
                Array.from(e.currentTarget.selectedOptions)
                  .map((option) => option.value)
                  .join(", "),
              )
            }
          >
            {options.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <small>
            {lang === "tr"
              ? `${selected.length} varlık seçildi · Yeni varlıklar Varlık Envanteri modülünden eklenir.`
              : `${selected.length} assets selected · Add new assets from Asset Inventory.`}
          </small>
        </fieldset>
      );
    }
    return (
      <label>
        {labelMap[lang][k]}
        <select
          required={requiredField}
          value={value}
          onChange={(e) => change(e.target.value)}
        >
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
          required={requiredField}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">{u.select}</option>
          {[
            ...select[k],
            ...(value && !select[k].includes(value) ? [value] : []),
          ].map((x) => (
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
    critical = risks.filter((r) => score(r) >= 17),
    assets = by("Varlık Envanteri"),
    bias = by("BIA"),
    compliance = by("Uyum"),
    vendors = by("Tedarikçiler"),
    evidence = by("Kanıtlar"),
    controls = by("Kontroller"),
    audits = by("Denetim Yönetimi"),
    compliant = compliance.filter((r) => r.data.status === "Uyumlu").length,
    coverage = compliance.length
      ? Math.round((compliant / compliance.length) * 100)
      : 0,
    tr = lang === "tr",
    today = new Date().toISOString().slice(0, 10),
    closed = (status: unknown) =>
      ["Kapalı", "Kapatıldı", "Tamamlandı", "Closed", "Completed"].includes(
        String(status),
      ),
    overdue = audits.filter(
      (r) => r.data.dueDate && r.data.dueDate < today && !closed(r.data.status),
    ).length,
    awaitingEvidence = audits.filter(
      (r) => r.data.evidenceStatus === "Kanıt Bekleniyor",
    ).length,
    highVendors = vendors.filter((r) =>
      ["Yüksek", "Kritik"].includes(String(r.data.riskLevel)),
    ).length,
    linkedControls = new Set(
      evidence.map((r) => r.data.controlRef).filter(Boolean),
    ).size,
    evidenceCoverage = controls.length
      ? Math.min(100, Math.round((linkedControls / controls.length) * 100))
      : 0,
    riskHealth = risks.length
      ? Math.max(
          0,
          Math.round(((risks.length - high.length) / risks.length) * 100),
        )
      : 100,
    posture = Math.round((coverage + evidenceCoverage + riskHealth) / 3),
    riskBands = ["Kritik", "Yüksek", "Orta", "Düşük"].map((level) => ({
      level,
      count: risks.filter((r) => band(score(r)) === level).length,
    })),
    totalRiskBands = Math.max(
      1,
      riskBands.reduce((sum, item) => sum + item.count, 0),
    ),
    attention = [
      {
        value: critical.length,
        label: tr
          ? "Kritik risk karar bekliyor"
          : "Critical risks need decisions",
        module: "Risk Assessment",
        tone: "critical",
      },
      {
        value: overdue,
        label: tr ? "Gecikmiş denetim maddesi" : "Overdue audit requirements",
        module: "Denetim Yönetimi",
        tone: "warning",
      },
      {
        value: awaitingEvidence,
        label: tr
          ? "Kanıt bekleyen denetim maddesi"
          : "Audit items awaiting evidence",
        module: "Denetim Yönetimi",
        tone: "violet",
      },
      {
        value: highVendors,
        label: tr ? "Yüksek riskli tedarikçi" : "High-risk vendors",
        module: "Tedarikçiler",
        tone: "cyan",
      },
    ];
  return (
    <div className="cockpit">
      <section className="cockpit-titlebar">
        <div>
          <small>
            {tr ? "YÖNETİCİ KOMUTA MERKEZİ" : "EXECUTIVE COMMAND CENTER"}
          </small>
          <h2>{tr ? "Kurumsal risk görünümü" : "Enterprise risk posture"}</h2>
          <p>
            {tr
              ? "Öncelikleri belirle, sapmaları gör ve aksiyonları tek görünümden yönet."
              : "Prioritize decisions, surface deviations and manage action from one view."}
          </p>
        </div>
        <div className="cockpit-actions">
          <button onClick={() => go("Risk Assessment")}>
            {tr ? "Risk portföyü" : "Risk portfolio"}
          </button>
          <button className="accent" onClick={() => go("Raporlar")}>
            {tr ? "Yönetim raporu" : "Executive report"}
            <span>↗</span>
          </button>
        </div>
      </section>

      <section className="posture-rail">
        <article className="posture-primary">
          <div
            className="posture-ring"
            style={
              { "--posture": `${posture * 3.6}deg` } as React.CSSProperties
            }
          >
            <div>
              <strong>{posture}</strong>
              <small>/100</small>
            </div>
          </div>
          <div>
            <small>{tr ? "KURUMSAL DURUŞ" : "ENTERPRISE POSTURE"}</small>
            <b>
              {posture >= 75
                ? tr
                  ? "Güçlü"
                  : "Strong"
                : posture >= 50
                  ? tr
                    ? "Gelişiyor"
                    : "Developing"
                  : tr
                    ? "Aksiyon gerekli"
                    : "Action required"}
            </b>
            <span>
              {tr
                ? "Risk, uyum ve kanıt bileşik skoru"
                : "Composite risk, compliance and evidence score"}
            </span>
          </div>
        </article>
        {[
          [
            high.length,
            tr ? "Yüksek risk" : "High risk",
            `${critical.length} ${tr ? "kritik" : "critical"}`,
            "risk",
          ],
          [
            `${coverage}%`,
            tr ? "Uyum sağlığı" : "Compliance health",
            `${compliant}/${compliance.length} ${tr ? "uyumlu" : "compliant"}`,
            "compliance",
          ],
          [
            overdue,
            tr ? "Gecikmiş madde" : "Overdue items",
            `${audits.length} ${tr ? "toplam" : "total"}`,
            "audit",
          ],
          [
            `${evidenceCoverage}%`,
            tr ? "Kanıt kapsaması" : "Evidence coverage",
            `${linkedControls}/${controls.length} ${tr ? "kontrol" : "controls"}`,
            "evidence",
          ],
        ].map(([value, label, detail, tone]) => (
          <article className={`rail-metric ${tone}`} key={String(label)}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{detail}</span>
            <i />
          </article>
        ))}
      </section>

      <section className="cockpit-grid">
        <div className="cockpit-panel exposure-panel">
          <PanelHead
            eyebrow={tr ? "RİSK MARUZİYETİ" : "RISK EXPOSURE"}
            title={tr ? "Portföy yoğunluğu" : "Portfolio concentration"}
            action={tr ? "Tüm riskler" : "All risks"}
            onClick={() => go("Risk Assessment")}
          />
          <div className="exposure-body">
            <div className="exposure-total">
              <small>{tr ? "TOPLAM RİSK" : "TOTAL RISKS"}</small>
              <strong>{risks.length}</strong>
              <span>
                {tr
                  ? `${high.length} kayıt tolerans üzerinde`
                  : `${high.length} records above tolerance`}
              </span>
            </div>
            <div
              className="risk-stack"
              aria-label={tr ? "Risk dağılımı" : "Risk distribution"}
            >
              {riskBands.map((item) => (
                <i
                  key={item.level}
                  className={item.level.toLowerCase()}
                  style={{ width: `${(item.count / totalRiskBands) * 100}%` }}
                />
              ))}
            </div>
            <div className="risk-legend">
              {riskBands.map((item) => (
                <div key={item.level}>
                  <i className={item.level.toLowerCase()} />
                  <span>{display(item.level, lang)}</span>
                  <b>{item.count}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="priority-table">
            <div className="priority-head">
              <span>{tr ? "ÖNCELİKLİ RİSK" : "PRIORITY RISK"}</span>
              <span>{tr ? "SAHİP" : "OWNER"}</span>
              <span>{tr ? "SKOR" : "SCORE"}</span>
            </div>
            {high
              .sort((a, b) => score(b) - score(a))
              .slice(0, 4)
              .map((r) => (
                <button key={r.id} onClick={() => go("Risk Assessment")}>
                  <span>
                    <b>{r.data.title}</b>
                    <small>
                      {r.data.businessUnit ||
                        (tr ? "İş birimi yok" : "No business unit")}
                    </small>
                  </span>
                  <span>{r.data.owner || "—"}</span>
                  <em className={band(score(r)).toLowerCase()}>{score(r)}</em>
                </button>
              ))}
            {!high.length && (
              <div className="cockpit-empty">
                {tr
                  ? "Tolerans üzerinde risk bulunmuyor."
                  : "No risks are above tolerance."}
              </div>
            )}
          </div>
        </div>

        <div className="cockpit-panel attention-panel">
          <PanelHead
            eyebrow={tr ? "KARAR KUYRUĞU" : "DECISION QUEUE"}
            title={
              tr ? "Yönetim dikkati gerekenler" : "Items requiring attention"
            }
            badge={attention.reduce((sum, item) => sum + item.value, 0)}
          />
          <div className="attention-queue">
            {attention.map((item) => (
              <button key={item.label} onClick={() => go(item.module)}>
                <strong className={item.tone}>{item.value}</strong>
                <span>
                  <b>{item.label}</b>
                  <small>
                    {tr ? "İncele ve aksiyon al" : "Review and take action"}
                  </small>
                </span>
                <em>→</em>
              </button>
            ))}
          </div>
        </div>

        <div className="cockpit-panel assurance-panel">
          <PanelHead
            eyebrow={tr ? "GÜVENCE" : "ASSURANCE"}
            title={
              tr ? "Kontrol ve kanıt sağlığı" : "Control and evidence health"
            }
            action={tr ? "Kanıt kasası" : "Evidence vault"}
            onClick={() => go("Kanıtlar")}
          />
          <div className="assurance-bars">
            {[
              [
                tr ? "Uyum kapsamı" : "Compliance coverage",
                coverage,
                `${compliant}/${compliance.length}`,
              ],
              [
                tr ? "Kanıt kapsaması" : "Evidence coverage",
                evidenceCoverage,
                `${linkedControls}/${controls.length}`,
              ],
              [
                tr ? "Risk sağlığı" : "Risk health",
                riskHealth,
                `${risks.length - high.length}/${risks.length}`,
              ],
            ].map(([label, value, fraction]) => (
              <div key={String(label)}>
                <span>
                  <b>{label}</b>
                  <em>{fraction}</em>
                </span>
                <i>
                  <strong style={{ width: `${value}%` }} />
                </i>
                <small>{value}%</small>
              </div>
            ))}
          </div>
          <div className="assurance-foot">
            <span>
              {controls.length}
              <small>{tr ? "Kontrol" : "Controls"}</small>
            </span>
            <span>
              {evidence.length}
              <small>{tr ? "Kanıt" : "Evidence"}</small>
            </span>
            <span>
              {vendors.length}
              <small>{tr ? "Tedarikçi" : "Vendors"}</small>
            </span>
          </div>
        </div>

        <div className="cockpit-panel resilience-panel">
          <PanelHead
            eyebrow={tr ? "DAYANIKLILIK" : "RESILIENCE"}
            title={tr ? "Kritik iş hizmetleri" : "Critical business services"}
            action="BIA"
            onClick={() => go("BIA")}
          />
          <div className="resilience-list">
            {bias
              .filter((r) => r.data.criticality === "Kritik")
              .slice(0, 4)
              .map((r) => (
                <button key={r.id} onClick={() => go("BIA")}>
                  <span>
                    <b>{r.data.process}</b>
                    <small>{r.data.owner || "—"}</small>
                  </span>
                  <em>
                    RTO <b>{r.data.rto || "—"}h</b>
                  </em>
                </button>
              ))}
          </div>
          {!bias.filter((r) => r.data.criticality === "Kritik").length && (
            <div className="cockpit-empty">
              {tr
                ? "Kritik süreç kaydı bulunmuyor."
                : "No critical process records."}
            </div>
          )}
        </div>
      </section>

      <section className="workspace-launcher">
        <div>
          <small>{tr ? "ÇALIŞMA ALANLARI" : "WORKSPACES"}</small>
          <b>{tr ? "Operasyona geç" : "Move to operations"}</b>
        </div>
        {[
          [
            "Risk Assessment",
            tr ? "Risk Merkezi" : "Risk Center",
            risks.length,
          ],
          [
            "Denetim Yönetimi",
            tr ? "Denetim Merkezi" : "Audit Center",
            audits.length,
          ],
          ["Kanıtlar", tr ? "Kanıt Kasası" : "Evidence Vault", evidence.length],
          [
            "Tedarikçiler",
            tr ? "Tedarikçi Riski" : "Vendor Risk",
            vendors.length,
          ],
        ].map(([module, label, count], index) => (
          <button key={String(module)} onClick={() => go(String(module))}>
            <i>0{index + 1}</i>
            <span>
              <b>{label}</b>
              <small>
                {count} {tr ? "kayıt" : "records"}
              </small>
            </span>
            <em>↗</em>
          </button>
        ))}
      </section>
      <div className="cockpit-footnote">
        {tr
          ? `${assets.length} varlık · ${bias.length} süreç · ${controls.length} kontrol · anlık hesaplanır`
          : `${assets.length} assets · ${bias.length} processes · ${controls.length} controls · calculated live`}
      </div>
    </div>
  );
}
function PanelHead({
  eyebrow,
  title,
  action,
  onClick,
  badge,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <div className="cockpit-panel-head">
      <div>
        <small>{eyebrow}</small>
        <h3>{title}</h3>
      </div>
      {action ? (
        <button onClick={onClick}>
          {action} <span>→</span>
        </button>
      ) : (
        <b>{badge}</b>
      )}
    </div>
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
    tr = lang === "tr",
    widths = useColumnWidths("Raporlar");
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
      [tr ? "Modül" : "Module"]: names[lang][r.module] || r.module,
      ...Object.fromEntries(
        Object.entries(r.data).map(([k, v]) => [labels[k] || k, v]),
      ),
    }));
    const keys = [...new Set(data.flatMap((row) => Object.keys(row)))];
    await writeXlsxFile([
      keys.map((key) => ({ value: key, fontWeight: "bold" as const })),
      ...data.map((row) =>
        keys.map((key) => ({ value: safeSpreadsheetCell(row[key]) })),
      ),
    ]).toFile(
      `Fornost-GRC-${tr ? "Raporu" : "Report"}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
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
            onClick={() =>
              csvDownload("Fornost-GRC-Report.csv", filtered, lang)
            }
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
            <colgroup>
              {["module","title","businessUnit","owner","status","level"].map((key) => <col key={key} style={{ width: widths.width(key) }} />)}
            </colgroup>
            <thead>
              <tr>
                {[
                  ["module", tr ? "Modül" : "Module"],
                  ["title", tr ? "Başlık" : "Title"],
                  ["businessUnit", tr ? "İş Birimi" : "Business Unit"],
                  ["owner", tr ? "Sahip" : "Owner"],
                  ["status", tr ? "Durum" : "Status"],
                  ["level", tr ? "Seviye" : "Level"],
                ].map(([key, label]) => (
                  <ResizableTh key={key} columnKey={key} widths={widths}>{label}</ResizableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 250).map((r) => (
                <tr key={r.id}>
                  <td>{names[lang][r.module] || r.module}</td>
                  <td>
                    {r.data.title ||
                      r.data.process ||
                      r.data.controlTitle ||
                      r.data.requirementTitle ||
                      r.data.requirementRef ||
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
          effectiveImpact(r.data) === i,
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
        <b className="axis x">{tr ? "Hesaplanan Etki" : "Calculated Impact"}</b>
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
  columns,
  canWrite = true,
}: {
  rows: Row[];
  lang: Lang;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  columns: string[];
  canWrite?: boolean;
}) {
  const u = ui[lang],
    cols = getAvailableRegisterColumns("Risk Assessment").filter((c) =>
      columns.includes(c.key),
    ), widths = useColumnWidths("Risk Assessment");
  return (
    <table className="risk-table">
      <colgroup>
        <col style={{ width: widths.width("recordCode", 130) }} />
        {cols.map((c) => <col key={c.key} style={{ width: widths.width(c.key) }} />)}
        {canWrite && <col style={{ width: 120 }} />}
      </colgroup>
      <thead>
        <tr>
          <ResizableTh columnKey="recordCode" widths={widths}>{lang === "tr" ? "Kod" : "Code"}</ResizableTh>
          {cols.map((c) => (
            <ResizableTh key={c.key} columnKey={c.key} widths={widths}>{c[lang]}</ResizableTh>
          ))}
          {canWrite && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onDoubleClick={() => canWrite && edit(r)}>
            <td>
              <b className="code">{r.id}</b>
            </td>
            {cols.map((c) => (
              <td key={c.key}>
                <RiskRegisterCell row={r} column={c.key} lang={lang} />
              </td>
            ))}
            {canWrite && (
              <td>
                <div className="row-actions">
                  <button onClick={() => edit(r)}>{u.edit}</button>
                  <button onClick={() => remove(r.id)}>{u.delete}</button>
                </div>
              </td>
            )}
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={cols.length + (canWrite ? 2 : 1)} className="empty">
              {u.empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

type ColumnWidthController = {
  width: (key: string, fallback?: number) => number;
  begin: (key: string, event: ReactPointerEvent<HTMLSpanElement>) => void;
  nudge: (key: string, delta: number) => void;
};
function useColumnWidths(scope: string): ColumnWidthController {
  const storageKey = `fornost-grc-column-widths:${scope}`;
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setValues(JSON.parse(localStorage.getItem(storageKey) || "{}")); } catch { setValues({}); }
  }, [storageKey]);
  const save = (key: string, next: number) => setValues((current) => {
    const updated = { ...current, [key]: Math.max(96, Math.min(640, Math.round(next))) };
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return updated;
  });
  return {
    width: (key, fallback = 190) => values[key] || fallback,
    begin: (key, event) => {
      event.preventDefault();
      const startX = event.clientX, startWidth = values[key] || 190;
      const move = (e: PointerEvent) => save(key, startWidth + e.clientX - startX);
      const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); document.body.classList.remove("resizing-columns"); };
      document.body.classList.add("resizing-columns");
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true });
    },
    nudge: (key, delta) => save(key, (values[key] || 190) + delta),
  };
}
function ResizableTh({ columnKey, widths, children }: { columnKey: string; widths: ColumnWidthController; children: ReactNode }) {
  return <th className="resizable-column"><span>{children}</span><span className="column-resizer" role="separator" aria-label={`${String(children)} sütun genişliği`} aria-orientation="vertical" tabIndex={0} onPointerDown={(e) => widths.begin(columnKey, e)} onKeyDown={(e) => { if (e.key === "ArrowLeft") widths.nudge(columnKey, -16); if (e.key === "ArrowRight") widths.nudge(columnKey, 16); }} /></th>;
}
function RiskRegisterCell({
  row,
  column,
  lang,
}: {
  row: Row;
  column: string;
  lang: Lang;
}) {
  const d = row.data,
    tr = lang === "tr";
  if (column === "title")
    return (
      <div className="stack title-stack">
        <b>{d.title || "—"}</b>
        <small>{d.asset || d.processLink || ""}</small>
      </div>
    );
  if (column === "inherentRisk") {
    const likelihood = Number(d.inherentLikelihood || d.likelihood || 0),
      impact = effectiveImpact(d);
    return (
      <>
        <RiskScore
          l={likelihood}
          i={impact}
          n={likelihood * impact}
          lang={lang}
        />
        <small className="cia-summary">
          {tr ? "G/B/E" : "C/I/A"}: {d.confidentialityImpact || "—"} /{" "}
          {d.integrityImpact || "—"} / {d.availabilityImpact || "—"}
        </small>
      </>
    );
  }
  if (column === "updatedAt" || column === "createdAt")
    return (
      <DateTimeCell
        value={column === "updatedAt" ? row.updatedAt : row.createdAt}
        lang={lang}
      />
    );
  if (["status", "treatment", "category"].includes(column))
    return <StatusPill value={d[column]} lang={lang} />;
  return display(d[column], lang) || "—";
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
  audits,
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
  createAudit,
  deleteAudit,
  canDeleteAudit,
}: {
  rows: Row[];
  audits: AuditPortfolioItem[];
  visible: Row[];
  selected: string;
  select: (x: string) => void;
  lang: Lang;
  query: string;
  setQuery: (x: string) => void;
  openNew: (seed?: Record<string, any>) => void;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  openImport: () => void;
  canWrite: boolean;
  createAudit: (input: {
    name: string;
    template: string;
    auditType: string;
    auditor: string;
    auditOwner: string;
  }) => Promise<boolean>;
  deleteAudit: (audit: AuditPortfolioItem) => Promise<void>;
  canDeleteAudit: boolean;
}) {
  const tr = lang === "tr",
    actual = [
      ...new Set(
        rows.map((r) => String(r.data.auditName || "")).filter(Boolean),
      ),
    ],
    templateOptions = [...new Set([...auditCatalog, ...actual])],
    [pickerOpen, setPickerOpen] = useState(false),
    [auditDraft, setAuditDraft] = useState({
      template: auditCatalog[0],
      name: auditCatalog[0],
      auditType: auditKind(auditCatalog[0]),
      auditor: "",
      auditOwner: "",
    }),
    [savingAudit, setSavingAudit] = useState(false);
  const portfolioNames = new Set(audits.map((audit) => audit.name)),
    portfolioRows = rows.filter((row) =>
      portfolioNames.has(String(row.data.auditName || "")),
    );
  async function submitAudit(event: FormEvent) {
    event.preventDefault();
    setSavingAudit(true);
    const ok = await createAudit(auditDraft);
    setSavingAudit(false);
    if (ok) setPickerOpen(false);
  }
  function chooseTemplate(template: string) {
    const custom = template === "Özel Denetim" || template === "Custom Audit";
    setAuditDraft((current) => ({
      ...current,
      template,
      name: custom ? "" : template,
      auditType: custom ? "Diğer Denetim" : auditKind(template),
    }));
  }
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
              <button className="primary" onClick={() => setPickerOpen(true)}>
                {tr ? "+ Yeni Denetim" : "+ New Audit"}
              </button>
            )}
          </div>
        </section>
        <AuditOverview rows={portfolioRows} lang={lang} />
        <section className="audit-portfolio">
          {!audits.length && (
            <div className="audit-portfolio-empty">
              <b>{tr ? "Portföy henüz boş" : "The portfolio is empty"}</b>
              <p>
                {tr
                  ? "Hazır kartlar otomatik eklenmez. Bir standart şablonu seçin veya özel denetim oluşturun."
                  : "Template cards are not added automatically. Choose a standard template or create a custom audit."}
              </p>
              {canWrite && (
                <button className="primary" onClick={() => setPickerOpen(true)}>
                  {tr ? "Denetim Seç ve Ekle" : "Choose and Add Audit"}
                </button>
              )}
            </div>
          )}
          {audits.map((audit) => {
            const name = audit.name;
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
              <article className="audit-card" key={audit.id}>
                <button
                  className="audit-card-open"
                  onClick={() => select(name)}
                >
                  <div className="audit-card-top">
                    <span>
                      {name.startsWith("ISO")
                        ? "ISO"
                        : name.startsWith("SOC")
                          ? "SOC"
                          : "AUD"}
                    </span>
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
                    {audit.auditor ||
                      audit.audit_type ||
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
                {canDeleteAudit && (
                  <div className="audit-card-actions">
                    <small>{audit.template}</small>
                    <button
                      className="audit-card-delete"
                      onClick={() => deleteAudit(audit)}
                    >
                      {tr ? "Denetimi Sil" : "Delete Audit"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        {pickerOpen && (
          <div
            className="overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPickerOpen(false);
            }}
          >
            <section
              className="modal audit-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="audit-picker-title"
            >
              <div className="modal-head">
                <div>
                  <small>{tr ? "DENETİM PORTFÖYÜ" : "AUDIT PORTFOLIO"}</small>
                  <h2 id="audit-picker-title">
                    {tr ? "Denetim seç ve ekle" : "Choose and add an audit"}
                  </h2>
                </div>
                <button
                  onClick={() => setPickerOpen(false)}
                  aria-label={tr ? "Kapat" : "Close"}
                >
                  ×
                </button>
              </div>
              <form className="form" onSubmit={submitAudit}>
                <label className="wide">
                  {tr ? "Şablon / seçenek" : "Template / option"}
                  <select
                    value={auditDraft.template}
                    onChange={(e) => chooseTemplate(e.target.value)}
                  >
                    {templateOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                    <option>{tr ? "Özel Denetim" : "Custom Audit"}</option>
                  </select>
                </label>
                <label className="wide">
                  {tr ? "Denetim adı" : "Audit name"}
                  <input
                    required
                    minLength={3}
                    maxLength={160}
                    value={auditDraft.name}
                    onChange={(e) =>
                      setAuditDraft({ ...auditDraft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  {tr ? "Denetim türü" : "Audit type"}
                  <input
                    required
                    value={auditDraft.auditType}
                    onChange={(e) =>
                      setAuditDraft({
                        ...auditDraft,
                        auditType: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  {tr ? "Denetim sahibi" : "Audit owner"}
                  <input
                    value={auditDraft.auditOwner}
                    onChange={(e) =>
                      setAuditDraft({
                        ...auditDraft,
                        auditOwner: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="wide">
                  {tr ? "Denetçi / ekip" : "Auditor / team"}
                  <input
                    value={auditDraft.auditor}
                    onChange={(e) =>
                      setAuditDraft({ ...auditDraft, auditor: e.target.value })
                    }
                  />
                </label>
                <p className="audit-picker-note">
                  {tr
                    ? "Seçilen standart portföye kart olarak eklenir ve standart maddeleri çalışma tablosuna otomatik yüklenir."
                    : "The selected standard is added as a portfolio card and its requirements are loaded into the workspace table automatically."}
                </p>
                <div className="form-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setPickerOpen(false)}
                  >
                    {tr ? "Vazgeç" : "Cancel"}
                  </button>
                  <button className="primary" disabled={savingAudit}>
                    {savingAudit
                      ? tr
                        ? "Ekleniyor…"
                        : "Adding…"
                      : tr
                        ? "Portföye Ekle"
                        : "Add to Portfolio"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </>
    );
  const items = visible,
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
            <button className="primary" onClick={() => openNew()}>
              {tr ? "+ Özel Madde" : "+ Custom Item"}
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
      <AuditRequirementsTable
        items={items}
        lang={lang}
        query={query}
        setQuery={setQuery}
        edit={edit}
        remove={remove}
        openNew={openNew}
        canWrite={canWrite}
      />
    </>
  );
}

function AuditRequirementsTable({
  items,
  lang,
  query,
  setQuery,
  edit,
  remove,
  openNew,
  canWrite,
}: {
  items: Row[];
  lang: Lang;
  query: string;
  setQuery: (x: string) => void;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  openNew: (seed?: Record<string, any>) => void;
  canWrite: boolean;
}) {
  const tr = lang === "tr",
    [columns, setColumns] = useState(defaultRegisterColumnKeys("Denetim Yönetimi")),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [columnPickerOpen, setColumnPickerOpen] = useState(false),
    [filterPanelOpen, setFilterPanelOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fornost-grc-columns") || "{}");
      if (Array.isArray(saved["Denetim Yönetimi"]) && saved["Denetim Yönetimi"].length) setColumns(saved["Denetim Yönetimi"]);
    } catch {}
  }, []);
  const saveColumns = (keys: string[]) => {
    setColumns(keys);
    try {
      const saved = JSON.parse(localStorage.getItem("fornost-grc-columns") || "{}");
      localStorage.setItem("fornost-grc-columns", JSON.stringify({ ...saved, "Denetim Yönetimi": keys }));
    } catch {}
  };
  const filtered = items.filter((row) => Object.entries(filters).every(([key, value]) => !value || String(row.data[key] ?? "") === value));
  return (
    <section className="table-card smart-register audit-requirements-register">
      <div className="audit-table-heading">
        <div><small>{tr ? "STANDART MADDELERİ" : "STANDARD REQUIREMENTS"}</small><h3>{tr ? "Denetim maddeleri ve sorumluluk takibi" : "Audit requirements and ownership tracking"}</h3></div>
        {canWrite && <button className="ghost" onClick={() => openNew()}>{tr ? "+ Özel Madde" : "+ Custom Item"}</button>}
      </div>
      <RegisterToolbar module="Denetim Yönetimi" lang={lang} rows={items} resultCount={filtered.length} query={query} setQuery={setQuery} selectedColumnKeys={columns} setSelectedColumnKeys={saveColumns} filters={filters} setFilters={setFilters} columnPickerOpen={columnPickerOpen} setColumnPickerOpen={setColumnPickerOpen} filterPanelOpen={filterPanelOpen} setFilterPanelOpen={setFilterPanelOpen} />
      <div className="table-wrap">
        {items.length ? <SmartRegister module="Denetim Yönetimi" rows={filtered} lang={lang} edit={edit} remove={remove} canWrite={canWrite} columns={columns} /> : <div className="audit-empty"><b>{tr ? "Bu şablon için otomatik madde bulunamadı." : "No automatic requirements are available for this template."}</b><p>{tr ? "Excel ile içe aktarabilir veya özel madde ekleyebilirsiniz." : "Import from Excel or add a custom item."}</p></div>}
      </div>
    </section>
  );
}

function AuditWorkspaceTabs({
  items,
  allRows,
  lang,
  query,
  setQuery,
  edit,
  remove,
  openNew,
  canWrite,
  createTicket,
}: {
  items: Row[];
  allRows: Row[];
  lang: Lang;
  query: string;
  setQuery: (x: string) => void;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  openNew: (seed?: Record<string, any>) => void;
  canWrite: boolean;
  createTicket: (row: Row) => Promise<void>;
}) {
  const tr = lang === "tr",
    [tab, setTab] = useState(items.length ? "overview" : "controls"),
    [auditColumns, setAuditColumns] = useState(
      defaultRegisterColumnKeys("Denetim Yönetimi"),
    ),
    [auditFilters, setAuditFilters] = useState<Record<string, string>>({}),
    [auditColumnPicker, setAuditColumnPicker] = useState(false),
    [auditFilterPanel, setAuditFilterPanel] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false),
    [libraryQuery, setLibraryQuery] = useState(""),
    soc2 = items.some(
      (r) =>
        r.data.frameworkTemplate ||
        String(r.data.auditName).startsWith("SOC 2"),
    );
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("fornost-grc-columns") || "{}",
      );
      if (
        Array.isArray(saved["Denetim Yönetimi"]) &&
        saved["Denetim Yönetimi"].length
      )
        setAuditColumns(saved["Denetim Yönetimi"]);
    } catch {}
  }, []);
  const setAuditColumnPreference = (keys: string[]) => {
    setAuditColumns(keys);
    try {
      const saved = JSON.parse(
        localStorage.getItem("fornost-grc-columns") || "{}",
      );
      localStorage.setItem(
        "fornost-grc-columns",
        JSON.stringify({ ...saved, "Denetim Yönetimi": keys }),
      );
    } catch {
      localStorage.setItem(
        "fornost-grc-columns",
        JSON.stringify({ "Denetim Yönetimi": keys }),
      );
    }
  };
  const filteredAuditItems = items.filter((row) =>
    Object.entries(auditFilters).every(
      ([key, value]) => !value || String(row.data[key] ?? "") === value,
    ),
  );
  const evidence = allRows.filter((r) => r.module === "Kanıtlar"),
    linkedEvidence = (ref: string) =>
      evidence.filter((r) => r.data.controlRef === ref);
  const assignedRefs = new Set(
    items
      .map((r) => String(r.data.controlRef || r.data.requirementRef || ""))
      .filter(Boolean),
  );
  const libraryControls = allRows.filter(
    (r) =>
      r.module === "Kontroller" &&
      JSON.stringify(r.data)
        .toLocaleLowerCase(tr ? "tr-TR" : "en-US")
        .includes(libraryQuery.toLocaleLowerCase(tr ? "tr-TR" : "en-US")),
  );
  const addFromLibrary = (control: Row) => {
    const d = control.data;
    setLibraryOpen(false);
    openNew({
      requirementRef: d.controlRef || "",
      requirementTitle: d.controlTitle || "",
      controlRef: d.controlRef || "",
      owner: d.owner || "",
      businessUnit: d.businessUnit || "",
      frequency: d.frequency || "",
      frameworks: d.frameworks || "",
      description: d.description || "",
      expectedEvidence: d.expectedEvidence || "",
      status: "Başlanmadı",
      progress: "0",
      evidenceStatus: "Kanıt Bekleniyor",
    });
  };
  const statusCount = (value: string) =>
    items.filter((r) => r.data.status === value).length;
  const tested = items.filter(
    (r) =>
      r.data.operatingEffectiveness &&
      r.data.operatingEffectiveness !== "Test Bekliyor",
  ).length;
  const findings = items.filter(
    (r) => r.data.finding || r.data.responsibleNote,
  );
  const tabs = [
    ["overview", tr ? "Genel Bakış" : "Overview"],
    ["scope", tr ? "Kapsam" : "Scope"],
    ["controls", tr ? "Kontroller" : "Controls"],
    ["evidence", tr ? "Kanıtlar" : "Evidence"],
    ["tests", tr ? "Kontrol Testleri" : "Control Tests"],
    ["findings", tr ? "Gap ve Aksiyonlar" : "Gaps & Actions"],
  ];
  return (
    <>
      <nav
        className="audit-workspace-tabs"
        aria-label={tr ? "Denetim çalışma alanı" : "Audit workspace"}
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "findings" && findings.length > 0 ? (
              <span>{findings.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <section className="soc2-overview-grid">
          <article className="soc2-readiness-card">
            <header>
              <div>
                <small>{soc2 ? "SOC 2 TYPE II" : "AUDIT READINESS"}</small>
                <h3>
                  {tr ? "Denetim hazırlık görünümü" : "Audit readiness view"}
                </h3>
              </div>
              <span>
                {items[0]?.data.frameworkTemplate || items[0]?.data.auditType}
              </span>
            </header>
            <div className="soc2-status-grid">
              {[
                [statusCount("Tamamlandı"), tr ? "Tamamlandı" : "Complete", "ready"],
                [statusCount("Devam Ediyor"), tr ? "Devam ediyor" : "In progress", "partial"],
                [statusCount("Başlanmadı"), tr ? "Başlanmadı" : "Not started", "missing"],
                [
                  tested,
                  tr
                    ? "Operasyonel test tamamlandı"
                    : "Operating tests complete",
                  "tested",
                ],
              ].map(([value, label, tone]) => (
                <div key={String(label)} className={String(tone)}>
                  <b>{value}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <footer>
              <span>
                {tr
                  ? "Hazırlık değerleri mevcut denetim akışını ve test sonuçlarını gösterir."
                  : "Readiness values reflect the current audit workflow and test results."}
              </span>
            </footer>
          </article>
          <article className="soc2-period-card">
            <small>{tr ? "DENETİM DÖNEMİ" : "AUDIT PERIOD"}</small>
            <h3>
              {items[0]?.data.startDate || "—"} →{" "}
              {items[0]?.data.endDate || "—"}
            </h3>
            <p>
              {tr
                ? "Type II kapsamında kontrollerin dönem boyunca çalıştığını kanıtlayan tarihli kayıtlar ve örneklemler izlenir."
                : "Dated evidence and samples demonstrate that controls operated throughout the Type II period."}
            </p>
            <dl>
              <div>
                <dt>{tr ? "Toplam kriter" : "Total criteria"}</dt>
                <dd>{items.length}</dd>
              </div>
              <div>
                <dt>{tr ? "Kanıt bağlanan" : "Evidence linked"}</dt>
                <dd>
                  {
                    items.filter(
                      (r) => linkedEvidence(r.data.controlRef).length > 0,
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt>{tr ? "Açık aksiyon" : "Open actions"}</dt>
                <dd>{findings.length}</dd>
              </div>
            </dl>
          </article>
        </section>
      )}
      {tab === "scope" && (
        <section className="audit-scope-grid">
          {[
            [
              "Security",
              tr ? "Başlangıç kapsamında" : "In initial scope",
              items.filter((r) =>
                String(r.data.scopeCategory).includes("Security"),
              ).length,
            ],
            [
              "Availability",
              tr ? "Başlangıç kapsamında" : "In initial scope",
              items.filter((r) => r.data.scopeCategory === "Availability")
                .length,
            ],
            [
              "Confidentiality",
              tr ? "Başlangıç kapsamında" : "In initial scope",
              items.filter((r) => r.data.scopeCategory === "Confidentiality")
                .length,
            ],
            [
              "Processing Integrity + Privacy",
              tr ? "Faz 2 adayı" : "Phase 2 candidate",
              0,
            ],
          ].map(([name, status, count], i) => (
            <article key={String(name)} className={i === 3 ? "phase-two" : ""}>
              <span>{i < 3 ? "✓" : "→"}</span>
              <div>
                <small>{status}</small>
                <h3>{name}</h3>
                <p>
                  {count} {tr ? "kriter" : "criteria"}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
      {tab === "controls" && (
        <section className="table-card smart-register">
          <div className="audit-control-source">
            <div>
              <small>{tr ? "DENETİM KONTROLLERİ" : "AUDIT CONTROLS"}</small>
              <b>
                {tr
                  ? "Kütüphaneden seçin veya özel madde oluşturun"
                  : "Choose from the library or create a custom item"}
              </b>
            </div>
            {canWrite && (
              <div>
                <button className="ghost" onClick={() => openNew()}>
                  {tr ? "Özel Madde" : "Custom Item"}
                </button>
                <button
                  className="primary"
                  onClick={() => setLibraryOpen(true)}
                >
                  {tr
                    ? "+ Kütüphaneden Kontrol Ekle"
                    : "+ Add from Control Library"}
                </button>
              </div>
            )}
          </div>
          {items.length ? (
            <>
              <RegisterToolbar
                module="Denetim Yönetimi"
                lang={lang}
                rows={items}
                resultCount={filteredAuditItems.length}
                query={query}
                setQuery={setQuery}
                selectedColumnKeys={auditColumns}
                setSelectedColumnKeys={setAuditColumnPreference}
                filters={auditFilters}
                setFilters={setAuditFilters}
                columnPickerOpen={auditColumnPicker}
                setColumnPickerOpen={setAuditColumnPicker}
                filterPanelOpen={auditFilterPanel}
                setFilterPanelOpen={setAuditFilterPanel}
              />
              <div className="table-wrap">
                <SmartRegister
                  module="Denetim Yönetimi"
                  rows={filteredAuditItems}
                  lang={lang}
                  edit={edit}
                  remove={remove}
                  canWrite={canWrite}
                  columns={auditColumns}
                />
              </div>
            </>
          ) : (
            <div className="audit-empty">
              <b>
                {tr
                  ? "Bu denetimde henüz kontrol yok."
                  : "This audit has no controls yet."}
              </b>
              <p>
                {tr
                  ? "Merkezi kütüphaneden mevcut bir kontrol seçin veya denetime özel madde oluşturun."
                  : "Choose an existing control from the central library or create an audit-specific item."}
              </p>
            </div>
          )}
        </section>
      )}
      {tab === "evidence" && (
        <section className="table-card soc2-work-table">
          <header>
            <div>
              <small>
                {tr ? "KANIT TALEP LİSTESİ" : "EVIDENCE REQUEST LIST"}
              </small>
              <h3>
                {tr
                  ? "Beklenen ve yüklenen kanıtlar"
                  : "Expected and uploaded evidence"}
              </h3>
            </div>
            <b>
              {evidence.length} {tr ? "kütüphane kaydı" : "library records"}
            </b>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TSC</th>
                  <th>{tr ? "Beklenen kanıt" : "Expected evidence"}</th>
                  <th>{tr ? "Sahip / Frekans" : "Owner / Frequency"}</th>
                  <th>{tr ? "Yüklenen" : "Uploaded"}</th>
                  <th>{tr ? "Durum" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const linked = linkedEvidence(r.data.controlRef);
                  return (
                    <tr key={r.id}>
                      <td>
                        <b>{r.data.requirementRef}</b>
                      </td>
                      <td>{r.data.expectedEvidence || "—"}</td>
                      <td>
                        <b>{r.data.owner || "—"}</b>
                        <small>{r.data.frequency || "—"}</small>
                      </td>
                      <td>
                        <span className="audit-count-chip">
                          {linked.length}
                        </span>
                      </td>
                      <td>
                        <StatusPill
                          value={
                            linked.length
                              ? r.data.evidenceStatus
                              : "Kanıt Bekleniyor"
                          }
                          lang={lang}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "tests" && (
        <section className="table-card soc2-work-table">
          <header>
            <div>
              <small>
                {tr ? "TYPE II ETKİNLİK TESTİ" : "TYPE II EFFECTIVENESS TEST"}
              </small>
              <h3>
                {tr
                  ? "Tasarım ve operasyonel etkinlik"
                  : "Design and operating effectiveness"}
              </h3>
            </div>
            <b>
              {tested}/{items.length} {tr ? "tamamlandı" : "complete"}
            </b>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TSC</th>
                  <th>{tr ? "Test yaklaşımı" : "Test approach"}</th>
                  <th>{tr ? "Tasarım" : "Design"}</th>
                  <th>{tr ? "Operasyon" : "Operation"}</th>
                  <th>{tr ? "Örneklem" : "Sample"}</th>
                  <th>{tr ? "Denetçi" : "Auditor"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.data.requirementRef}</b>
                      <small>{r.data.requirementTitle}</small>
                    </td>
                    <td>{r.data.typeIITestApproach || "—"}</td>
                    <td>
                      <StatusPill
                        value={r.data.designEffectiveness}
                        lang={lang}
                      />
                    </td>
                    <td>
                      <StatusPill
                        value={r.data.operatingEffectiveness}
                        lang={lang}
                      />
                    </td>
                    <td>
                      {r.data.sampleSize || "—"} /{" "}
                      {r.data.populationSize || "—"}
                    </td>
                    <td>
                      <StatusPill value={r.data.auditorResult} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "findings" && (
        <section className="soc2-findings">
          {findings.map((r) => (
            <article key={r.id}>
              <header>
                <span>{r.data.requirementRef}</span>
                <StatusPill
                  value={r.data.status}
                  lang={lang}
                />
              </header>
              <h3>{r.data.requirementTitle}</h3>
              {r.data.responsibleNote && (
                <p>
                  <b>{tr ? "Gerekli aksiyon" : "Required action"}</b>
                  {r.data.responsibleNote}
                </p>
              )}
              {r.data.ticketRef && (
                <a
                  className="soc2-ticket-ref"
                  href={r.data.ticketUrl || undefined}
                  target={r.data.ticketUrl ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {tr ? "Bağlı ticket" : "Linked ticket"}: {r.data.ticketRef}
                </a>
              )}
              <footer>
                <span>{r.data.owner}</span>
                <span>{r.data.dueDate}</span>
                {canWrite && (
                  <button onClick={() => edit(r)}>
                    {tr ? "Aksiyonu güncelle" : "Update action"}
                  </button>
                )}
                {canWrite && !r.data.ticketRef && (
                  <button
                    className="ticket-action"
                    onClick={() => createTicket(r)}
                  >
                    {tr ? "Ticket Aç" : "Create Ticket"}
                  </button>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}
      {libraryOpen && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLibraryOpen(false);
          }}
        >
          <section
            className="modal audit-control-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="control-library-title"
          >
            <div className="modal-head">
              <div>
                <small>
                  {tr ? "MERKEZİ KONTROL HAVUZU" : "CENTRAL CONTROL POOL"}
                </small>
                <h2 id="control-library-title">
                  {tr ? "Denetime kontrol ekle" : "Add control to audit"}
                </h2>
              </div>
              <button
                onClick={() => setLibraryOpen(false)}
                aria-label={tr ? "Kapat" : "Close"}
              >
                ×
              </button>
            </div>
            <div className="audit-control-search">
              <input
                autoFocus
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder={
                  tr
                    ? "Kod, başlık, standart veya sahip ara…"
                    : "Search code, title, standard or owner…"
                }
              />
              <span>
                {libraryControls.length} {tr ? "kontrol" : "controls"}
              </span>
            </div>
            <div className="audit-control-list">
              {libraryControls.map((control) => {
                const d = control.data,
                  assigned = assignedRefs.has(String(d.controlRef || ""));
                return (
                  <article key={control.id}>
                    <div>
                      <b>{d.controlRef || control.id}</b>
                    <h3>
                      {d.controlTitle ||
                        (tr ? "Başlıksız kontrol" : "Untitled control")}
                    </h3>
                      <p>
                        {[d.owner, d.frameworks, d.frequency]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <button
                      disabled={assigned}
                      onClick={() => addFromLibrary(control)}
                    >
                      {assigned
                        ? tr
                          ? "Eklendi"
                          : "Added"
                        : tr
                          ? "Seç ve Düzenle"
                          : "Select & Edit"}
                    </button>
                  </article>
                );
              })}
              {!libraryControls.length && (
                <div className="audit-empty">
                  <b>
                    {tr
                      ? "Eşleşen kontrol bulunamadı."
                      : "No matching control found."}
                  </b>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const registerColumns: Record<
  string,
  { key: string; tr: string; en: string }[]
> = {
  "Risk Assessment": [
    { key: "title", tr: "Risk Başlığı", en: "Risk Title" },
    { key: "category", tr: "Kategori", en: "Category" },
    { key: "businessUnit", tr: "İş Birimi", en: "Business Unit" },
    { key: "owner", tr: "Risk Sahibi", en: "Risk Owner" },
    { key: "inherentRisk", tr: "Doğal Risk", en: "Inherent Risk" },
    { key: "treatment", tr: "Risk Aksiyonu", en: "Treatment" },
    { key: "status", tr: "Durum", en: "Status" },
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
  ],
  BIA: [
    { key: "process", tr: "Süreç", en: "Process" },
    { key: "ownership", tr: "İş Birimi / Sahip", en: "Business Unit / Owner" },
    { key: "criticality", tr: "Kritiklik", en: "Criticality" },
    { key: "businessImpact", tr: "İş Etkisi", en: "Business Impact" },
    { key: "mtpd", tr: "MTPD / MAO", en: "MTPD / MAO" },
    { key: "recovery", tr: "RTO / RPO", en: "RTO / RPO" },
    { key: "biaGovernance", tr: "Yönetişim", en: "Governance" },
    { key: "readiness", tr: "Kurtarma Hazırlığı", en: "Recovery Readiness" },
    { key: "test", tr: "Son Test / Durum", en: "Last Test / Status" },
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
  ],
  "Varlık Envanteri": [
    { key: "title", tr: "Varlık", en: "Asset" },
    { key: "assetType", tr: "Tür / Ortam", en: "Type / Environment" },
    { key: "ownership", tr: "İş Birimi / Sahip", en: "Business Unit / Owner" },
    { key: "criticality", tr: "Kritiklik", en: "Criticality" },
    { key: "dataClassification", tr: "Veri Sınıfı", en: "Data Class" },
    { key: "cia", tr: "G / B / E", en: "C / I / A" },
    { key: "exposure", tr: "Maruziyet", en: "Exposure" },
    { key: "coverage", tr: "Güvenlik Kapsamı", en: "Security Coverage" },
    { key: "lifecycle", tr: "Yaşam Döngüsü", en: "Lifecycle" },
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
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
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
  ],
  Tedarikçiler: [
    { key: "title", tr: "Tedarikçi / Hizmet", en: "Vendor / Service" },
    { key: "ownership", tr: "İş Birimi / Sahip", en: "Business Unit / Owner" },
    { key: "criticality", tr: "Kritiklik", en: "Criticality" },
    { key: "riskLevel", tr: "Risk Seviyesi", en: "Risk Level" },
    { key: "contractEnd", tr: "Sözleşme Bitişi", en: "Contract End" },
    { key: "status", tr: "Durum", en: "Status" },
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
  ],
  Kontroller: [
    { key: "control", tr: "Kontrol", en: "Control" },
    { key: "owner", tr: "Kontrol Sahibi", en: "Control Owner" },
    { key: "frameworks", tr: "İlgili Standartlar", en: "Applicable Standards" },
    { key: "frequency", tr: "Sıklık", en: "Frequency" },
    { key: "evidence", tr: "Kanıt Kapsamı", en: "Evidence Coverage" },
    { key: "status", tr: "Durum", en: "Status" },
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
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
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
  ],
  "Denetim Yönetimi": [
    { key: "audit", tr: "Madde", en: "Requirement" },
    {
      key: "ownership",
      tr: "Atanan Kişi / İş Birimi",
      en: "Assignee / Business Unit",
    },
    { key: "followUpOwner", tr: "Takip Eden", en: "Follower" },
    { key: "dueDate", tr: "Termin", en: "Due Date" },
    { key: "progress", tr: "İlerleme", en: "Progress" },
    { key: "evidenceStatus", tr: "Kanıt", en: "Evidence" },
    { key: "links", tr: "Bağlantılar", en: "Links" },
    { key: "status", tr: "Durum", en: "Status" },
    { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
  ],
};

type RegisterColumn = { key: string; tr: string; en: string };
const systemRegisterColumns: RegisterColumn[] = [
  { key: "createdAt", tr: "Oluşturulma Tarihi", en: "Created At" },
  { key: "updatedAt", tr: "Son Güncelleme", en: "Last Updated" },
];
const registerFilterKeys: Record<string, string[]> = {
  "Risk Assessment": [
    "category",
    "businessUnit",
    "owner",
    "asset",
    "actionOwner",
    "treatment",
    "status",
    "nextReview",
  ],
  BIA: [
    "processCategory",
    "businessUnit",
    "owner",
    "criticality",
    "asset",
    "drStatus",
    "testResult",
    "approver",
    "nextTestDate",
  ],
  "Varlık Envanteri": [
    "assetType",
    "businessUnit",
    "owner",
    "technicalOwner",
    "custodian",
    "criticality",
    "dataClassification",
    "environment",
    "internetFacing",
    "personalData",
    "criticalService",
    "backupStatus",
    "edrStatus",
    "siemStatus",
    "patchStatus",
    "status",
  ],
  Uyum: [
    "framework",
    "businessUnit",
    "owner",
    "followUpOwner",
    "implementation",
    "evidenceStatus",
    "status",
    "nextAssessment",
  ],
  Tedarikçiler: [
    "vendorType",
    "businessUnit",
    "owner",
    "criticality",
    "riskLevel",
    "dataAccess",
    "hostingLocation",
    "riskTreatment",
    "status",
    "nextAssessment",
  ],
  Kontroller: [
    "businessUnit",
    "owner",
    "controlType",
    "frequency",
    "testOwner",
    "testResult",
    "status",
  ],
  Kanıtlar: [
    "owner",
    "period",
    "sourceSystem",
    "reviewer",
    "reviewStatus",
    "expiresAt",
  ],
  "Denetim Yönetimi": [
    "auditType",
    "businessUnit",
    "owner",
    "followUpOwner",
    "evidenceStatus",
    "testOwner",
    "auditorResult",
    "dueDate",
    "status",
  ],
};
function getAvailableRegisterColumns(module: string): RegisterColumn[] {
  const preferred = registerColumns[module] || [];
  const seen = new Set(preferred.map((column) => column.key));
  const direct = (fields[module] || [])
    .filter((key) => !seen.has(key))
    .map((key) => ({
      key,
      tr: labelMap.tr[key] || key,
      en: labelMap.en[key] || key,
    }));
  for (const column of systemRegisterColumns)
    if (!seen.has(column.key)) direct.push(column);
  return [...preferred, ...direct];
}
function defaultRegisterColumnKeys(module: string) {
  return (registerColumns[module] || []).map((column) => column.key);
}
function formatRecordDate(value: string | undefined, lang: Lang) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "tr" ? "tr-TR" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function DateTimeCell({ value, lang }: { value?: string; lang: Lang }) {
  if (!value) return <>—</>;
  const date = new Date(value);
  return (
    <div className="stack date-stack">
      <b>{formatRecordDate(value, lang)}</b>
      <small>
        {Number.isNaN(date.getTime())
          ? ""
          : new Intl.RelativeTimeFormat(lang === "tr" ? "tr" : "en", {
              numeric: "auto",
            }).format(
              Math.round((date.getTime() - Date.now()) / 86400000),
              "day",
            )}
      </small>
    </div>
  );
}

function RegisterToolbar({
  module,
  lang,
  rows,
  resultCount,
  query,
  setQuery,
  selectedColumnKeys,
  setSelectedColumnKeys,
  filters,
  setFilters,
  columnPickerOpen,
  setColumnPickerOpen,
  filterPanelOpen,
  setFilterPanelOpen,
}: {
  module: string;
  lang: Lang;
  rows: Row[];
  resultCount: number;
  query: string;
  setQuery: (value: string) => void;
  selectedColumnKeys: string[];
  setSelectedColumnKeys: (keys: string[]) => void;
  filters: Record<string, string>;
  setFilters: (filters: Record<string, string>) => void;
  columnPickerOpen: boolean;
  setColumnPickerOpen: (open: boolean) => void;
  filterPanelOpen: boolean;
  setFilterPanelOpen: (open: boolean) => void;
}) {
  const tr = lang === "tr",
    available = getAvailableRegisterColumns(module),
    filterKeys = registerFilterKeys[module] || [];
  const columnButtonRef = useRef<HTMLButtonElement>(null);
  const [pickerPosition, setPickerPosition] = useState<CSSProperties>({});
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  useEffect(() => {
    if (!columnPickerOpen) return;
    const placePicker = () => {
      const rect = columnButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(420, window.innerWidth - 24);
      const maxHeight = Math.min(540, window.innerHeight - 24);
      const left = Math.max(
        12,
        Math.min(window.innerWidth - width - 12, rect.right - width),
      );
      const openUp =
        window.innerHeight - rect.bottom < Math.min(390, maxHeight) &&
        rect.top > window.innerHeight - rect.bottom;
      setPickerPosition(
        openUp
          ? {
              left,
              width,
              maxHeight,
              top: "auto",
              bottom: Math.max(12, window.innerHeight - rect.top + 8),
            }
          : {
              left,
              width,
              maxHeight,
              top: Math.min(window.innerHeight - 12, rect.bottom + 8),
              bottom: "auto",
            },
      );
    };
    placePicker();
    window.addEventListener("resize", placePicker);
    window.addEventListener("scroll", placePicker, true);
    return () => {
      window.removeEventListener("resize", placePicker);
      window.removeEventListener("scroll", placePicker, true);
    };
  }, [columnPickerOpen]);
  const toggleColumn = (key: string) => {
    const next = selectedColumnKeys.includes(key)
      ? selectedColumnKeys.filter((item) => item !== key)
      : [...selectedColumnKeys, key];
    if (next.length) setSelectedColumnKeys(next);
  };
  const optionsFor = (key: string) =>
    [
      ...new Set(
        rows.map((row) => String(row.data[key] ?? "")).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, lang === "tr" ? "tr" : "en"));
  return (
    <div className="register-toolbar">
      <div className="register-toolbar-main">
        <div className="register-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={tr ? "Kayıtlarda ara" : "Search records"}
            placeholder={ui[lang].search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="register-view-actions">
          <button
            className={filterPanelOpen || activeFilterCount ? "active" : ""}
            onClick={() => {
              setFilterPanelOpen(!filterPanelOpen);
              setColumnPickerOpen(false);
            }}
          >
            <span aria-hidden="true">▽</span>
            {tr ? "Filtreler" : "Filters"}
            {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </button>
          <div className="column-picker-wrap">
            <button
              ref={columnButtonRef}
              className={columnPickerOpen ? "active" : ""}
              onClick={() => {
                setColumnPickerOpen(!columnPickerOpen);
                setFilterPanelOpen(false);
              }}
            >
              <span aria-hidden="true">▥</span>
              {tr ? "Sütunlar" : "Columns"}
              <b>{selectedColumnKeys.length}</b>
            </button>
            {columnPickerOpen && (
              <div
                className="column-picker"
                style={pickerPosition}
                role="dialog"
                aria-label={tr ? "Görüntülenecek sütunlar" : "Visible columns"}
              >
                <header>
                  <div>
                    <b>{tr ? "Görüntülenecek sütunlar" : "Visible columns"}</b>
                    <small>
                      {tr
                        ? "Tercihin bu cihazda saklanır"
                        : "Saved on this device"}
                    </small>
                  </div>
                  <button
                    onClick={() =>
                      setSelectedColumnKeys(defaultRegisterColumnKeys(module))
                    }
                  >
                    {tr ? "Varsayılan" : "Default"}
                  </button>
                </header>
                <div>
                  {available.map((column) => (
                    <label key={column.key}>
                      <input
                        type="checkbox"
                        checked={selectedColumnKeys.includes(column.key)}
                        onChange={() => toggleColumn(column.key)}
                      />
                      <span>{column[lang]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <strong>
            {resultCount} {ui[lang].record}
          </strong>
        </div>
      </div>
      {filterPanelOpen && (
        <div className="register-filters">
          {filterKeys.map((key) => (
            <label key={key}>
              <span>{labelMap[lang][key] || key}</span>
              <select
                value={filters[key] || ""}
                onChange={(event) =>
                  setFilters({ ...filters, [key]: event.target.value })
                }
              >
                <option value="">{tr ? "Tümü" : "All"}</option>
                {optionsFor(key).map((option) => (
                  <option key={option} value={option}>
                    {display(option, lang)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters({})}>
              {tr ? "Filtreleri Temizle" : "Clear Filters"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
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
  if (column === "updatedAt" || column === "createdAt")
    return (
      <DateTimeCell
        value={column === "updatedAt" ? row.updatedAt : row.createdAt}
        lang={lang}
      />
    );
  if (module === "Denetim Yönetimi" && column === "audit")
    {
      const reference = String(d.requirementRef || d.controlRef || "—"),
        rawTitle = String(d.requirementTitle || d.title || "").trim(),
        redundantTitle = [
          `${d.auditName || ""} ${reference} kontrolü`,
          `${d.frameworkTemplate || ""} ${reference} kontrolü`,
          `ISO/IEC 27001:2022 ${reference} kontrolü`,
        ].some((value) => value.trim().toLocaleLowerCase("tr-TR") === rawTitle.toLocaleLowerCase("tr-TR"));
      return (
        <div className="stack title-stack audit-requirement-cell">
          <b>{reference}</b>
          {rawTitle && !redundantTitle && <small>{rawTitle}</small>}
        </div>
      );
    }
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
        <b>
          {module === "Denetim Yönetimi"
            ? d.owner || "—"
            : d.businessUnit || "—"}
        </b>
        <small>
          {module === "Denetim Yönetimi"
            ? d.businessUnit || "—"
            : d.owner || "—"}
        </small>
      </div>
    );
  if (module === "Denetim Yönetimi" && column === "followUpOwner")
    return (
      <div className="stack">
        <b>{d.followUpOwner || d.auditOwner || d.testOwner || "—"}</b>
        <small>
          {tr ? "Koordinasyon ve takip" : "Coordination and follow-up"}
        </small>
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
        <small>
          {[d.processCategory, d.asset].filter(Boolean).join(" · ")}
        </small>
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
  if (column === "biaGovernance")
    return (
      <div className="stack">
        <b>{d.approver || (tr ? "Onay bekliyor" : "Awaiting approval")}</b>
        <small>{d.approvalDate || d.nextReview || "—"}</small>
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
  if (column === "cia")
    return (
      <div className="readiness cia-pills">
        <span className="ok">
          {tr ? "G" : "C"} {d.confidentialityRating || "—"}
        </span>
        <span className="ok">
          {tr ? "B" : "I"} {d.integrityRating || "—"}
        </span>
        <span className="ok">E {d.availabilityRating || "—"}</span>
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
        <span>
          <b>{d.evidenceTitle || row.id}</b>
          <small>
            {d.fileName || (tr ? "Örnek ekran görüntüsü" : "Sample screenshot")}
          </small>
        </span>
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
function EvidencePreview({
  row,
  lang,
  onClose,
}: {
  row: Row;
  lang: Lang;
  onClose: () => void;
}) {
  const d = row.data,
    tr = lang === "tr",
    source = d.demoImage
      ? withBasePath(d.demoImage)
      : d.fileKey
        ? withBasePath(
            `/api/evidence?key=${encodeURIComponent(d.fileKey)}&inline=1`,
          )
        : "";
  const isPdf = d.fileType === "application/pdf";
  return (
    <div className="overlay evidence-overlay" onMouseDown={onClose}>
      <section
        className="evidence-preview"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr ? "Kanıt önizleme" : "Evidence preview"}
      >
        <header className="evidence-preview-head">
          <div>
            <small>
              {row.id} · {tr ? "KANIT ÖNİZLEME" : "EVIDENCE PREVIEW"}
            </small>
            <h2>{d.evidenceTitle || row.id}</h2>
            <p>
              {d.controlRef || "—"} · {d.owner || "—"} · {d.period || "—"}
            </p>
          </div>
          <button onClick={onClose} aria-label={tr ? "Kapat" : "Close"}>
            ×
          </button>
        </header>
        <div className="evidence-stage">
          {source ? (
            isPdf ? (
              <iframe src={source} title={d.evidenceTitle || row.id} />
            ) : (
              <>
                <img
                  src={source}
                  alt={`${d.evidenceTitle || row.id} ${tr ? "ekran görüntüsü" : "screenshot"}`}
                />
              </>
            )
          ) : (
            <div className="evidence-missing">
              {tr
                ? "Bu kanıta henüz görsel eklenmemiş."
                : "No image has been attached to this evidence yet."}
            </div>
          )}
        </div>
        <footer className="evidence-meta">
          <div>
            <b>{tr ? "Dosya" : "File"}</b>
            <span>
              {d.fileName || (tr ? "Demo ekran görüntüsü" : "Demo screenshot")}
            </span>
          </div>
          <div>
            <b>{tr ? "Standartlar" : "Standards"}</b>
            <span>{d.frameworks || "—"}</span>
          </div>
          <div>
            <b>{tr ? "Not" : "Note"}</b>
            <span>{d.notes || "—"}</span>
          </div>
          {d.fileKey && (
            <a
              href={withBasePath(
                `/api/evidence?key=${encodeURIComponent(d.fileKey)}`,
              )}
            >
              {tr ? "Orijinal dosyayı indir" : "Download original"}
            </a>
          )}
        </footer>
      </section>
    </div>
  );
}

function SmartRegister({
  module,
  rows,
  lang,
  edit,
  remove,
  viewEvidence,
  columns,
  canWrite = true,
}: {
  module: string;
  rows: Row[];
  lang: Lang;
  edit: (r: Row) => void;
  remove: (id: string) => void;
  viewEvidence?: (row: Row) => void;
  columns?: string[];
  canWrite?: boolean;
}) {
  const cols = getAvailableRegisterColumns(module).filter((column) =>
      (columns || defaultRegisterColumnKeys(module)).includes(column.key),
    ),
    u = ui[lang],
    showRecordCode = module !== "Denetim Yönetimi",
    widths = useColumnWidths(module);
  return (
    <table className={`smart-table ${module === "BIA" ? "bia-table" : ""}`}>
      <colgroup>
        {showRecordCode && <col style={{ width: widths.width("recordCode", 130) }} />}
        {cols.map((c) => <col key={c.key} style={{ width: widths.width(c.key) }} />)}
        {canWrite && <col style={{ width: 120 }} />}
      </colgroup>
      <thead>
        <tr>
          {showRecordCode && <ResizableTh columnKey="recordCode" widths={widths}>{lang === "tr" ? "Kod" : "Code"}</ResizableTh>}
          {cols.map((c) => (
            <ResizableTh key={c.key} columnKey={c.key} widths={widths}>{c[lang]}</ResizableTh>
          ))}
          {canWrite && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onDoubleClick={() => canWrite && edit(r)}>
            {showRecordCode && (
              <td>
                {module === "Kanıtlar" ? (
                  <button
                    className="code code-link"
                    onClick={() => viewEvidence?.(r)}
                  >
                    {r.id}
                  </button>
                ) : (
                  <b className="code">{r.id}</b>
                )}
              </td>
            )}
            {cols.map((c) => (
              <td key={c.key}>
                <SmartCell
                  module={module}
                  column={c.key}
                  row={r}
                  lang={lang}
                  viewEvidence={viewEvidence}
                />
              </td>
            ))}
            {canWrite && (
              <td>
                <div className="row-actions">
                  <button onClick={() => edit(r)}>{u.edit}</button>
                  <button onClick={() => remove(r.id)}>{u.delete}</button>
                </div>
              </td>
            )}
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={cols.length + (canWrite ? 1 : 0) + (showRecordCode ? 1 : 0)} className="empty">
              {u.empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
