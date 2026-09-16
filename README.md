# Fornost GRC

Fornost GRC; kurumsal risk, varlık, iş sürekliliği, uyum, denetim, kanıt, üçüncü taraf ve AI yönetişimini tek güvenli çalışma alanında birleştiren cloud/on-premises bir GRC ve AI assurance platformudur.

**Govern Risk. Prove Compliance. Control AI.**

Fornost, klasik kayıt ve raporlama işlevlerinin yanında AI sistemlerinin envanterden üretime, sürekli izlemeden emekliliğe kadar güvenli yaşam döngüsünü yönetir. Model hiçbir zaman doğrudan veritabanına bağlanmaz; okuma bağlamı sunucu tarafında sınırlandırılır, hassas veri politikası uygulanır ve canlı değişiklikler insan onayı olmadan gerçekleşmez.

## Modüller

- Dashboard ve risk matrisi
- Risk Assessment
- Business Impact Analysis (BIA)
- Varlık Envanteri
- Uyum ve Kontrol Kütüphanesi
- Kanıt Yönetimi ve güvenli dosya yükleme
- Sürekli Kontrol İzleme 2.0: vendor-neutral API collector, zamanlanmış kontrol testleri, kanıt tazeliği, ardışık hata eşiği, otomatik risk/bulgu ve maker-checker CAPA kapanışı
- Regülasyon Merkezi: kaynak gözetimi, değişiklik triajı, GRC kayıtlarına etki analizi, sorumlu aksiyonlar, SHA-256 kanıt bütünlüğü ve bağımsız maker-checker kapanışı
- Third-Party Risk Management 2.0: onboarding, 12 alanlı due diligence, doğal/kalıntı risk, sözleşme ve veri yaşam döngüsü, bulgu/CAPA, maker-checker karar, periyodik yeniden değerlendirme ve kanıtlı offboarding
- Denetim Yönetimi: ISO 27001, SOC 1/2 Type I/II çalışma alanları
- Entegrasyon Merkezi: Jira, ServiceNow, Azure DevOps, GitHub Issues ve webhook ticket akışları
- E-posta bağlantı testi: SMTP bridge, Microsoft Graph Mail veya HTTP email API
- IAM bağlantı profilleri: Entra ID, Okta, OIDC, SAML ve on-prem LDAP/LDAPS bridge
- Admin / Editor / Viewer rol yönetimi
- Excel içe aktarma ve CSV/Excel dışa aktarma
- TR/EN arayüz

## Fornost AI Assurance

- Provider-bağımsız Ask Fornost Copilot: OpenAI-compatible ve Ollama
- Şifreli birincil/yedek provider, trust-zone ve veri-egress politikaları
- Restricted veriyi model bağlamından tamamen çıkaran merkezi güvenlik katmanı
- Kaynak gösterimli, sürümlü ve onaylı PDF/DOCX bilgi tabanı
- İnsan onaylı risk, denetim ve remediation taslakları
- Risk, Audit, Compliance ve Evidence güvence agentları
- AI model envanteri, kullanım senaryosu ve değişiklik yaşam döngüsü
- ISO/IEC 42001, NIST AI RMF ve EU AI Act kontrol değerlendirmeleri
- EU AI Act, ISO/IEC 42001, NIST AI RMF, KVKK/GDPR ve kurum politikaları için sahip, doğrulayıcı, 30/15/7 günlük uyarı kuyruğu, gecikme eskalasyonu, periyodik yenileme, kanıt bütünlüğü ve maker-checker kapanışlı operasyonel regülasyon yükümlülük takibi
- AI riskleri, olay yönetimi, DPIA/FRIA, tedarikçi ve erişim yönetişimi
- Süreli politika/kontrol/risk/release istisnaları, telafi edici kontroller ve maker-checker kararları
- Trafik, erişim, veri, model artifact ve bağımlılık kapanışını kanıtlayan kontrollü AI emeklilik süreci
- Kaynak bağlantılı AI bulguları, kök neden, CAPA, SLA ve bağımsız kanıt doğrulaması
- Veri seti lineage/kalite/privacy ve model supply-chain güvencesi
- Red-team kampanyaları ve OWASP LLM tehdit kapsamı
- AI sistem kartları, açıklanabilirlik, itiraz kanalı ve insan override kayıtları
- Model bazlı SLO/KRI baseline’ları ve sürekli güvence ölçümleri
- Doğruluk, hata, drift, bias, gecikme ve ölçüm tazeliği için tekilleştirilmiş güvence alarmları; sahiplik, çözüm, CAPA ve release-gate bağlantısı
- Bütçe, token, provider health, kalite trendi ve regresyon takibi
- 18 bağımsız kontrol alanını değerlendiren üretim release gate
- Açık yüksek/kritik veya gecikmiş regülasyon yükümlülüklerini üretim release gate üzerinde bloke eden fail-closed kontrol
- Model bazlı yönetim özeti ve öncelikli aksiyon kuyruğu
- Model bazlı, değişmez kaydedilen ve sonradan doğrulanabilen HMAC-SHA-256 sunucu mührü taşıyan JSON denetim paketi; güvenli kanıt manifesti, release kararı ve kontrol CSV'si
- Ham prompt/model cevabı saklamayan, hash ve kaynak referanslı audit izi

