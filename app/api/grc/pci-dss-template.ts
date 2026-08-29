export type PciDssRequirement = {
  ref: string;
  title: string;
  owner: string;
  category: string;
};

// PCI DSS 4.0.1 ana gereksinimleri. Açıklamalar, çalışma alanında görev
// dağılımını kolaylaştırmak için kısa ve özgün Türkçe özetlerdir.
export const pciDssTemplateRequirements: PciDssRequirement[] = [
  { ref: "1", title: "Ağ güvenliği kontrollerini kurun ve sürdürün.", owner: "Ağ Güvenliği", category: "Güvenli Ağ ve Sistemler" },
  { ref: "2", title: "Tüm sistem bileşenlerine güvenli yapılandırmalar uygulayın.", owner: "BT Operasyon", category: "Güvenli Ağ ve Sistemler" },
  { ref: "3", title: "Saklanan hesap verilerini koruyun.", owner: "Veri Güvenliği", category: "Hesap Verisinin Korunması" },
  { ref: "4", title: "Açık ve genel ağlar üzerinden iletilen hesap verilerini güçlü kriptografiyle koruyun.", owner: "Ağ Güvenliği", category: "Hesap Verisinin Korunması" },
  { ref: "5", title: "Sistemleri ve ağları kötü amaçlı yazılımlara karşı koruyun.", owner: "Güvenlik Operasyonları", category: "Zafiyet Yönetimi" },
  { ref: "6", title: "Güvenli sistemler ve yazılımlar geliştirin ve sürdürün.", owner: "Uygulama Güvenliği", category: "Zafiyet Yönetimi" },
  { ref: "7", title: "Sistem bileşenlerine ve hesap verilerine erişimi iş ihtiyacıyla sınırlandırın.", owner: "Kimlik ve Erişim Yönetimi", category: "Erişim Kontrolü" },
  { ref: "8", title: "Kullanıcıları tanımlayın ve sistem bileşenlerine erişimi güçlü biçimde doğrulayın.", owner: "Kimlik ve Erişim Yönetimi", category: "Erişim Kontrolü" },
  { ref: "9", title: "Hesap verilerine fiziksel erişimi sınırlandırın.", owner: "Fiziksel Güvenlik", category: "Erişim Kontrolü" },
  { ref: "10", title: "Sistem bileşenlerine ve hesap verilerine erişimi kaydedin ve izleyin.", owner: "Güvenlik Operasyonları", category: "İzleme ve Test" },
  { ref: "11", title: "Güvenlik sistemlerini ve süreçlerini düzenli olarak test edin.", owner: "Siber Güvenlik", category: "İzleme ve Test" },
  { ref: "12", title: "Bilgi güvenliğini kurumsal politika ve programlarla destekleyin.", owner: "Bilgi Güvenliği", category: "Güvenlik Politikası" },
];
