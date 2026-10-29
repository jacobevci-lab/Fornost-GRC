# Fornost GRC

**Govern Risk. Prove Compliance. Control AI.**

Fornost GRC, kurumların risklerini, kontrollerini, kanıtlarını, denetimlerini ve iyileştirme çalışmalarını aynı çalışma alanında yönetmesini sağlayan ticari bir **GRC ve AI yönetişimi platformudur**. Amaç, ayrı dosyalarda tutulan kayıtları sorumlu, tarih, kanıt ve bağımsız inceleme kararlarıyla birbirine bağlamaktır.

Ürün müşterinin kendi ortamına kurulur. Çekirdek GRC kullanımı için harici AI hizmeti gerekmez; veri toplayıcılar, kurumsal kimlik, e-posta, ticket ve AI sağlayıcıları ihtiyaca göre yapılandırılır. Paylaşımlı çok müşterili SaaS, bu ürünün dağıtım modeli değildir.

## Ürün ne işe yarar?

| İhtiyaç | Fornost ile yapılan iş |
| --- | --- |
| Riskleri görünür kılmak | Varlık ve BIA bağlamıyla risk değerlendirmesi; risk iştahı, KRI ve aksiyon takibi |
| Uyum çalışmalarını düzenlemek | Gereksinim, kontrol, politika ve kanıt ilişkileri; eksik veya güncel olmayan güvenceyi izleme |
| Denetimi yürütmek | Kapsam/plan, ortak şablonlar ve görev paketleri, gereksinimler, sahip/reviewer atamalı kanıt talepleri, çalışma kâğıtları, durum raporları ve bağımsız kapanış |
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