Detaylı güven sınırları ve veri akışı için [Fornost AI Architecture](docs/AI-ARCHITECTURE.md) belgesine bakın.

## Teknoloji

- Next.js 16, React 19, TypeScript
- Vinext/Vite üzerinde Cloudflare Worker uyumlu çalışma zamanı
- Cloudflare D1 (ilişkisel kayıtlar)
- Cloudflare R2 (kanıt dosyaları)
- Drizzle ORM ve sürümlenmiş SQL migration dosyaları

## Yerel geliştirme

Gereksinimler: Node.js `>=22.13.0`, npm ve Linux üzerinde GNU `timeout`.

```bash
npm ci
npm run dev
```

## Linux sunucu kurulumu

Önerilen platformlar: Red Hat Enterprise Linux 8/9, Rocky Linux 8/9, AlmaLinux 8/9 ve CentOS Stream 9/10. Podman önerilir; Docker Engine de kullanılabilir. Sunucuda Node.js/npm kurulmaz ve kaynak kod build edilmez. Installer, klonlanan Git commit'i için GitHub Actions tarafından hazırlanıp uçtan uca test edilmiş image paketini indirir, SHA-256 bütünlüğünü doğrular ve container runtime'a yükler.

RHEL tabanlı temiz sunucuda en kolay kurulum tek komuttur:

```bash
curl -fsSL https://raw.githubusercontent.com/jacobevci-lab/Fornost-GRC/main/scripts/linux/quick-install.sh | sudo bash
```

Script Git'i ve gerekli Podman paketlerini kurar, kaynakları `/opt/fornost-grc` altına indirir, başlamadan önce en az 8 GiB boş alanı doğrular ve yalnız CI'da test edilmiş container paketini yükler. Aynı komut daha sonra güvenli fast-forward güncellemesi yapar. Kaynağı önce incelemek isteyenler için eşdeğer manuel kurulum:

```bash
sudo dnf install -y git
git clone https://github.com/jacobevci-lab/Fornost-GRC.git
cd Fornost-GRC
sudo bash scripts/linux/bootstrap.sh
```

Varsayılan ilk kurulum adresi:

```text
https://SUNUCU_IP:8443/fornost-grc/
```

İlk ziyarette Fornost GRC, ilk yerel yönetici hesabını oluşturma ekranını açar. Bootstrap gerekli RHEL paketlerini ve firewall kuralını kurar; installer ilk kurulum için kalıcı sistem dizininde kendinden imzalı bir TLS sertifikası üretir. Tarayıcı uyarısını kaldırmak için `.env.onprem` üzerinden kurum sertifikası ve anahtarı tanımlanabilir. Uygulama kayıtları ve yüklenen kanıtlar `fornost-grc-data` adlı kalıcı container volume alanında tutulur; repo veya container yenilense de silinmez. İndirilen image paketinin checksum'u uyuşmazsa hiçbir container başlatılmaz. Herhangi bir faz başarısız olursa installer ilgili fazı, container durumunu ve logları otomatik gösterir; tüm kontroller geçmeden başarı mesajı vermez.

Adres yolu, HTTPS portu ve TLS sertifikası `.env.onprem` dosyasından değiştirilebilir. Rootless kurulum, Docker alternatifi, güncelleme, yedekleme, kaldırma, SELinux ve güvenlik duvarı adımları için [Linux On-Prem Kurulum Rehberi](docs/LINUX-INSTALLATION.md) belgesine bakın.

