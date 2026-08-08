# Proje Durumu

Son güncelleme: 2026-08-08

## Tamamlananlar

- pnpm monorepo, Next.js web, NestJS API, worker ve Prisma foundation.
- Tenant-aware fiziksel veri modeli, sentetik seed ve outbox/audit temeli.
- Dashboard'dan audit çalışma alanına uzanan ilk gezilebilir ekran zinciri.
- API doğrulama, Swagger, güvenlik header'ları, CORS ve rate-limit başlangıcı.
- Docker Compose, CI, lint/typecheck/test/build yapılandırmaları.
- Beş ana ürün/tasarım dokümanı, kaynak içerikleri ve özgün dosya adları korunarak `docs/` altına aktarıldı.
- API demo repository'si tenant-scoped PostgreSQL/Prisma repository ile değiştirildi.
- Risk, kanıt, değerlendirme ve aksiyon yazmaları audit log/outbox ile aynı transaction'a alındı.
- Çapraz tenant ilişki kimlikleri güvenli `404` ile reddediliyor.
- OIDC JWT doğrulaması, doğrulanmış subject üzerinden tenant üyeliği ve deny-by-default izin guard'ları eklendi.

## Devam edenler

- PostgreSQL migration rollout ve RLS politikaları.

## Bekleyenler

- MinIO presigned upload, malware scanning ve kanıt immutable retention.
- Workflow engine, collector ve entegrasyonlar.
- UI fixture katmanının kalıcı API ile birleştirilmesi.

## Bilinen sorunlar

- `AUTH_DEV_BYPASS` yalnızca geliştirme/pilot kolaylığıdır ve production'da fail-closed davranır.
- Yerel profil şemayı `db:push` ile hazırlar; versioned production migration henüz yoktur.
- UI foundation verisini yerel fixture üzerinden gösterir.
- Gerçek IdP uygulama kaydı, production issuer/audience değerleri ve kullanıcı identity provisioning operasyonel kurulumda tamamlanmalıdır.
- Ana Technical Architecture kaynak belgesindeki .NET backend kararı, yaşayan repo/AGENTS NestJS kararıyla çelişir; foundation kararı korunmuş ve doküman uzlaştırması bekleyen iş olarak kaydedilmiştir.

## Sonraki önerilen iş

PostgreSQL versioned migration ve RLS politikalarını eklemek; ardından uçtan uca OIDC/çapraz tenant entegrasyon testlerini tamamlamak.