- **Risk ve güvence:** Risk Assessment, varlık envanteri, BIA, risk iştahı/KRI, ortak kontrol kütüphanesi ve ilişkili kanıtlar.
- **Uyum ve denetim:** Gereksinim katalogları, kapsam planı, [tarihli, isteğe bağlı bağımsız onaylı görevler](docs/audit-milestones.md), sürüme sabitlenmiş kanıt talepleri, bağımsız inceleme, [manuel ve tekrarlanabilir rastgele örneklemli çalışma kâğıtları](docs/audit-workpapers.md#reproducible-random-selection), [tekil/toplu görev, çalışma kâğıdı ve kanıt taleplerinde iş günü termin önerileri](docs/audit-deadline-planning.md), kaydedilmiş durum raporları ve bütün denetim için kapanış/onay.
- **Kanıt kullanımı:** [Kanıt Kütüphanesi’nde kullanım ve değişiklik etkisi](docs/evidence-usage.md); kontrol/uyum, denetim maddesi, talep, çalışma kâğıdı ve CAPA bağlantıları, süreklilik/regülasyon/tedarikçi kararlarının sabit kanıt geçmişi ve kaynak kayda doğrudan geçiş; açık işlerde eski sürüm incelemesi, [kaynak iziyle sorumlu/tarihli takip görevi](docs/evidence-change-followups.md) ve kapsamı belirtilen JSON raporu.
- **Sürekli kontrol:** Desteklenen veri kaynaklarından toplama, zamanlanmış testler, kanıt tazeliği, başarısızlıkların izlenmesi ve CAPA bağlantısı. [Native kaynakların kapsamı](docs/integrations/product-connectors.md) ve [hazır testler](docs/integrations/ready-control-tests.md) ayrı tanımlıdır.
- **Kararda sürümlü kanıt:** Süreklilik tatbikatı/iyileştirme kapanışı, regülasyon etkisi ve tedarikçi değerlendirme/bulgu/çıkış kararları, kütüphaneden dosya sürümü seçer; sunucu bütünlüğü kontrol eder ve karara sabitler. Aktif kullanıcı seçimi, bu akışlarda elle e-posta ve hash girişini azaltır.
- **Kurumsal yaşam döngüleri:** Politika sürümü/yayın/attestation, regülasyon değişikliği ve etkileri, tedarikçi inceleme/offboarding, güvenlik olayı ve süreklilik tatbikatları.
- **AI yönetişimi:** Sağlayıcı politikaları, model envanteri, değerlendirmeler, olaylar, istisnalar, release gate ve emeklilik. Ask Fornost, yetkili bağlam üzerinden kaynaklı analiz ve insan onaylı taslaklar sunar; doğrudan veritabanına bağlanmaz.
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

## Son tamamlanan geliştirmeler

27 Ekim 2026 itibarıyla bu kaynak sürümünün başlıca geliştirmeleri:

- [Tedarikçi kararlarında bağlı kanıt](docs/tprm-connected-evidence.md): etkin sorumlu seçimi, dosya sürümüne sabit kararlar, kaynak değişikliğinde taslak koruma ve kanıttan ilgili işe dönüş.
- [İşlerim'de süreklilik sorumlulukları](docs/continuity-my-work.md): plan onayı/etkinleştirme, gözden geçirme, tatbikat ve iyileştirme açıkları; doğrudan kaynak kayda geçiş ve gerçek kapanış tarihleri.
- [İşlerim'de olay sorumlulukları](docs/incident-my-work.md): sahip ve müdahale yöneticisinin işleri, bağımsız kapanış incelemesi, doğrudan olay kaydına geçiş ve kapanış/yeniden açma sonrası güncel kuyruk.
- [Periyodik plan incelemesi](docs/continuity-plan-review.md): plan ayrıntıları, atanmış bağımsız incelemeci kararı, sonraki inceleme tarihi ve değişmez plan kopyasıyla karar geçmişi.

- [Ortak denetim şablon kütüphanesi](docs/audit-template-library.md): yönetici yayını, sürüm geçmişi, arşivleme ve denetimler arasında plan/görev/paket kullanımı.
- Tarihli görevler, ön koşul zincirleri, özelleştirilebilir toplu görev paketleri, açıkça başlatılan tekrar dönemleri ve isteğe bağlı hatırlatmalar.
- [Ortak iş günü/tatil takvimleri](docs/audit-reminder-profiles.md#shared-organization-calendars): yönetici sürümlemesi, denetimde kaynak sürümü takibi, önizlemeli güncelleme, JSON aktarımı, hatırlatma eşikleri ve tek alıcıya eskalasyon.
- Bağımsız bütün-denetim kapanışı, değişiklik kilitleri, gerekçeli yeniden açma ve doğrulanabilir karar paketi.
- Kanıt sürümüne bağlı çalışma kâğıtları, manuel ve CSV evreninden tekrarlanabilir rastgele örnekleme; sahip/reviewer işlerinin Benim İşlerim'e taşınması.
- Sekiz çekirdek sicil, denetim talebi ve çalışma kâğıdı için kayıt bağlantıları; yapılandırılmış uygulama adresi üzerinden e-posta görev bağlantıları.
- E-posta ekranında bağlantı ve bildirim ayarlarına odaklanan sade kullanım.

Teslim edilenlerle planlananları ayıran güncel kapsam: [Araştırma ve Teslim Durumu](docs/research-delivery-status.md). Yıllık risk bazlı planlama, istatistiksel güven/örneklem büyüklüğü hesaplama ve süreli dış denetçi yetkileri mevcut özellik olarak sunulmaz.

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
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run validate:artifact
```

Gizli değerleri repoya eklemeyin. Entegrasyon şifreleme anahtarı, AI paket mühürleme anahtarı ve scheduler yapılandırması dağıtım ortamına aittir. Test kapsamı ve müşteri ortamındaki kabul adımları [Production Readiness](docs/PRODUCTION-READINESS.md) belgesinde ayrılır; CI başarısı müşteri SSO/e-posta/geri dönüş kabulünün yerine geçmez.

## Lisans

Bu depo kuruma özel/proprietary kaynak kod içerir. Açık kaynak kullanım veya dağıtım lisansı vermez. Yetkisiz kopyalama, dağıtma ve üçüncü taraf ortamlarında çalıştırma izni verilmez.

Kayıtlı görünümler yedi çekirdek liste ve Benim İşlerim'de tekrar kullanılabilir. **Hesap ve ortak görünümler** kişisel tercihleri cihazlar arasında saklar; yöneticiler mevcut modül yetkileriyle kullanılan ortak görünümler yayınlayabilir. Kaydetme önizlemesi, eşzamanlı değişiklik kontrolü ve onaylı kaldırma bulunur. Ortak tanımların sürüm geçmişi değiştireni, gerekçeyi ve eski ölçütleri gösterir; Admin önceki tanımı önizleyip gerekçeyle yeni sürüm olarak geri yükleyebilir. [Hesap ve ortak görünümler](docs/account-team-views.md); mevcut [tarayıcıya özel görünümler](docs/saved-register-views.md) de korunur.


Register XLSX import supports column mapping, row-level validation, paginated record preview, explicit server validation and atomic creation across seven register entry points. Tokenized retries recover lost responses without creating the same batch twice. See [register import](docs/register-import.md) for limits, permissions and recovery; this is not an upsert or content-deduplication service.

Politika kabul kampanyalarında Admin, bağlı politika sürümünü ve kabul/ret/cevapsız sonuçlarını inceleyip gerekçeli kapanış yapabilir. Kapanış yanıtları değiştirmez; aktif iş kuyruğunu ve politika kaldırma engelini günceller. [Kampanya sonuçları ve kapanış](docs/policy-campaign-completion.md).

Politika kararlarında kütüphaneden gerçek dosya sürümü, sorumlu/incelemeci atamalarında etkin kullanıcı seçilebilir. Karar bağlamı, ayrı gönderim/onay/yayın/istisna/kaldırma kanıtları ve Kanıt Kullanımı üzerinden kaynağa dönüş korunur. [Bağlı politika kararları](docs/policy-connected-evidence.md).

CAPA atamalarında etkin kullanıcılar, gönderim/kapanış/risk kabulünde kütüphanedeki gerçek dosya sürümleri seçilebilir. Güncel bulgu ve plan incelemesi, hata sonrası taslak kurtarma, ayrı karar kanıtları ve Kanıt Kullanımı üzerinden bulguya dönüş korunur. [Bağlı CAPA kararları](docs/capa-connected-evidence.md).

Güvenlik Olayları artık etkin ekip seçimi, kütüphaneden kanıt sürümü ve olaya özel karar geçmişiyle ilerler. Bağlantı kesintisinde taslaklar korunur; aynı ilan formunun tekrar gönderilmesi kayıt çoğaltmaz. [Bağlı olay kararları](docs/incident-connected-evidence.md).

Tedarikçi detayında **İncelemeciyi değiştir** ile Admin, devre dışı kalan incelemecinin açık işlerini etkin bağımsız Admin’e devredebilir. Gerekçeli devir geçmişi ve gerçek karar sahipleri korunur. [İş akışı ve sınırlar](docs/tprm-reviewer-handoff.md).


### Tedarikçi değerlendirmesinde düzeltme

Atanmış risk sahibi taslak değerlendirmeyi gerekçeyle düzenleyebilir; bağımsız Admin incelemeci gönderilmiş değerlendirmeyi düzeltme için geri verebilir. İş, mevcut My Work akışında risk sahibine döner; düzeltmeden sonra kanıt sürümü seçilerek yeniden gönderilir. Önceki/sonraki içerik, gerekçe ve kanıt geçmişi korunur. Yetkisiz Admin düzenlemesi, eşzamanlı değişiklik ve aynı isteğin tekrar kaydı engellenir. [İş akışı, yetkiler ve kurtarma](docs/tprm-assessment-correction.md).
