# Fornost GRC — Ürün Tanıtımı

[Dokümantasyon dizini](README.md) · [Kullanıcı rehberi](USER-GUIDE.md) · [Yönetici rehberi](ADMIN-GUIDE.md)

Kapsam tarihi: 19 Ekim 2026. Bu belge mevcut ürünü anlatır; [2027 ürün vizyonu](FORNOST_PRODUCT_VISION_2027.md) gelecek yönünü, [teslim durumu](research-delivery-status.md) ise kalan işleri gösterir.

## Hangi problemi çözer?

Risk, kontrol, politika, denetim ve kanıt farklı dosyalarda tutulduğunda aynı veri tekrar girilir; sorumlular, son tarihler ve inceleme kararları birbirinden kopar. Fornost bu kayıtları aynı kurulumda toplar ve aralarındaki ilişkileri görünür kılar. Bir bulgunun kaynağından aksiyonuna, aksiyondan kanıtına ve bağımsız kapanış kararına kadar izlenebilir bir çalışma düzeni sağlar.

Platform; güvenlik/GRC ekipleri, risk ve uyum sorumluları, iç denetçiler, kontrol sahipleri, iş sürekliliği ekipleri ve AI yönetişim ekipleri için tasarlanmıştır. Yönetim, rapor ve güvence özetlerini kullanır; uygulama yöneticisi erişim, entegrasyon ve işletim ayarlarını yönetir.

## Modül haritası

Menüler kullanıcı rolü ve modül izinlerine göre görünür. Aşağıdaki alanlar tam çalışma alanı kapsamını anlatır; kısıtlı modül erişimi bütün kurumsal iş akışlarını açmaz.

| Alan | İşlev ve üretilen çıktı |
| --- | --- |
| Ana Sayfa, Benim İşlerim | Öncelikler, sahip olunan ve inceleme bekleyen işler, kaynağa doğrudan geçiş |
| Risk Assessment | Risk sicili, değerlendirme, sorumlu ve aksiyon bağlamı |
| Risk İştahı ve KRI | Eşikler, kanıtlı ölçümler, ihlaller, stres senaryoları ve yönetim paketi |
| Varlık Envanteri | Risk ve kontrollerin bağlandığı varlık kayıtları |
| BIA | İş etkisi ve süreklilik hedefleri için süreç/hizmet bağlamı |
| İş Sürekliliği | BIA bağlantılı planlar, onay, tatbikat, hedef ihlali ve iyileştirme açıkları |
| Tedarikçiler | Üçüncü taraf sicili; tam çalışma alanında due diligence, değerlendirme, bulgu ve offboarding |
| Uyum, Kontroller | Gereksinim ve ortak kontrol kayıtları; uygulama etkinliği ve kanıt bağlamı |
| Kanıtlar | Dosya, sürüm, hash, inceleme ve bağlı kayıtlar |
| Kanıt Otomasyonu | Kaynak bağlantıları, veri toplama, test kuralları, tazelik ve çalışma sonuçları |
| Denetim Yönetimi | Portföy, kapsam/plan, sahip ve tarihli görevler, gereksinim, kanıt talepleri, çalışma kâğıtları, durum raporu ve kapanış |
| Bulgular ve CAPA | Kaynak bağlantısı, kök neden, düzeltici/önleyici aksiyon, SLA, risk kabulü ve bağımsız kapanış |
| Güvenlik Olayları | Triaj, müdahale, recovery, bildirim kararı, RCA ve lessons learned |
| Politika Merkezi | Politika/sürüm, bağımsız inceleme, yayın, çalışan attestation ve istisna |
| Regülasyon Merkezi | Kaynak sicili, değişiklik triajı, etki bağlantıları ve sorumlu aksiyonlar |
| Bağlantılı GRC | Kayıtlar arası ilişkiler, eksik bağlantılar ve güvence boşluklarının incelenmesi |
| Raporlar | Kapsam/filtre seçimi, önizleme ve PDF/HTML/CSV/Excel çıktıları |
| AI Yönetişimi, Ask Fornost | Model yaşam döngüsü, güvence kararları ve yetkili bağlamla AI desteği |
| Yönetim | Sistem, AI, ana veri, iş akışı entegrasyonları, e-posta ve kimlik/erişim ayarları |

## Örnek uçtan uca kullanım

1. İş birimi, varlıklarını ve kritik süreçlerini kaydeder; risk değerlendirmesini oluşturur.
2. Kontrol sahibi kontrolü ilgili gereksinimlere bağlar; kanıt yükler veya desteklenen kaynaktan toplama kurar.
3. Denetçi kapsamı ve gereksinimleri belirler; kanıt talebinin sahibini, bağımsız reviewer'ını, kabul ölçütünü ve tarihlerini atar.
4. Sahip belirli kanıt sürümlerini sunar. Reviewer kabul eder veya gerekçeyle geri gönderir. Örneklemli test gerekiyorsa çalışma kâğıdı kullanılır.
5. Tespitler CAPA üzerinden sorumlu ve tarihle izlenir. Denetim kapanışı ayrı bir bağımsız onay paketidir; açık bulgular varsa takip planı görünür kalır.
6. Yönetim raporu, kaydedilmiş veriye ve açık kapsama dayanır. Eksik kaynak okuması veya erişilemeyen veri, sıfır açık iş gibi gösterilmez.

