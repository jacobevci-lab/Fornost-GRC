export type Soc2TemplateControl={tscId:string;tscCategory:string;expectation:string;controlOwner:string;frequency:string;expectedEvidence:string;typeIITestApproach:string;isoAnnex:string;isoClauses:string};
// Reference coverage across all five categories. Topic labels are not the licensed
// criterion text or the revised 2022 points of focus.
export const soc2TemplateMeta={id:"soc2-tsc-reference-v2",name:"SOC 2 Trust Services Criteria",auditName:"SOC 2 Type II",scope:["Security","Availability","Confidentiality","Processing Integrity","Privacy"],phaseTwo:[]} as const;
const topics: Array<[string,string,string]> = [
  [
    "CC1.1",
    "Security",
    "Etik sorumluluk"
  ],
  [
    "CC1.2",
    "Security",
    "Bağımsız gözetim"
  ],
  [
    "CC1.3",
    "Security",
    "Yetki yapısı"
  ],
  [
    "CC1.4",
    "Security",
    "Yetkin personel"
  ],
  [
    "CC1.5",
    "Security",
    "Hesap verebilirlik"
  ],
  [
    "CC2.1",
    "Security",
    "Bilgi kalitesi"
  ],
  [
    "CC2.2",
    "Security",
    "İç iletişim"
  ],
  [
    "CC2.3",
    "Security",
    "Dış iletişim"
  ],
  [
    "CC3.1",
    "Security",
    "Açık hedefler"
  ],
  [
    "CC3.2",
    "Security",
    "Risk analizi"
  ],
  [
    "CC3.3",
    "Security",
    "Hile riski"
  ],
  [
    "CC3.4",
    "Security",
    "Değişim riskleri"
  ],
  [
    "CC4.1",
    "Security",
    "Sürekli değerlendirme"
  ],
  [
    "CC4.2",
    "Security",
    "Eksiklik bildirimi"
  ],
  [
    "CC5.1",
    "Security",
    "Kontrol seçimi"
  ],
  [
    "CC5.2",
    "Security",
    "Teknoloji kontrolleri"
  ],
  [
    "CC5.3",
    "Security",
    "Politika uygulaması"
  ],
  [
    "CC6.1",
    "Security",
    "Erişim mimarisi"
  ],
  [
    "CC6.2",
    "Security",
    "Kimlik kaydı"
  ],
  [
    "CC6.3",
    "Security",
    "Yetki kaldırma"
  ],
  [
    "CC6.4",
    "Security",
    "Fiziksel erişim"
  ],
  [
    "CC6.5",
    "Security",
    "Güvenli imha"
  ],
  [
    "CC6.6",
    "Security",
    "Sınır koruması"
  ],
  [
    "CC6.7",
    "Security",
    "Aktarım koruması"
  ],
  [
    "CC6.8",
    "Security",
    "Zararlı yazılım"
  ],
  [
    "CC7.1",
    "Security",
    "Zafiyet tespiti"
  ],
  [
    "CC7.2",
    "Security",
    "Anomali izleme"
  ],
  [
    "CC7.3",
    "Security",
    "Olay değerlendirmesi"
  ],
  [
    "CC7.4",
    "Security",
    "Olay müdahalesi"
  ],
  [
    "CC7.5",
    "Security",
    "Olaydan kurtarma"
  ],
  [
    "CC8.1",
    "Security",
    "Kontrollü değişiklik"
  ],
  [
    "CC9.1",
    "Security",
    "Kesinti riskleri"
  ],
  [
    "CC9.2",
    "Security",
    "Tedarikçi riskleri"
  ],
  [
    "A1.1",
    "Availability",
    "Kapasite yönetimi"
  ],
  [
    "A1.2",
    "Availability",
    "Kurtarma altyapısı"
  ],
  [
    "A1.3",
    "Availability",
    "Kurtarma testleri"
  ],
  [
    "C1.1",
    "Confidentiality",
    "Gizli bilgi"
  ],
  [
    "C1.2",
    "Confidentiality",
    "Gizli imha"
  ],
  [
    "PI1.1",
    "Processing Integrity",
    "İşleme özellikleri"
  ],
  [
    "PI1.2",
    "Processing Integrity",
    "Girdi doğruluğu"
  ],
  [
    "PI1.3",
    "Processing Integrity",
    "İşlem doğruluğu"
  ],
  [
    "PI1.4",
    "Processing Integrity",
    "Çıktı doğruluğu"
  ],
  [
    "PI1.5",
    "Processing Integrity",
    "Saklama doğruluğu"
  ],
  [
    "P1.1",
    "Privacy",
    "Mahremiyet bildirimi"
  ],
  [
    "P2.1",
    "Privacy",
    "Tercih rıza"
  ],
  [
    "P3.1",
    "Privacy",
    "Sınırlı toplama"
  ],
  [
    "P3.2",
    "Privacy",
    "Önceden rıza"
  ],
  [
    "P4.1",
    "Privacy",
    "Amaçla kullanım"
  ],
  [
    "P4.2",
    "Privacy",
    "Saklama süresi"
  ],
  [
    "P4.3",
    "Privacy",
    "Veri imhası"
  ],
  [
    "P5.1",
    "Privacy",
    "Kişisel erişim"
  ],
  [
    "P5.2",
    "Privacy",
    "Veri düzeltme"
  ],
  [
    "P6.1",
    "Privacy",
    "İzinli paylaşım"
  ],
  [
    "P6.2",
    "Privacy",
    "Paylaşım kayıtları"
  ],
  [
    "P6.3",
    "Privacy",
    "Üçüncü taraf"
  ],
  [
    "P6.4",
    "Privacy",
    "Uyum güvencesi"
  ],
  [
    "P6.5",
    "Privacy",
    "İhlal düzeltme"
  ],
  [
    "P6.6",
    "Privacy",
    "İhlal bildirimi"
  ],
  [
    "P6.7",
    "Privacy",
    "Paylaşım dökümü"
  ],
  [
    "P7.1",
    "Privacy",
    "Veri kalitesi"
  ],
  [
    "P8.1",
    "Privacy",
    "Şikâyet takibi"
  ]
];
export const soc2TemplateControls:Soc2TemplateControl[]=topics.map(([tscId,tscCategory,expectation])=>({tscId,tscCategory,expectation,controlOwner:"Atanmadı",frequency:"Kuruluş tarafından belirlenir",expectedEvidence:"Kapsama uygun politika, onay ve işlem örnekleri",typeIITestApproach:"Kontrol tasarımı ile dönem içindeki operasyonel etkinliği seçilen örneklemle değerlendir; test dönemi ve istisnaları kaydet.",isoAnnex:"",isoClauses:""}));
