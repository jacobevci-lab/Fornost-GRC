export type FrameworkRequirement = { ref: string; title: string; category: string; owner?: string };

const rows = (category: string, owner: string, values: Array<[string, string]>): FrameworkRequirement[] =>
  values.map(([ref, title]) => ({ ref, title, category, owner }));

const pciGroups: Array<[string, string, string, string[]]> = [
  ["1", "Ağ güvenliği kontrolleri", "Ağ Güvenliği", ["Süreç ve sorumluluklar", "Yapılandırma standartları", "Ağ erişim kuralları", "Güvenilmeyen ağ bağlantıları", "Ağ risklerinin yönetimi"]],
  ["2", "Güvenli yapılandırma", "BT Operasyon", ["Süreç ve sorumluluklar", "Güvenli sistem yapılandırmaları"]],
  ["3", "Saklanan hesap verisi", "Veri Güvenliği", ["Süreç ve sorumluluklar", "Veri saklamayı azaltma", "Hassas kimlik doğrulama verisi", "PAN gösterimi", "PAN koruması", "Kriptografik anahtarların korunması", "Anahtar yaşam döngüsü"]],
  ["4", "Aktarılan hesap verisi", "Ağ Güvenliği", ["Süreç ve sorumluluklar", "Açık ağlarda güçlü kriptografi"]],
  ["5", "Kötü amaçlı yazılım", "Güvenlik Operasyonları", ["Süreç ve sorumluluklar", "Zararlı yazılım önleme", "Mekanizma yönetimi", "Kimlik avı koruması"]],
  ["6", "Güvenli yazılım ve sistemler", "Uygulama Güvenliği", ["Süreç ve sorumluluklar", "Güvenlik açıklarının yönetimi", "Güvenli geliştirme", "Herkese açık uygulamaların korunması", "Değişiklik yönetimi"]],
  ["7", "Erişim kısıtlaması", "Kimlik ve Erişim Yönetimi", ["Süreç ve sorumluluklar", "İş ihtiyacına göre erişim", "Erişim kontrol sistemi"]],
  ["8", "Kullanıcı kimliği ve doğrulama", "Kimlik ve Erişim Yönetimi", ["Süreç ve sorumluluklar", "Hesap yaşam döngüsü", "Güçlü kimlik doğrulama", "Çok faktörlü doğrulama", "Kimlik doğrulama bileşenleri", "Uygulama ve sistem hesapları"]],
  ["9", "Fiziksel erişim", "Fiziksel Güvenlik", ["Süreç ve sorumluluklar", "Tesis erişimi", "Medya erişimi", "Medya güvenliği", "Ödeme noktası cihazları"]],
  ["10", "Kayıt ve izleme", "Güvenlik Operasyonları", ["Süreç ve sorumluluklar", "Denetim kayıtları", "Log koruması", "Log inceleme", "Log saklama", "Zaman senkronizasyonu", "Kritik kontrol arızaları"]],
  ["11", "Güvenlik testleri", "Siber Güvenlik", ["Süreç ve sorumluluklar", "Kablosuz erişim tespiti", "Zafiyet taramaları", "Sızma testleri", "Ağ saldırı tespiti", "Dosya bütünlüğü ve değişiklik tespiti"]],
  ["12", "Güvenlik politikası ve programı", "Bilgi Güvenliği", ["Politika ve sorumluluklar", "Kabul edilebilir kullanım", "Risk değerlendirmesi", "PCI DSS kapsamı", "Güvenlik farkındalığı", "Personel taraması", "Üçüncü taraf hizmetleri", "Olay müdahalesi", "Hizmet sağlayıcı ek yükümlülükleri", "Risk analizleri"]],
];

export const pciDssRequirements = pciGroups.flatMap(([major, category, owner, titles]) =>
  titles.map((title, index) => ({ ref: `${major}.${index + 1}`, title, category, owner })),
);

