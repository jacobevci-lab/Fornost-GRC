# Production Readiness

## Teknik kapı

- [x] Lint ve production build başarılı
- [x] Bağımsız TypeScript doğrulaması başarılı
- [x] Otomatik güvenlik/validasyon testleri başarılı
- [x] 2026-10-06 bağımlılık taraması: `npm audit --omit=dev --json` production bağımlılıklarında 0 bulgu. Her sürümde yeniden taranmalı; bu sonuç kaynak kodu veya canlı ortam için zafiyetsizlik garantisi değildir.
- [x] D1/R2 artifact ve binding doğrulaması başarılı
- [x] RBAC, same-origin, payload ve dosya kontrolleri mevcut
- [x] Güvenlik başlıkları mevcut
- [x] Eski/deneysel API'ler 410 ile kapalı

## Canlıya geçiş önkoşulları

- [ ] Entra/Okta/OIDC/SAML profili gerçek tenant ile doğrulanmalı ve grup→rol eşlemesi IAM bridge/gateway üzerinde tamamlanmalı
- [ ] SMTP bridge veya Graph Mail ile “Test E-postası Gönder” gerçek servis hesabıyla doğrulanmalı; 15 günlük hatırlatma job'ı zamanlayıcıya bağlanmalı
- [ ] Jira/ServiceNow/Azure DevOps/GitHub ticket profili gerçek proje ve en az ayrıcalıklı servis hesabıyla test edilmeli
- [ ] D1 backup/restore prosedürü uygulanarak geri dönüş testi yapılmalı
- [ ] Hosting logları SIEM'e bağlanmalı; alarm ve saklama süreleri tanımlanmalı
- [ ] Rate limiting/WAF kuralı canlı alan adında doğrulanmalı
- [ ] Authenticated DAST (OWASP ZAP veya Nessus WAS) temizlenmeli
- [ ] UAT, veri sahibi ve Bilgi Güvenliği onayı alınmalı
- [ ] KVKK/GDPR saklama, silme ve erişim talepleri için kurum politikası tanımlanmalı

## Karar kuralı

Teknik kapının geçmesi uygulamayı kontrollü pilot için uygun hale getirir. Yukarıdaki canlıya geçiş önkoşulları kanıtlanmadan uygulama kurumsal production için **PROD READY** olarak işaretlenmez.

## Rollback

1. Son sağlıklı immutable Site sürümüne geri dön.
2. D1 değişikliği varsa onaylı backup'tan restore et.
3. R2 kanıt deposunu silme; yalnız uygulama sürümünü geri al.
4. Olay kaydı aç, etkilenen işlemleri ve zaman aralığını belirle.
5. Düzeltme sonrası smoke, RBAC ve veri bütünlüğü testlerini yeniden çalıştır.

## Geliştirme bağımlılıklarında açık takip

2026-10-06 tarihli tam `npm audit --json` taramasında `braces <=3.0.3` kaynaklı GHSA-vfj7-8cjw-p6xm, geliştirme araçları üzerinden 8 yüksek seviyeli bağımlılık bulgusu üretmektedir. Production-only taramada yer almaz; build/lint ortamı için açık takip maddesidir. Resmi advisory henüz yamalı sürüm belirtmiyor. Framework/lint araçlarını eski majör sürümlere düşüren `npm audit fix --force` uygulanmamalı. Bu kayıt kapatılmadan tam bağımlılık taraması temiz kabul edilmez.

## Belge dönüştürme bağımlılığı

Mammoth 1.12.3 için kapsamlı `argparse: 2.0.1` override uygulanır. Bu sürüm eski CLI API uyumluluğunu korurken `sprintf-js` bağımlılığını kaldırır (GHSA-hp3w-g68c-fv3c). Argparse 3 eski API uyumluluğunu kaldırdığı için kullanılmaz. `tests/mammoth-security.test.mjs` DOCX metin/HTML dönüşümünü, stil haritasını, çıktı dosyası/dizinini ve geçersiz argüman reddini doğrular. Mammoth yükseltilirken override ihtiyacı tekrar değerlendirilmeli.
