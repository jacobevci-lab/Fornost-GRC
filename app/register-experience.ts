type Language = "tr" | "en";
type Copy = { description: string; create: string; emptyTitle: string; emptyBody: string; formHint: string };

const copy: Record<string, Record<Language, Copy>> = {
  "Risk Assessment": {
    tr: { description: "Riskleri, etkilenen varlıkları ve sorumluları birlikte izleyin; değerlendirme ve aksiyonları tamamlayın.", create: "İlk riski ekle", emptyTitle: "Henüz risk kaydı yok", emptyBody: "Bir risk tanımlayın, etkilenen varlığı ve sorumlusunu seçin. Değerlendirmeyi ve kontrol bağlantılarını daha sonra tamamlayabilirsiniz.", formHint: "Riskin başlığını, sorumlusunu ve etkilenen varlığı belirtin. Değerlendirme ve aksiyon ayrıntılarını gelişmiş alanlarda tamamlayabilirsiniz." },
    en: { description: "Track risks with affected assets and owners, then complete assessments and treatment actions.", create: "Add your first risk", emptyTitle: "No risks recorded yet", emptyBody: "Describe a risk and select its affected asset and owner. Complete the assessment and control links as the review progresses.", formHint: "Enter the risk title, owner and affected asset. Assessment and treatment details are available in the advanced fields." },
  },
  "Varlık Envanteri": {
    tr: { description: "Varlıkların sorumlularını, kritikliğini ve güvenlik kapsamını yönetin; ilgili risk ve süreçlerle ilişkilendirin.", create: "İlk varlığı ekle", emptyTitle: "Varlık envanterinizi oluşturun", emptyBody: "Bir uygulama, sistem veya hizmetle başlayın. Bu kayıt, risk ve iş etki analizlerinde tekrar kullanılabilir.", formHint: "Varlığı tanımlayın ve sorumlusunu belirtin. Teknik özellikleri ve güvenlik kapsamını gelişmiş alanlarda tamamlayabilirsiniz." },
    en: { description: "Manage asset ownership, criticality and security coverage, with links to risks and business processes.", create: "Add your first asset", emptyTitle: "Start your asset inventory", emptyBody: "Begin with an application, system or service. Reuse the asset in risk and business impact assessments.", formHint: "Identify the asset and its owner. Complete technical details and security coverage in the advanced fields." },
  },
  BIA: {
    tr: { description: "Süreç kesintilerinin iş etkisini değerlendirin; kabul edilebilir kesinti ve kurtarma hedeflerini belirleyin.", create: "İlk iş etki analizini ekle", emptyTitle: "İlk kritik sürecinizi değerlendirin", emptyBody: "Süreci, sorumlusunu ve bağımlılıklarını tanımlayın. İş etkisi ve kurtarma hedefleri, süreklilik planınızı besler.", formHint: "Süreci ve sorumlusunu tanımlayın. İş etkisini ve kurtarma hedeflerini değerlendirirken gelişmiş alanları kullanın." },
    en: { description: "Assess the business impact of process disruption and define tolerable downtime and recovery targets.", create: "Add your first impact assessment", emptyTitle: "Assess your first critical process", emptyBody: "Identify the process, owner and dependencies. Use its business impact and recovery targets to inform continuity planning.", formHint: "Identify the process and owner. Use the advanced fields to assess business impact and recovery targets." },
  },
  Uyum: {
    tr: { description: "Standart gereksinimlerini sorumlular, kontroller ve kanıtlarla eşleyin; uyum eksiklerini takip edin.", create: "İlk uyum kaydını ekle", emptyTitle: "Uyum kapsamınızı tanımlayın", emptyBody: "Bir standart ve gereksinim seçin. Uygulama durumunu, sorumlusunu ve destekleyici kanıtlarını bu kayıt üzerinden izleyin.", formHint: "İlgili standart ve gereksinimi belirtin. Uygulama durumu ile kanıt durumunu ayrı ayrı değerlendirin." },
    en: { description: "Map requirements to owners, controls and evidence, then track compliance gaps.", create: "Add your first compliance record", emptyTitle: "Define your compliance scope", emptyBody: "Start with a standard and requirement. Track its implementation, owner and supporting evidence together.", formHint: "Identify the standard and requirement. Assess implementation and evidence status separately." },
  },
  Kontroller: {
    tr: { description: "Kontrolleri bir kez tanımlayın; risk, standart ve denetimlerde aynı kontrolü ve kanıtlarını kullanın.", create: "İlk kontrolü ekle", emptyTitle: "Kontrol kütüphanenizi oluşturun", emptyBody: "Kontrolün amacını ve sorumlusunu belirtin. İlgili standartları ve kanıtları bağlayarak farklı değerlendirmelerde tekrar kullanın.", formHint: "Kontrolün amacını, sorumlusunu ve uygulama sıklığını belirtin. Aynı kontrol farklı standart ve denetimlere bağlanabilir." },
    en: { description: "Define controls once and reuse them with their evidence across risks, standards and audits.", create: "Add your first control", emptyTitle: "Build your control library", emptyBody: "Describe the control's purpose and owner. Link its standards and evidence for reuse across assessments.", formHint: "Describe the control's purpose, owner and frequency. The same control can support several standards and audits." },
  },
  Kanıtlar: {
    tr: { description: "Kanıtları ilgili kontrollere bağlayın; sürüm, inceleme ve güncellik durumlarını birlikte takip edin.", create: "İlk kanıtı yükle", emptyTitle: "İlk destekleyici kanıtı ekleyin", emptyBody: "Bir kanıt dosyası yükleyin ve ilgili kontrolle ilişkilendirin. Onay durumu ile kanıtın güncelliği ayrı değerlendirilir.", formHint: "Dosyayı, kanıtın amacını ve ilgili kontrolü belirtin. Yükleme, kanıtın bağımsız inceleme veya onayının yerine geçmez." },
    en: { description: "Link evidence to controls and track versions, review status and freshness together.", create: "Upload your first evidence", emptyTitle: "Add your first supporting evidence", emptyBody: "Upload a file and link it to the relevant control. Approval and evidence freshness are assessed separately.", formHint: "Specify the file, its purpose and related control. Uploading evidence does not replace independent review or approval." },
  },
  Tedarikçiler: {
    tr: { description: "Tedarikçi ve hizmet sahipliğini, kritikliği ve değerlendirme tarihlerini takip edin.", create: "İlk tedarikçiyi ekle", emptyTitle: "Tedarikçi envanterinizi oluşturun", emptyBody: "Bir tedarikçi veya hizmet ekleyin; sorumlusunu ve kurumunuz için önemini belirtin.", formHint: "Tedarikçiyi veya hizmeti ve sorumlusunu belirtin. Sözleşme ve değerlendirme ayrıntılarını daha sonra tamamlayabilirsiniz." },
    en: { description: "Track vendors and services, their owners, criticality and assessment dates.", create: "Add your first vendor", emptyTitle: "Start your vendor inventory", emptyBody: "Add a vendor or service, identify its owner and describe its importance to your organization.", formHint: "Identify the vendor or service and owner. Complete contract and assessment details as the review progresses." },
  },
  "Denetim Yönetimi": {
    tr: { description: "Denetim kapsamını, sorumluları, kanıtları ve inceleme adımlarını birlikte takip edin.", create: "İlk denetim maddesini ekle", emptyTitle: "Denetim kapsamını oluşturun", emptyBody: "İncelenecek maddeyi tanımlayın ve sorumlusunu belirleyin.", formHint: "İncelenecek gereksinimi, beklenen kanıtı ve sorumlusunu belirtin. İlerleme ile kanıt inceleme durumunu ayrı takip edin." },
    en: { description: "Track audit scope, ownership, evidence and review steps together.", create: "Add your first audit requirement", emptyTitle: "Define the audit scope", emptyBody: "Describe the requirement to assess and assign its owner.", formHint: "Describe the requirement, expected evidence and owner. Track progress and evidence review separately." },
  },
};

export function registerExperience(module: string, lang: Language): Copy {
  return copy[module]?.[lang] || (lang === "tr"
    ? { description: "Kayıtları ve sorumlularını birlikte takip edin.", create: "İlk kaydı ekle", emptyTitle: "Henüz kayıt yok", emptyBody: "İlk kaydı ekleyerek bu çalışma alanını kullanmaya başlayın.", formHint: "Gerekli bilgileri tamamlayın. Kaydetmeden önce ilişkili kayıtları kontrol edin." }
    : { description: "Track records and their owners together.", create: "Add your first record", emptyTitle: "No records yet", emptyBody: "Add the first record to start using this workspace.", formHint: "Complete the required information and check linked records before saving." });
}
