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

## Fonksiyonel regresyon matrisi

Her modülde listeleme, arama, oluşturma, düzenleme, silme, zorunlu alanlar, sınır değerleri, boş durum, TR/EN ve responsive davranış kontrol edilir. Denetim modülünde ana denetim kartı → çalışma alanı → madde → ilerleme → import/export akışı ayrıca test edilir.

## RBAC

| İşlem | Admin | Editor | Viewer |
| --- | ---: | ---: | ---: |
| Görüntüleme | Evet | Evet | Evet |
| Kayıt oluşturma/düzenleme | Evet | Evet | Hayır |
| Kayıt silme | Evet | Hayır | Hayır |
| Kullanıcı/rol yönetimi | Evet | Hayır | Hayır |

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
- SSRF: kullanıcı kontrollü sunucu-side URL fetch yüzeyi bulunmaz

## Harici test

Canlı ortamda authenticated OWASP ZAP/Nessus WAS taraması, oran sınırlı ve veri bozucu olmayan politika ile ayrıca çalıştırılmalıdır. DAST sonucu, uygulama içi unit/integration testlerinin yerine geçmez.
