# Fornost GRC Architecture

[Dokümantasyon dizini](README.md) · [Yönetici rehberi](ADMIN-GUIDE.md)

Kodla karşılaştırma tarihi: 19 Ekim 2026. Ürün müşteri başına ayrı kurulum modelindedir; bu mimari paylaşımlı SaaS tenant izolasyonu tanımlamaz.

## Bileşenler ve dağıtım

Next.js/React arayüzü ve route handler API'leri, Vinext/Vite ile Worker uyumlu çıktı üretir. İlişkisel kayıtlar `DB` D1 binding'i, kanıt nesneleri `BUCKET` R2 binding'i üzerinden erişilir.

| Ortam | Çalışma zamanı | Kalıcılık ve işletim |
| --- | --- | --- |
| Hosted | Cloudflare Worker; `worker/index.ts` fetch ve scheduled girişleri | Dağıtımın D1/R2 kaynakları, platform secrets ve cron yapılandırması |
| On-prem | TLS Nginx proxy + Node.js 22 distroless uygulama container'ı; `scripts/linux/container-runtime.mjs` | Yerel D1/R2 durumu kalıcı container volume'ünde; host tarafında kurulum ve yedekleme araçları |

Standart on-prem image amd64 ve `/fornost-grc` için derlenir. Host üzerinde uygulama build'i yapılmaz; installer commit'e sabitlenmiş paketi yükler. Proxy yalnız HTTPS portunu yayınlar; uygulama özel container ağındadır. Şifreleme/mühürleme anahtarları ve state kalıcılığı [kurulum](LINUX-INSTALLATION.md) ve [yedekleme](onprem/backup-recovery.md) belgelerinde açıklanır.

## Uygulama katmanları

| Kaynak | Sorumluluk |
| --- | --- |
| `app/page.tsx`, modül panelleri | Navigasyon, siciller, formlar, dashboard, raporlar ve denetim çalışma alanları |
| `app/api/auth`, `app/api/users` | Yerel hesap, oturum, kullanıcı politikası, kilit ve oturum sonlandırma |
| `app/module-access.ts` | Rol tavanı, çekirdek modül izinleri ve sınıflandırılmış API erişimi |
| `app/api/grc`, `app/api/search`, `app/api/record-links` | Doğrulanmış kayıt işlemleri, yetkili arama ve tam hedef çözümleme |
| `app/api/evidence`, kanıt geçmişi | Doğrulanmış dosya yükleme, yetkili indirme ve sürüm ilişkileri |
| Denetim/CAPA/kurumsal store ve API'leri | Beklenen sürüm, atama, bağımsız review, transaction, kaynak kilitleri ve snapshot |
| `app/api/integrations`, connector katmanı | Ticket, e-posta, kimlik profilleri; sağlayıcıya özgü veri okuma ve şifreli sırlar |
| AI API/politika katmanı | Yetkili ve sınıflandırılmış model bağlamı, sağlayıcı çağrısı ve insan onaylı işler |
| `db/`, `drizzle/` | Canonical şema, sürümlü SQL migration ve ilgili idempotent başlatma yolları |

## Güven sınırları

1. Rol ve izinler sunucuda çözülür; tarayıcı beyanı yetki vermez. Trusted upstream kimlik yalnız açıkça yapılandırılmış sınır içinde kabul edilir; on-prem proxy ilgili kimlik başlıklarını temizler.
2. Yazma işlemleri kimlik, rol/modül, same-origin, payload ve alan kontrollerinden geçer. Yaşam döngüleri ek atama/bağımsızlık ve güncel sürüm kontrolleri uygular.
3. Modül izni bütün modül kayıtlarını kapsar; satır/departman/alan bazlı yetkilendirme değildir. Paylaşılan kurumsal veri kümeleri kısıtlı hesaplara açık sayılmaz.
4. Kanıt dosyaları yetkili endpoint üzerinden okunur; kullanıcı URL'si kanıt yetkisini aşmaz. İncelemeye sunulan sürüm kimliği sonraki upload ile değiştirilmez.
5. Entegrasyon sırları AES-GCM ile saklanır. Model veritabanına doğrudan bağlanmaz; sunucu izinli bağlamı ve veri çıkış politikasını uygular.
6. Connector uçları sunucu tarafında HTTP istekleri oluşturur; public/private adres politikası, redirect yasağı ve süre/boyut sınırları kullanılır. Bu kontroller her olası ağ saldırısının veya DNS rebinding'in engellendiği iddiası değildir.

## Durum ve veri yaşam döngüsü

- Yeni çekirdek kayıtların iç kimliği modül öneki + UUID'dir; kullanıcıya gösterilen kayıt kodu ayrı yönetilir. Eski/örnek kimlikler korunabilir.
- Liste/arama ve iş kuyruğu sınırları endpoint'e özgüdür. Arama 25 sonuçluk cursor sayfaları kullanır; eksik kaynak okumaları tam kapsam olarak sunulmaz. [Arama sözleşmesi](record-search.md).
- Yerel oturum belirteci SHA-256 özetiyle saklanır. Mutlak süre varsayılan 30 dakika, yönetilebilir aralık 5–720 dakikadır; aktif kullanım süreyi uzatmaz. [Oturum politikası](onprem/session-policy.md).
- Kanıt kabulü, global kanıt incelemesi, kontrol etkinliği, talep iş planı kapanışı ve bütün-denetim kapanışı ayrı durumlardır.
- Denetim durum raporu/kapanış snapshot'ları kaynak revizyonuna bağlanır; indirmede hash yeniden doğrulanır. Kapanış kilitleri ilgili denetim kaynaklarında SQL seviyesinde uygulanır. Hash/WORM/elektronik imza ayrımı [kapanış belgesinde](audit-closure.md) tanımlıdır.
- Paylaşılan bağlantı fragment'ı yalnız hedef kimliklerini taşır; giriş sonrası sunucu erişim kontrolüyle çözülür. Bir yetki veya dış denetçi daveti değildir.

## Zamanlanmış işler

Hosted Worker scheduled handler, güvence operasyonlarını çalıştırır. On-prem `container-runtime.mjs` geçerli scheduler token ile yerel endpoint'e süreli istekler yapar; varsayılan aralık 300 saniyedir. Eski host geliştirme `serve.sh` yolu shell tabanlı companion scheduler kullanır; standart distroless image bu shell'e dayanmaz.

Denetim talepleri mevcut notification outbox/dispatcher'ı kullanır. Gönderimde canlı görev, revizyon, alıcı ve izinler yeniden kontrol edilir. Zamanlayıcı çalışması, sağlayıcı kabulü ve mesajın okunması ayrı durumlardır. [Hatırlatmalar](audit-reminder-profiles.md).

## Build, şema ve doğrulama

Build `dist/server/index.js` ve hosting manifestini üretir. Sürüm; CI kalite/güvenlik kontrolleri, Docker/Podman testleri ve değişiklik kapsamına göre browser QA ile doğrulanır. Main dağıtımlarında canlı revision kontrolü yapılır. Şema değişiklikleri [şema başlatma sözleşmesine](onprem/schema-initialization.md) uymalıdır.

[TEST-STRATEGY.md](TEST-STRATEGY.md) test kapsamını, [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) kurulum özelinde kabul koşullarını tanımlar.
