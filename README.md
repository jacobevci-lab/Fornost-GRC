# Fornost GRC

**Govern Risk. Prove Compliance. Control AI.**

Fornost GRC, kurumların risklerini, kontrollerini, kanıtlarını, denetimlerini ve iyileştirme çalışmalarını aynı çalışma alanında yönetmesini sağlayan ticari bir **GRC ve AI yönetişimi platformudur**. Amaç, ayrı dosyalarda tutulan kayıtları sorumlu, tarih, kanıt ve bağımsız inceleme kararlarıyla birbirine bağlamaktır.

Ürün müşterinin kendi ortamına kurulur. Çekirdek GRC kullanımı için harici AI hizmeti gerekmez; veri toplayıcılar, kurumsal kimlik, e-posta, ticket ve AI sağlayıcıları ihtiyaca göre yapılandırılır. Paylaşımlı çok müşterili SaaS, bu ürünün dağıtım modeli değildir.

## Ürün ne işe yarar?

| İhtiyaç | Fornost ile yapılan iş |
| --- | --- |
| Riskleri görünür kılmak | Varlık ve BIA bağlamıyla risk değerlendirmesi; risk iştahı, KRI ve aksiyon takibi |
| Uyum çalışmalarını düzenlemek | Gereksinim, kontrol, politika ve kanıt ilişkileri; eksik veya güncel olmayan güvenceyi izleme |
| Denetimi yürütmek | Kapsam ve plan, gereksinimler, sahip/reviewer atamalı kanıt talepleri, çalışma kâğıtları, durum raporları ve bağımsız kapanış |
| Bulguları sonuçlandırmak | Kaynağa bağlı CAPA, kök neden, sorumlu, son tarih, kanıt ve bağımsız kapanış doğrulaması |
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
- **Uyum ve denetim:** Gereksinim katalogları, kapsam planı, sürüme sabitlenmiş kanıt talepleri, bağımsız inceleme, manuel örneklemli çalışma kâğıtları, kaydedilmiş durum raporları ve bütün denetim için kapanış/onay.
- **Sürekli kontrol:** Desteklenen veri kaynaklarından toplama, zamanlanmış testler, kanıt tazeliği, başarısızlıkların izlenmesi ve CAPA bağlantısı. [Native kaynakların kapsamı](docs/integrations/product-connectors.md) ve [hazır testler](docs/integrations/ready-control-tests.md) ayrı tanımlıdır.
- **Kurumsal yaşam döngüleri:** Politika sürümü/yayın/attestation, regülasyon değişikliği ve etkileri, tedarikçi inceleme/offboarding, güvenlik olayı ve süreklilik tatbikatları.
- **AI yönetişimi:** Sağlayıcı politikaları, model envanteri, değerlendirmeler, olaylar, istisnalar, release gate ve emeklilik. Ask Fornost, yetkili bağlam üzerinden kaynaklı analiz ve insan onaylı taslaklar sunar; doğrudan veritabanına bağlanmaz.
- **Günlük çalışma:** TR/EN arayüz, Benim İşlerim, sekiz çekirdek sicilde kayıt araması, filtre bağlamına dönüş ve yetki kontrolüyle açılan paylaşılabilir kayıt/görev bağlantıları.

## Son tamamlanan geliştirmeler

19 Ekim 2026 itibarıyla, uygulama sürümü `c87540a75e36` / [PR #320](https://github.com/jacobevci-lab/Fornost-GRC/pull/320) temel alınmıştır:

- Denetim talepleri için iş günü/tatil takvimi, ayarlanabilir hatırlatma eşikleri ve tek alıcıya eskalasyon.
- Bağımsız bütün-denetim kapanışı, değişiklik kilitleri, gerekçeli yeniden açma ve doğrulanabilir karar paketi.
- Kanıt sürümüne bağlı çalışma kâğıtları ve manuel örnekleme; sahip/reviewer işlerinin Benim İşlerim'e taşınması.
- Sekiz çekirdek sicil, denetim talebi ve çalışma kâğıdı için kayıt bağlantıları; yapılandırılmış uygulama adresi üzerinden e-posta görev bağlantıları.
- E-posta ekranında bağlantı ve bildirim ayarlarına odaklanan sade kullanım.

Teslim edilenlerle planlananları ayıran güncel kapsam: [Araştırma ve Teslim Durumu](docs/research-delivery-status.md). Yıllık risk bazlı planlama, istatistiksel örnekleme ve süreli dış denetçi yetkileri mevcut özellik olarak sunulmaz.

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