## AI desteğinin kapsamı

Ask Fornost, OpenAI-compatible veya Ollama sağlayıcısıyla kullanılabilir. Yönetici sağlayıcı, güven bölgesi, veri çıkış politikası ve erişimi yapılandırır. Model yalnız sunucunun izin verdiği bağlamı alır; Restricted sınıfındaki veri bağlama alınmaz. Taslaklar ve kararlar ilgili insan onayı akışından geçer.

AI yönetişimi; model envanteri, kullanım senaryosu, risk/olay, değerlendirme, veri ve tedarik zinciri bağlamı, istisna, izleme, release gate ve emeklilik kayıtlarını içerir. Sağlayıcı kurulmadan çalışabilen GRC kayıt işlevleri ile model çağrısı gerektiren AI işlevleri ayrıdır. Harici servis ücretleri veya yerel modelin donanım/işletim maliyeti üründen bağımsızdır. [AI mimarisi](AI-ARCHITECTURE.md) güven sınırlarını açıklar.

## Dağıtım ve erişim

Her müşteri kendi kurulumunu ve verisini yönetir. Yerel Admin/Editor/Viewer rolleri ve sekiz çekirdek sicil için isteğe bağlı modül izinleri bulunur. Modül izni o modülün bütün kayıtlarını kapsar; departman, kayıt, alan veya dış denetçi engagement bazlı izolasyon sağlamaz. Admin olmak, atanmış bağımsız reviewer'ın yerine her kararı verebilmek anlamına gelmez.

Kurumsal kimlik, e-posta ve ticket profilleri kurulumdaki gerçek sistemlerle doğrulanmalıdır. Bir bağlantı profili kaydetmek tam SSO veya uçtan uca senkronizasyonun tamamlandığı anlamına gelmez. Native veri toplayıcılar yalnız [belgelenen datasetleri](integrations/product-connectors.md) okur; katalogdaki **Collector required** kaydı hazır çalışan bir adaptör değildir.

## Bilinmesi gereken sınırlar

- Sistem uygunluk sertifikası veya otomatik denetçi görüşü üretmez; kanıtın kapsam ve içerik yeterliliği insan incelemesidir.
- Çalışma kâğıtları manuel veya CSV evreninden tekrarlanabilir rastgele seçim destekler: en fazla 5000 evren satırından 100 örnek, önizleme, sunucuda doğrulama ve saklanan seçim kaydı. Güven aralığı, istatistiksel örneklem büyüklüğü ve katmanlı örnekleme hesaplanmaz.
- Görev bağlantıları erişim vermez. Süreli dış denetçi daveti ve dönem/sürüm bazlı erişim ayrı bir geliştirmedir.
- Kaydedilmiş denetim paketleri uygulama içinde değişmez ve hash ile doğrulanır; WORM arşivi veya nitelikli elektronik imza değildir. Dosya içerikleri bu paketlere gömülmez.
- E-posta transport kabulü teslim/okunma garantisi değildir; müşteri posta sistemi ve scheduler ayrıca doğrulanmalıdır.
- Okuma, dosya ve paket limitleri vardır. Eksik/kısmi veri uyarıları giderilmeden sonuçlar bütün kurumu kapsıyor sayılmamalıdır.

Detaylı mevcut/gelecek ayrımı [teslim durumu tablosunda](research-delivery-status.md), işletim gereksinimleri [yönetici rehberindedir](ADMIN-GUIDE.md).

Named personal register views let users reuse search, filters and visible columns across seven core register entry points. Views are stored per user/module in the current browser; they are not team-shared or device-synchronized. See [Saved register views](saved-register-views.md).

## Kanıtın ürün içindeki kullanımı

Kanıt Kütüphanesi’ndeki [kullanım ve değişiklik etkisi](evidence-usage.md), kontrol/uyum bağlantılarını, denetim maddelerini, kanıt taleplerini, çalışma kâğıtlarını ve kanonik CAPA referanslarını bir araya getirir. Kayıt bağlantısıyla sabit dosya sürümünü ayırır; eski sürümlü açık işleri incelemeye yönlendirir ve onaylı işlerin geçmişini korur. Yetki ve okuma sınırları görünürdür. Genel kanıt değişikliklerinden otomatik görev üretimi veya tüm modüllerin yeniden değerlendirilmesi bu özelliğin kapsamı dışındadır.

Görev paketlerinde iş günü planlaması, seçili görevlerin eski/yeni tarihlerini birlikte gösterir. Gerekçeli taslak uygulama ve geri alma sonrasında tüm paket tek işlemde kaydedilir; kullanılan takvim ve tarih değişikliği her görevin geçmişinde korunur. Takvim değişirse taslak korunarak yeniden önizlenir. Görev süreleri veya bağımlılık tarihleri kendiliğinden hesaplanmaz. [İş akışı](audit-deadline-planning.md#task-pack-dates).
