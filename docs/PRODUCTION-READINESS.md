# Production Readiness

## Teknik kapı

- [x] Lint ve production build başarılı
- [x] Bağımsız TypeScript doğrulaması başarılı
- [x] Otomatik güvenlik/validasyon testleri başarılı
- [x] Production bağımlılıklarında bilinen açık yok
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
