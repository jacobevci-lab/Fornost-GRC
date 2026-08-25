export const defaultCatalogs = {
  riskCategories: [
    "Stratejik", "Kurumsal Yönetim", "Sermaye Piyasaları ve KAP", "Hukuk ve Regülasyon",
    "Uyum", "Finansal Raporlama ve İç Kontrol", "Finansal", "Hazine ve Likidite", "Vergi",
    "İnsan Kaynakları", "Operasyonel", "Bilgi Teknolojileri", "Siber Güvenlik", "Bilgi Güvenliği",
    "Veri Yönetimi ve Yapay Zekâ", "Kişisel Verilerin Korunması", "Üçüncü Taraf ve Tedarik Zinciri",
    "İş Sürekliliği ve Kriz Yönetimi", "Suistimal, Etik ve Yolsuzluk", "İtibar",
    "Proje ve Değişiklik Yönetimi", "Fiziksel Güvenlik", "İş Sağlığı ve Güvenliği",
    "ESG, Sürdürülebilirlik ve İklim", "Müşteri ve Ürün", "Pazar ve Rekabet",
  ],
  biaCategories: [
    "Kritik İş Hizmeti", "Operasyonel Süreç", "Destek Süreci", "Finansal Süreç",
    "Yasal / Düzenleyici Süreç", "Müşteri Süreci", "Teknoloji Hizmeti",
    "İnsan Kaynakları Süreci", "Tedarikçi Bağımlı Süreç",
  ],
  assetTypes: [
    "Sunucu", "Uygulama", "Veritabanı", "Ağ Cihazı", "Uç Nokta", "Bulut Servisi",
    "SaaS", "Bilgi Varlığı", "Tedarikçi Hizmeti", "İş Süreci", "Doküman / Kayıt",
    "Fiziksel Lokasyon", "Kritik Rol / Personel", "Güvenlik Ürünü",
  ],
  businessUnits: [
    "Bilgi Teknolojileri", "Bilgi Güvenliği", "Dijital Kanallar", "Finans", "İnsan Kaynakları",
    "Operasyon", "Hukuk ve Uyum", "Satın Alma", "Müşteri Hizmetleri", "Lojistik",
    "Kurumsal İletişim", "Veri ve Analitik", "Yatırımcı İlişkileri", "Kurumsal Yönetim", "İç Denetim",
  ],
  criticalities: ["Düşük", "Orta", "Yüksek", "Kritik"],
  dataClassifications: ["Herkese Açık", "Şirket İçi", "Gizli", "Çok Gizli"],
  environments: ["Üretim", "Test", "Geliştirme", "Felaket Kurtarma"],
} as const;

export type CatalogKey = keyof typeof defaultCatalogs;
export type CatalogMap = { [K in CatalogKey]: string[] };
export const catalogKeys = Object.keys(defaultCatalogs) as CatalogKey[];

export function isCatalogKey(value: unknown): value is CatalogKey {
  return typeof value === "string" && catalogKeys.includes(value as CatalogKey);
}