export const frameworkTemplateCatalogs: Record<string, FrameworkRequirement[]> = {
  "PCI DSS 4.0.1": pciDssRequirements,
  "NIST Cybersecurity Framework (CSF) 2.0": [
    ...rows("Govern", "Bilgi Güvenliği", [["GV.OC","Organizasyon bağlamı"],["GV.RM","Risk yönetim stratejisi"],["GV.RR","Roller, sorumluluklar ve yetkiler"],["GV.PO","Politikalar"],["GV.OV","Gözetim"],["GV.SC","Siber güvenlik tedarik zinciri risk yönetimi"]]),
    ...rows("Identify", "Risk Yönetimi", [["ID.AM","Varlık yönetimi"],["ID.RA","Risk değerlendirmesi"],["ID.IM","İyileştirmelerin belirlenmesi"]]),
    ...rows("Protect", "Bilgi Güvenliği", [["PR.AA","Kimlik yönetimi, doğrulama ve erişim kontrolü"],["PR.AT","Farkındalık ve eğitim"],["PR.DS","Veri güvenliği"],["PR.PS","Platform güvenliği"],["PR.IR","Teknoloji altyapısı dayanıklılığı"]]),
    ...rows("Detect", "Güvenlik Operasyonları", [["DE.CM","Sürekli izleme"],["DE.AE","Olumsuz olay analizi"]]),
    ...rows("Respond", "Olay Müdahale", [["RS.MA","Olay yönetimi"],["RS.AN","Olay analizi"],["RS.CO","Olay iletişimi"],["RS.MI","Olay etkisini azaltma"]]),
    ...rows("Recover", "İş Sürekliliği", [["RC.RP","Kurtarma planının yürütülmesi"],["RC.CO","Kurtarma iletişimi"]]),
  ],
  "CIS Controls v8.1": rows("CIS Controls", "Siber Güvenlik", [
    ["CIS-1","Kurumsal varlıkların envanteri ve kontrolü"],["CIS-2","Yazılım varlıklarının envanteri ve kontrolü"],["CIS-3","Veri koruma"],["CIS-4","Kurumsal varlık ve yazılımların güvenli yapılandırılması"],["CIS-5","Hesap yönetimi"],["CIS-6","Erişim kontrolü yönetimi"],["CIS-7","Sürekli zafiyet yönetimi"],["CIS-8","Denetim kayıtlarının yönetimi"],["CIS-9","E-posta ve web tarayıcı korumaları"],["CIS-10","Kötü amaçlı yazılım savunmaları"],["CIS-11","Veri kurtarma"],["CIS-12","Ağ altyapısı yönetimi"],["CIS-13","Ağ izleme ve savunma"],["CIS-14","Güvenlik farkındalığı ve beceri eğitimi"],["CIS-15","Hizmet sağlayıcı yönetimi"],["CIS-16","Uygulama yazılımı güvenliği"],["CIS-17","Olay müdahale yönetimi"],["CIS-18","Sızma testi"],
  ]),
  "ISO 22301:2019": rows("İş Sürekliliği Yönetim Sistemi", "İş Sürekliliği", [["4","Kuruluşun bağlamı"],["5","Liderlik"],["6","Planlama"],["7","Destek"],["8.1","Operasyonel planlama ve kontrol"],["8.2","İş etki analizi ve risk değerlendirmesi"],["8.3","İş sürekliliği stratejileri ve çözümleri"],["8.4","İş sürekliliği planları ve prosedürleri"],["8.5","Tatbikat programı"],["8.6","Dokümantasyon ve yetenek değerlendirmesi"],["9","Performans değerlendirmesi"],["10","İyileştirme"]]),
  "ISO/IEC 27701:2019": rows("Gizlilik Bilgi Yönetimi", "Veri Koruma", [["5","PIMS’e özgü BGYS gereksinimleri"],["6","PIMS’e özgü bilgi güvenliği kontrolleri"],["7.2","Kişisel veri sorumlusu koşulları"],["7.3","İlgili kişi yükümlülükleri"],["7.4","Privacy by design ve varsayılan gizlilik"],["7.5","Kişisel veri paylaşımı, aktarımı ve açıklanması"],["8.2","Veri işleyen koşulları"],["8.3","Müşteri talimatları ve yükümlülükler"],["8.4","Kişisel veri paylaşımı, aktarımı ve açıklanması"]]),
  "ISO/IEC 27017:2015": rows("Bulut Güvenliği", "Bulut Güvenliği", [["CLD.1","Bulut sorumluluklarının paylaşımı"],["CLD.2","Bulut hizmeti müşteri varlıklarının kaldırılması"],["CLD.3","Sanal ortamların ayrılması"],["CLD.4","Sanal makinelerin güçlendirilmesi"],["CLD.5","Bulut yönetim operasyonları"],["CLD.6","Bulut faaliyetlerinin izlenmesi"],["CLD.7","Sanal ve bulut ağlarının uyumu"]]),
  "ISO/IEC 27018:2019": rows("Bulutta Kişisel Veri", "Veri Koruma", [["PII.1","Amaç ve rıza yönetimi"],["PII.2","Kişisel veri minimizasyonu"],["PII.3","İlgili kişi hakları"],["PII.4","Geçici dosyaların güvenli silinmesi"],["PII.5","Kişisel verinin iadesi, aktarımı ve imhası"],["PII.6","Açıklama ve alt işleyen yönetimi"],["PII.7","Veri ihlali bildirimi"],["PII.8","İşleme lokasyonu ve sınır ötesi aktarım"],["PII.9","Müşteri denetimi ve şeffaflık"]]),
  "COBIT 2019": [
    ...rows("Evaluate, Direct and Monitor", "Üst Yönetim", [["EDM01","Yönetişim çerçevesi"],["EDM02","Fayda teslimi"],["EDM03","Risk optimizasyonu"],["EDM04","Kaynak optimizasyonu"],["EDM05","Paydaş katılımı"]]),
    ...rows("Align, Plan and Organize", "BT Yönetimi", Array.from({length:14},(_,i)=>[`APO${String(i+1).padStart(2,"0")}`,`APO${String(i+1).padStart(2,"0")} yönetim hedefi`] as [string,string])),
    ...rows("Build, Acquire and Implement", "BT Yönetimi", Array.from({length:11},(_,i)=>[`BAI${String(i+1).padStart(2,"0")}`,`BAI${String(i+1).padStart(2,"0")} yönetim hedefi`] as [string,string])),
    ...rows("Deliver, Service and Support", "BT Operasyon", Array.from({length:6},(_,i)=>[`DSS${String(i+1).padStart(2,"0")}`,`DSS${String(i+1).padStart(2,"0")} yönetim hedefi`] as [string,string])),
    ...rows("Monitor, Evaluate and Assess", "İç Denetim", Array.from({length:4},(_,i)=>[`MEA${String(i+1).padStart(2,"0")}`,`MEA${String(i+1).padStart(2,"0")} yönetim hedefi`] as [string,string])),
  ],
  "DORA (EU 2022/2554)": rows("Dijital Operasyonel Dayanıklılık", "Bilgi Güvenliği", [["Art.5-6","Yönetişim ve ICT risk yönetim çerçevesi"],["Art.7-9","ICT sistemleri, protokoller, araçlar ve koruma"],["Art.10-11","Tespit ve müdahale"],["Art.12","Yedekleme, geri yükleme ve kurtarma"],["Art.13-14","Öğrenme, gelişim ve iletişim"],["Art.15-16","Uyumlaştırılmış standartlar ve basitleştirilmiş çerçeve"],["Art.17-23","ICT olay yönetimi, sınıflandırma ve raporlama"],["Art.24-27","Dijital operasyonel dayanıklılık testleri"],["Art.28-30","ICT üçüncü taraf risk yönetimi ve sözleşmeler"],["Art.31-44","Kritik ICT sağlayıcılarının gözetimi"],["Art.45","Bilgi ve istihbarat paylaşımı"]]),
  "NIS2 (EU 2022/2555)": rows("NIS2", "Bilgi Güvenliği", [["Art.20","Yönetim organlarının sorumluluğu"],["Art.21.1","Risk yönetimi yaklaşımı"],["Art.21.2.a","Risk analizi ve bilgi sistemi güvenliği politikaları"],["Art.21.2.b","Olay yönetimi"],["Art.21.2.c","İş sürekliliği, yedekleme ve kriz yönetimi"],["Art.21.2.d","Tedarik zinciri güvenliği"],["Art.21.2.e","Sistem edinme, geliştirme, bakım ve zafiyet yönetimi"],["Art.21.2.f","Kontrollerin etkinliğini değerlendirme"],["Art.21.2.g","Siber hijyen ve eğitim"],["Art.21.2.h","Kriptografi politikaları"],["Art.21.2.i","İnsan kaynakları, erişim ve varlık yönetimi"],["Art.21.2.j","MFA ve güvenli iletişim"],["Art.23","Önemli olayların bildirimi"],["Art.27-28","Kayıtlar ve alan adı verileri"],["Art.29-30","Siber güvenlik bilgi paylaşımı"]]),
  "KVKK (6698)": rows("Kişisel Verilerin Korunması", "KVKK / Hukuk", [["Md.4","Genel ilkeler"],["Md.5","Kişisel veri işleme şartları"],["Md.6","Özel nitelikli kişisel veriler"],["Md.7","Silme, yok etme veya anonimleştirme"],["Md.8","Kişisel verilerin aktarılması"],["Md.9","Yurt dışına aktarım"],["Md.10","Aydınlatma yükümlülüğü"],["Md.11","İlgili kişinin hakları"],["Md.12","Veri güvenliği yükümlülükleri"],["Md.13","Veri sorumlusuna başvuru"],["Md.16","VERBİS yükümlülükleri"],["Yön.1","Saklama ve imha politikası"],["Kurul.1","Kişisel veri ihlali bildirimi"],["Kurul.2","Teknik ve idari tedbirlerin takibi"]]),
  "GDPR (EU 2016/679)": rows("GDPR", "Privacy / Hukuk", [["Art.5","Kişisel veri işleme ilkeleri"],["Art.6","İşlemenin hukuka uygunluğu"],["Art.7-8","Rıza koşulları ve çocukların verisi"],["Art.9-10","Özel nitelikli veri ve mahkûmiyet verisi"],["Art.12-14","Şeffaflık ve bilgilendirme"],["Art.15-22","İlgili kişi hakları"],["Art.24","Veri sorumlusunun sorumluluğu"],["Art.25","Privacy by design ve varsayılan gizlilik"],["Art.26-28","Ortak sorumluluk ve veri işleyen yönetimi"],["Art.30","İşleme faaliyetleri kayıtları"],["Art.32","İşleme güvenliği"],["Art.33-34","Veri ihlali bildirimi"],["Art.35-36","DPIA ve ön danışma"],["Art.37-39","Veri koruma görevlisi"],["Art.44-49","Uluslararası veri aktarımları"],["Art.50","Uluslararası iş birliği"],["Art.83","İdari para cezaları"]]),
};

export const automaticAuditTemplates = [
  "ISO/IEC 27001:2022", "SOC 2 Type I", "SOC 2 Type II", "PCI DSS 4.0.1",
  "NIST Cybersecurity Framework (CSF) 2.0", "CIS Controls v8.1", "ISO 22301:2019",
  "ISO/IEC 27701:2019", "ISO/IEC 27017:2015", "ISO/IEC 27018:2019", "COBIT 2019",
  "DORA (EU 2022/2554)", "NIS2 (EU 2022/2555)", "KVKK (6698)", "GDPR (EU 2016/679)",
] as const;
