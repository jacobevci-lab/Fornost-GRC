# Fornost GRC

**Govern Risk. Prove Compliance. Control AI.**

Connected GRC · Continuous Assurance · AI-native GRC

Kaynak kapsamı: 25 Kasım 2026. [Canlı uygulama](https://app.fornostsecurity.com) · [Güncel tasarım sözleşmesi](docs/DESIGN-SYSTEM.md) · [Dokümantasyon](docs/README.md). Canlı revizyon `/api/health` ve yayın smoke kontrolüyle doğrulanır; roadmap tamamlanma iddiası değildir.

Fornost GRC, kurumların risklerini, kontrollerini, kanıtlarını, denetimlerini ve iyileştirme çalışmalarını aynı çalışma alanında yönetmesini sağlayan ticari bir **GRC ve AI yönetişimi platformudur**. Amaç, ayrı dosyalarda tutulan kayıtları sorumlu, tarih, kanıt ve bağımsız inceleme kararlarıyla birbirine bağlamaktır.

Ürün müşterinin kendi ortamına kurulur. Çekirdek GRC kullanımı için harici AI hizmeti gerekmez; veri toplayıcılar, kurumsal kimlik, e-posta, ticket ve AI sağlayıcıları ihtiyaca göre yapılandırılır. Paylaşımlı çok müşterili SaaS, bu ürünün dağıtım modeli değildir.

Güvenlik Anketi Copilot, CSV/TSV sütun eşleme, iki dilli örnek anket ve kaynaklarla desteklenen, insan incelemeli dışa aktarım sunar. Tedarikçi güvence analizi bağlı kanıtları kullanabilir ve insan onayıyla yerel CAPA / taslak kontrol kayıtları açabilir. Kapsam ve gizlilik sınırları: [AI for GRC](docs/AI-FOR-GRC.md).

Enterprise kapsamları; iştirak bazında yetkili kayıt oluşturma, konsolide görünüm ve kapsam içi GRC haritası sunar. Çapraz çerçeve uyumu, güncel onaylı kanıt ve bağımsız kontrol doğrulamasıyla hesaplanır. FAIR-Lite, para birimlerini karıştırmadan SLE/ALE maruziyetini gösterir. Ayrıntılar: [Enterprise ölçeklendirme](docs/enterprise-scale-delivery.md).

## Ürün ne işe yarar?

| İhtiyaç | Fornost ile yapılan iş |
| --- | --- |
| Riskleri görünür kılmak | Varlık ve BIA bağlamıyla risk değerlendirmesi; risk iştahı, KRI ve aksiyon takibi |
| Uyum çalışmalarını düzenlemek | Gereksinim, kontrol, politika ve kanıt ilişkileri; eksik veya güncel olmayan güvenceyi izleme |
| Denetimi yürütmek | Dört çalışma alanı, madde içinde yönlendirme ve isteğe bağlı pano; görünür düzenleme/arşivleme ve bağlantı önizlemeli silme; kapsam/plan, ortak şablonlar ve görev paketleri, gereksinimler, sahip/reviewer atamalı kanıt talepleri, çalışma kâğıtları, durum raporları ve bağımsız kapanış |
| Bulguları sonuçlandırmak | Onaylı çalışma kâğıdı istisnasından kaynak iziyle CAPA aktarımı; kaynağa bağlı CAPA, kök neden, sorumlu, son tarih, kanıt ve bağımsız kapanış doğrulaması |
| Operasyonel dayanıklılık | Tedarikçi değerlendirmesi, güvenlik olayları, BIA bağlantılı süreklilik planları ve tatbikatlar |
| AI kullanımını yönetmek | Model envanteri, risk/değerlendirme, yaşam döngüsü kararları, izleme ve insan onaylı AI desteği |
| Günlük işleri takip etmek | Benim İşlerim, yetkili kayıt araması, tam kayda giden bağlantılar ve yapılandırılmış görev bildirimleri |

Bir kontrolün kaydedilmesi onun etkin olduğunu, bir kanıtın yüklenmesi kabul edildiğini veya bir denetimin kapanması tüm bulguların çözüldüğünü göstermez. Ürün bu durumları ayrı izler. Ayrıntılı kapsam ve sınırlar: [Ürün Tanıtımı](docs/PRODUCT-OVERVIEW.md).

## Buradan başlayın

| Okuyucu | Rehber |
| --- | --- |
| Ürünü değerlendiren ekip | [Ürün Tanıtımı ve Modül Haritası](docs/PRODUCT-OVERVIEW.md) |
| Risk, uyum, denetim ve iş birimi kullanıcıları | [Kullanıcı Rehberi](docs/USER-GUIDE.md) |
| Uygulama yöneticisi | [Yönetici Rehberi](docs/ADMIN-GUIDE.md) |
| Kurulum ve operasyon ekibi | [Linux Kurulumu](docs/LINUX-INSTALLATION.md) · [Yedekleme ve Kurtarma](docs/onprem/backup-recovery.md) |
| Geliştirici ve teknik inceleme ekibi | [Mimari](docs/ARCHITECTURE.md) · [Güvenlik](SECURITY.md) · [Test Stratejisi](docs/TEST-STRATEGY.md) |
| Tüm belgeler | [Dokümantasyon Dizini](docs/README.md) |

## Başlıca iş akışları

- **Risk ve güvence:** Risk Değerlendirmesi, varlık envanteri, BIA, risk iştahı/KRI, ortak kontrol kütüphanesi ve ilişkili kanıtlar.
- **Uyum ve denetim:** Gereksinim katalogları, kapsam planı, [tarihli, isteğe bağlı bağımsız onaylı görevler](docs/audit-milestones.md), sürüme sabitlenmiş kanıt talepleri, bağımsız inceleme, [manuel ve tekrarlanabilir rastgele örneklemli çalışma kâğıtları](docs/audit-workpapers.md#reproducible-random-selection), [tekil/toplu görev, çalışma kâğıdı ve kanıt taleplerinde iş günü termin önerileri](docs/audit-deadline-planning.md), kaydedilmiş durum raporları ve bütün denetim için kapanış/onay.
- **Kanıt kullanımı:** [Kanıt Kütüphanesi’nde kullanım ve değişiklik etkisi](docs/evidence-usage.md); kontrol/uyum, denetim maddesi, talep, çalışma kâğıdı ve CAPA bağlantıları, süreklilik/regülasyon/tedarikçi kararlarının sabit kanıt geçmişi ve kaynak kayda doğrudan geçiş; açık işlerde eski sürüm incelemesi, [kaynak iziyle sorumlu/tarihli takip görevi](docs/evidence-change-followups.md) ve kapsamı belirtilen JSON raporu.
- **Sürekli kontrol:** Desteklenen veri kaynaklarından toplama, zamanlanmış testler, kanıt tazeliği, başarısızlıkların izlenmesi ve CAPA bağlantısı. [Native kaynakların kapsamı](docs/integrations/product-connectors.md) ve [hazır testler](docs/integrations/ready-control-tests.md) ayrı tanımlıdır.
- **Kararda sürümlü kanıt:** Süreklilik tatbikatı/iyileştirme kapanışı, regülasyon etkisi ve tedarikçi değerlendirme/bulgu/çıkış kararları, kütüphaneden dosya sürümü seçer; sunucu bütünlüğü kontrol eder ve karara sabitler. Aktif kullanıcı seçimi, bu akışlarda elle e-posta ve hash girişini azaltır.
- **Kurumsal yaşam döngüleri:** Politika sürümü/yayın/attestation, regülasyon değişikliği ve etkileri, tedarikçi inceleme/offboarding, güvenlik olayı ve süreklilik tatbikatları.
- **AI yönetişimi:** Sağlayıcı politikaları, model envanteri, değerlendirmeler, olaylar, istisnalar, release gate ve emeklilik. Beş soruluk EU AI Act ön sınıflandırması, atanan kontrol listesi, AI BOM / MCP yetki haritası ve CSV tabanlı Shadow AI keşfi mevcut bağımsız onay kapılarına bağlıdır.
- **Agentic Ask Fornost:** Güncel kaynak kodlarıyla bağlantılı analiz; süreli, kullanıcıya ve kaynak sürümüne bağlı HITL kartlarıyla risk taslağı ve kurum içi hatırlatma oluşturma. Regülasyon Boşluk Ajanı, yayındaki politika maddelerini ve aktif kontrolleri karşılaştırarak insan onayıyla yeni politika taslak sürümü / CAPA açar. Model çıktısı SQL veya araç çalıştıramaz. [Kullanım ve sınırlar](docs/agentic-grc.md).
- **Günlük çalışma:** TR/EN arayüz, Benim İşlerim, sekiz çekirdek sicilde kayıt araması, filtre bağlamına dönüş ve yetki kontrolüyle açılan paylaşılabilir kayıt/görev bağlantıları.

## AI güvence ve karar takibi

AI yönetişimi yalnız sohbet ekranından oluşmaz. Model bazında doğruluk, hata, drift, bias, gecikme ve ölçüm tazeliği için **tekilleştirilmiş güvence alarmları**; kaynak bağlantılı bulgular, CAPA ve **bağımsız kanıt doğrulaması** bulunur. Üretim release gate, **18 bağımsız kontrol alanını** değerlendirir; açık engeller karar bağlamında görünür kalır.

Tekrarlayan dönem, sorumlu, doğrulayıcı ve kanıtla **operasyonel regülasyon yükümlülük** takibi yapılır. Modelin **kontrollü AI emeklilik süreci**, veri/erişim/bağımlılık kapanışının doğrulanmasını ister. Model denetim paketi **HMAC-SHA-256 sunucu mührü** ile sonradan doğrulanabilir; bu, dış güven kuruluşunca verilen elektronik imza değildir. Sağlayıcı, veri sınırları ve yaşam döngüleri için [AI Architecture](docs/AI-ARCHITECTURE.md) okunmalıdır.

## Modüllerin ayrıntılı rehberleri

| Alan | Teknik ve iş akışı belgesi |
| --- | --- |
| Bağlantılı kayıtlar | [Connected GRC Relationship Intelligence](docs/CONNECTED-GRC.md) |
| Risk iştahı ve ölçüm | [Enterprise Risk Appetite & KRI](docs/ENTERPRISE-RISK-APPETITE-KRI.md) |
| Bulgu ve iyileştirme | [Enterprise Findings & CAPA](docs/ENTERPRISE-FINDINGS-CAPA.md) |
| Politika/sürüm/yayın | [Enterprise Policy Lifecycle Management](docs/POLICY-LIFECYCLE-MANAGEMENT.md) |
| Üçüncü taraf değerlendirmesi | [Third-Party Risk Management 2.0](docs/THIRD-PARTY-RISK-MANAGEMENT.md) |
| Regülasyon değişiklikleri | [Regulatory Change Intelligence](docs/REGULATORY-CHANGE-INTELLIGENCE.md) |
| Güvenlik olayı | [Enterprise Incident & Crisis Management](docs/ENTERPRISE-INCIDENT-CRISIS-MANAGEMENT.md) |
| İş sürekliliği | [Enterprise Business Continuity](docs/ENTERPRISE-BUSINESS-CONTINUITY.md) |

## Güncel kurumsal iş akışları

| Alan | Mevcut davranış ve ayrıntılı sözleşme |
| --- | --- |
| Doğrudan madde güvencesi | Kontrol bağlamak isteğe bağlıdır. Uygulama beyanı, onaylı EVD/yayındaki POL ve bağımsız madde doğrulamasıyla değerlendirilir. Kanıtsız beyan tam uyum sayılmaz. [İşleyiş](docs/direct-requirement-assurance.md) |
| Ortak kontrol ve iştirak | Çoklu çerçeve eşleme, `org_entity` kapsamı, yetkili konsolide görünüm ve para birimi bazlı FAIR-Lite SLE/ALE. [Enterprise](docs/enterprise-scale-delivery.md) |
| Kurumsal giriş | Yapılandırılmış SSO, AD/LDAP köprüsü ve yetkili yerel acil durum hesapları; giriş yöntemi denetim izi. [Kimlik](docs/roadmap/enterprise-workspace-login.md) |
| AI destekli işler | LLMGateway, yerel/BYOK/kural modu; RBAC/SoD korumalı araçlar, insan onaylı taslaklar. [Araçlar](docs/modular-agent-tools.md) · [Anket ve tedarikçi analizi](docs/AI-FOR-GRC.md) |
| Dış paydaşlar | Süreli/iptal edilebilir tedarikçi anketi, kısıtlı belge için NDA ve insan erişim onayı. Simülasyon canlı telemetriden ayrıdır. [Portallar ve entegrasyonlar](docs/external-stakeholder-delivery.md) |
| Raporlama | Modüller arası kaynak toplama, yerelleştirilmiş HTML/PDF, Unicode font, PBC özeti ve Board paketi. [Raporlama](docs/roadmap/report-localization-complete-scope.md) |
| Kayıt deneyimi | Kompakt TR/EN, açık/koyu; hesap/ekip görünümleri, kolon eşleme ve doğrulamalı XLSX içe aktarım. [Görünümler](docs/account-team-views.md) · [İçe aktarma](docs/register-import.md) |
| Bağımsız kararlar | Politika/CAPA/olay/tedarikçi/süreklilik kararlarında kaynak dosya sürümü, değişiklik kontrolü ve korunmuş geçmiş. [Kullanıcı rehberi](docs/USER-GUIDE.md) |

Yıllık risk bazlı denetim planlama, istatistiksel örneklem büyüklüğü ve süreli dış **denetçi** çalışma alanı yetkisi mevcut özellik olarak sunulmaz. Tedarikçi/Trust Center bağlantıları bu yetkiyi vermez. [2027 vizyonu](docs/FORNOST_PRODUCT_VISION_2027.md) hedefleri, tarihli teslim belgeleri kendi sürüm kapsamını anlatır.

## Kurulum

Standart on-prem paket x86_64/amd64 ve `/fornost-grc` yolu içindir. RHEL 8/9 ailesinde Podman önerilir; Docker da desteklenir. Standart kurulum host üzerinde Node.js/npm veya uygulama derlemesi gerektirmez.

```bash
curl -fsSL https://raw.githubusercontent.com/jacobevci-lab/Fornost-GRC/main/scripts/linux/quick-install.sh | sudo bash
```

Kurucu kaynakları `/opt/fornost-grc` altına alır, en az 8 GiB boş alanı kontrol eder, seçili commit için test edilmiş paketi indirir ve SHA-256 doğrulaması yapar. Scripti önce incelemek, farklı runtime seçmek veya manuel kurulum yapmak için [Linux Kurulum Rehberi](docs/LINUX-INSTALLATION.md) kullanılmalıdır.

Varsayılan adres: `https://SUNUCU_IP:8443/fornost-grc/`. İlk girişte yerel Admin oluşturulur. İlk TLS sertifikası kendinden imzalıdır; kurumsal kullanımda güvenilir sertifika yapılandırın. Uygulama kayıtları ve kanıtlar kalıcı container volume'ünde tutulur. Güncelleme öncesinde [yedek alın](docs/onprem/backup-recovery.md); aynı sunucudaki volume kalıcılığı yedekleme değildir.

## Teknik yapı ve geliştirme

Next.js/React/TypeScript arayüzü ve API'ler, Vinext/Vite ile Worker uyumlu çalışma zamanında çalışır. Hosted dağıtım D1/R2 binding'lerini, on-prem container ise kalıcı volume üzerindeki yerel D1/R2 durumunu kullanır. Ayrıntılar [mimaride](docs/ARCHITECTURE.md).

Geliştirme gereksinimi: Node.js `>=22.13.0`, npm ve doğrulama scriptleri için Linux/GNU araçları.

```bash
npm ci
npm run dev
```

```bash
npm run check:design
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run validate:artifact
```

Gizli değerleri repoya eklemeyin. Entegrasyon şifreleme anahtarı, AI paket mühürleme anahtarı ve scheduler yapılandırması dağıtım ortamına aittir. Test kapsamı ve müşteri ortamındaki kabul adımları [Production Readiness](docs/PRODUCTION-READINESS.md) belgesinde ayrılır; CI başarısı müşteri SSO/e-posta/geri dönüş kabulünün yerine geçmez.

## Lisans

Bu depo kuruma özel/proprietary kaynak kod içerir. Açık kaynak kullanım veya dağıtım lisansı vermez. Yetkisiz kopyalama, dağıtma ve üçüncü taraf ortamlarında çalıştırma izni verilmez.
