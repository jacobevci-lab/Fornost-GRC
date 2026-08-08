# Güvenlik

## Threat boundaries

Tarayıcı, API, worker, PostgreSQL, object storage ve dış collector'lar ayrı güven sınırlarıdır. Ağ konumu güven sinyali değildir; her sınır kimlik, yetki, şema, boyut ve tenant kapsamı doğrular.

## Authentication ve authorization

Foundation bir OIDC sağlayıcısı bağlamaz. Production yaklaşımı kısa ömürlü token doğrulaması, tenant üyeliğinin doğrulanmış claim/server-side lookup ile kurulması ve deny-by-default permission guard'dır. `x-tenant-id` yalnızca yerel demo kolaylığıdır.

## Tenant isolation

Her tenant kaydı `tenantId` taşır; servis ve repository çağrıları bu context'i zorunlu alır. Bileşik indeksler kapsamlı sorguları destekler. Sonraki faz PostgreSQL RLS, transaction-local tenant context ve çapraz tenant negatif entegrasyon testlerini ekler.

## Secrets ve loglama

Secret'lar environment/secret manager üzerinden sağlanır; `.env` commit edilmez. Log allowlist yaklaşımı kullanır; token, cookie, authorization header, dosya içeriği, kişisel veri ve connection string redacted edilir.

## Audit logging

Kimlik, tenant, eylem, kaynak, zaman, correlation ID ve güvenli değişiklik özeti append-only kaydedilir. Audit log update/delete uygulama rolüne kapatılacak, ayrı retention ve bütünlük kontrolü uygulanacaktır.

## Dosya güvenliği

İzin verilen MIME ve boyut sunucuda doğrulanır. Storage key sunucu üretir. Production akışı quarantine bucket, malware tarama, content sniffing, checksum, presigned kısa ömürlü erişim ve immutable retention içerecektir.

## Secure SDLC

Branch koruması, zorunlu review, lint/typecheck/test/build, dependency/secret/code scanning ve migration review gerekir. Kritik authorization ve tenant değişiklikleri abuse-case testleri ister.

## Vulnerability reporting

Güvenlik açığını public issue olarak paylaşmayın. Depo yöneticileri private vulnerability reporting'i etkinleştirmeli ve yayınlanacak güvenlik iletişim kanalını tanımlamalıdır. Bu kanal tanımlanana kadar gerçek hassas ayrıntı repo içine yazılmamalıdır.

## PostgreSQL tenant izolasyonu

- Her identity lookup ve GRC repository işlemi transaction-local `app.current_tenant_id` değeri kurulmadan çalıştırılmaz.
- Versioned migration tenant kapsamlı tabloların tamamında forced RLS ve yazma kontrolü uygular.
- `UserIdentity` ve `UserRole` politikaları bağlı kullanıcı/rol tenant üyeliğini alt sorguyla doğrular.
- Production runtime rolü tablo sahibi, superuser veya `BYPASSRLS` yetkili olamaz.
- Uygulama katmanındaki `tenantId` filtreleri kaldırılmaz; RLS ikinci, bağımsız güvenlik sınırıdır.
