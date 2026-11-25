# Test Strategy

## Otomatik kapılar

| Alan | Kontrol |
| --- | --- |
| Statik kalite | ESLint ve TypeScript/build |
| Unit | Parola politikası, sabit süreli karşılaştırma, tarih/modül/veri validasyonu |
| Render | Worker üzerinden ana HTML yanıtı ve preview metadata |
| Paket | Production dependency audit |
| Artifact | Worker `default.fetch`, hosting manifesti ve build çıktısı |
| Repository | `git diff --check`, gizli bilgi ve istenmeyen dosya kontrolü |

## Pull request incelemesinde erişilebilirlik ve bağımlılıklar

Workspace Layout QA, geçici yerel hesabı açtıktan sonra tedarikçi kartları ve envanter durum etiketlerinin kontrastını axe ile denetler. Gerçek arayüz sentetik tedarikçi yanıtlarıyla çalışır. Kayıt arama penceresi de Türkçe ve İngilizce, açık ve koyu temada kontrol edilir. QA bağımlılıkları `scripts/package-lock.json` dosyasında sabitlenir. `npm ci --prefix scripts` ve `scripts/node_modules/.bin/playwright install chromium` ile kurulumdan sonra `npm run test:axe-scanner` ana sayfa ve sandbox içindeki adsız düğmelerin gerçekten bulunduğunu ve tamamlanamayan taramanın hata verdiğini kontrol eder. Bu sentetik test, gerçek arama penceresindeki ciddi ve kritik ihlalleri denetleyen ürün testini tamamlar.

CI, her PR'da ve ana dala gönderimde Trivy 0.76.2 ile bağımlılıkları (geliştirme bağımlılıkları dahil) ve yapılandırmaları tarar. `trivy-repository` artefaktı tüm önem düzeylerindeki sonuçları içerir. Tarama hatası, uygulama veya QA kilit dosyasında ya da Dockerfile'da eksik kapsam ve her HIGH/CRITICAL bulgu işi başarısız kılar. Yerelde aynı kontrolü temiz bir checkout üzerinde `bash scripts/check-repository-security.sh /tmp/trivy-repository.json` ile çalıştırabilirsiniz. Trivy ve jq gereklidir. Çıkış kodu 2, HIGH veya CRITICAL bir bulgu olduğunu gösterir. İş özetinde bulgu sayıları, günlüklerde ve JSON raporunda etkilenen paket ve yapılandırmalar listelenir.

## Fonksiyonel regresyon matrisi

Modülün desteklediği işlemlere göre listeleme, arama, oluşturma, düzenleme, silme/iptal, zorunlu alanlar, sınır değerleri, boş durum, TR/EN ve responsive davranış kontrol edilir. Denetim modülünde ana denetim kartı → çalışma alanı → madde → ilerleme → import/export akışı ayrıca test edilir.

## RBAC

| İşlem | Admin | Editor | Viewer |
| --- | ---: | ---: | ---: |
| Görüntüleme | Evet | Evet | Evet |
| Kayıt oluşturma/düzenleme | Evet | Evet | Hayır |
| Kayıt silme | Evet | Hayır | Hayır |
| Kullanıcı/rol yönetimi | Evet | Hayır | Hayır |

Bu tablo çekirdek kayıt rol tavanını gösterir. Modül grant'leri, tam çalışma alanı gerektiren kurumsal datasetler, atanmış sahip/reviewer koşulları ve bağımsızlık denetimleri ayrıca test edilir. Admin her incelemede atanmış reviewer yerine geçemez.

Negatif senaryolar: 401, 403, cross-origin, olmayan kayıt için 404, son Admin'i kapatma için 409, bozuk JSON, büyük payload, hatalı tarih/skor/e-posta ve geçersiz modül.

## OWASP Top 10 kapsamı

- Broken Access Control: RBAC, retired API, IDOR ve doğrudan API çağrıları
- Cryptographic Failures: PBKDF2, rastgele salt/token, güvenli cookie ve TLS/HSTS
- Injection: parametreli D1 sorguları, modül allowlist'i ve veri sınırları
- Insecure Design: son Admin koruması, import/dosya limitleri, güvenli varsayılanlar
- Security Misconfiguration: CSP, anti-clickjacking, permissions/referrer policy
- Vulnerable Components: production `npm audit`
- Authentication Failures: güçlü parola, lockout, genel hata, session expiry/logout
- Integrity Failures: lockfile ve build artifact doğrulaması
- Logging/Monitoring: hosting logları; kurumsal SIEM aktarımı production önkoşuludur
- SSRF: connector/entegrasyon URL yüzeylerinde protokol/adres politikası, private erişim ayarı, redirect reddi ve süre/boyut limitleri; ayrıntılı sınırlar connector belgelerinde tanımlıdır.

## Harici test

Canlı ortamda authenticated OWASP ZAP/Nessus WAS taraması, oran sınırlı ve veri bozucu olmayan politika ile ayrıca çalıştırılmalıdır. DAST sonucu, uygulama içi unit/integration testlerinin yerine geçmez.

## Güncel yaşam döngüsü ve gezinme kapsamı

- Kayıt arama/link: sekiz çekirdek sicil, tam hedef, yerel giriş sürekliliği, erişim reddi, kayıp hedef, retry ve filtre bağlamı.
- Denetim talepleri: taslak/başlatma/ekleme, sürüme sabit kanıt, bağımsız review, takvim/eskalasyon ve talep planı kapanışı.
- Çalışma kâğıdı: manuel örneklem, revision, sahip/reviewer ayrımı, My Work ve kapalı denetim kilidi.
- Bütün-denetim kapanışı: kaynak revizyonu, bağımsız onay, transaction rollback, yazma kilitleri, paket bütünlüğü ve gerekçeli yeniden açma.
- On-prem: Docker/Podman, kurulum kalıcılığı, yedek checksum ve ayrı volume üzerinde uygulamayla geri dönüş.

İlgili scriptler `.github/workflows/workspace-layout-qa.yml`, CI ve yayın workflow'larında tanımlıdır. Layout workflow'u uygulama, QA veya npm bağımlılık dosyalarının değişikliklerinde çalışır; yalnız dokümantasyon değişikliği yeni 324 görünüm taraması anlamına gelmez. Son tarihli sürüm kanıtı ve müşteri UAT ayrımı için [Production Readiness](PRODUCTION-READINESS.md) okunmalıdır.