Kalite kapıları:

```bash
npm run lint
npm test
npm audit --omit=dev
npm run validate:artifact
```

## Yapılandırma ve veri

Hosting kimliği ve D1/R2 binding adları `.openai/hosting.json` içinde tutulur. Gizli değerler repoya yazılmaz. Canlı ortam değerleri hosting platformunun environment-variable yönetiminden verilmelidir. Entegrasyon token'ları D1 içinde AES-GCM ile şifrelenir; anahtar canlı ortam değişkenlerinden veya on-prem kalıcı state dizininden sağlanır. LDAP/LDAPS ham TCP bağlantısı hosted ortamdan açılmaz, şirket içi HTTPS IAM bridge üzerinden çalışır.

Kanıt dosyaları yalnız PDF, JPEG, PNG veya WebP olabilir; MIME türü ve dosya imzası birlikte doğrulanır. Üst sınır 10 MB'dır. Excel import yalnız `.xlsx`, 5 MB ve 1.000 satırla sınırlıdır.

Sürekli kontrol motoru; public API uçlarını varsayılan kabul eder, private/on-prem connector adreslerini ancak açık yönetici politikasıyla etkinleştirir. Redirect kapalıdır, istek ve yanıt boyutları sınırlıdır, token/API anahtarları AES-GCM ile şifrelenir. Her çalışma yanıt hash'i, tetikleyici türü, süre ve hata koduyla değişmez geçmişe yazılır. Ayrıntılı işleyiş için [Continuous Control Monitoring](docs/CONTINUOUS-CONTROL-MONITORING.md) belgesine bakın.

Regülasyon Merkezi, yetkili kaynak sicili ve periyodik horizon-review takvimi üzerinden değişiklikleri izler. Değişiklikler kontrol, politika, risk, varlık, tedarikçi, süreç, denetim ve kanıt kayıtlarına bağlanabilir; kapanış tüm etkiler kanıtla tamamlanıp atanmış bağımsız doğrulayıcı tarafından onaylanana kadar engellenir. Ayrıntılar için [Regulatory Change Intelligence](docs/REGULATORY-CHANGE-INTELLIGENCE.md) belgesine bakın.

TPRM 2.0, mevcut tedarikçi kayıtlarını kontrollü biçimde kapsama alır ve yeni üçüncü tarafları ilk risk değerlendirmesiyle birlikte oluşturur. On iki due-diligence alanı; kritiklik, veri sınıfı, doğal/kalıntı risk, sözleşme bitişi, kritik kontrol boşlukları ve CAPA durumuyla birlikte yönetilir. Tam onay açık yüksek/kritik bulgu veya kritik kontrol boşluğu varken engellenir; karar, bulgu kapanışı ve offboarding bağımsız reviewer ve SHA-256 kanıtı gerektirir. Ayrıntılar için [Third-Party Risk Management 2.0](docs/THIRD-PARTY-RISK-MANAGEMENT.md) belgesine bakın.

Enterprise Policy Lifecycle Management; benzersiz politika sicili, SHA-256 özetli kontrollü sürümler, kontrol/regülasyon/risk eşlemeleri, maker-checker inceleme ve kanıtlı yayın akışını tek merkezde birleştirir. Yayımdaki sürümlere çalışan attestation kampanyaları ve en fazla 180 günlük bağımsız onaylı istisnalar bağlanabilir. Açık kampanya veya aktif istisna, kontrollü yürürlükten kaldırmayı engeller; Viewer yalnız kendi attestation satırını görebilir. Ayrıntılar için [Policy Lifecycle Management](docs/POLICY-LIFECYCLE-MANAGEMENT.md) belgesine bakın.

## Production readiness

Teknik kalite kapısı, güvenlik kontrolleri ve operasyonel önkoşullar [Production Readiness](docs/PRODUCTION-READINESS.md) belgesinde yer alır. Mimari için [Architecture](docs/ARCHITECTURE.md), güvenlik modeli için [Security](SECURITY.md), test kapsamı için [Test Strategy](docs/TEST-STRATEGY.md) okunmalıdır.

## Lisans ve gizlilik

Bu depo kuruma özel/proprietary kaynak kod içerir. Yetkisiz kopyalama, dağıtma veya üçüncü taraf ortamlarında çalıştırma izni verilmez.
