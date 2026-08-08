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

## Devam edenler

- OIDC tabanlı authentication ve doğrulanmış kimlikten tenant üyeliği üretimi.
- PostgreSQL migration rollout ve RLS politikaları.

## Bekleyenler

- MinIO presigned upload, malware scanning ve kanıt immutable retention.
- Workflow engine, collector ve entegrasyonlar.
- UI fixture katmanının kalıcı API ile birleştirilmesi.

## Bilinen sorunlar

- `x-tenant-id` yalnızca geliştirme/pilot kolaylığıdır; production kimlik sınırı değildir.
- Yerel profil şemayı `db:push` ile hazırlar; versioned production migration henüz yoktur.
- UI foundation verisini yerel fixture üzerinden gösterir.
- Authentication guard yalnızca genişletilebilir sözleşme iskeletidir.
- Ana Technical Architecture kaynak belgesindeki .NET backend kararı, yaşayan repo/AGENTS NestJS kararıyla çelişir; foundation kararı korunmuş ve doküman uzlaştırması bekleyen iş olarak kaydedilmiştir.

## Sonraki önerilen iş

OIDC token doğrulaması, tenant üyeliği lookup'ı ve deny-by-default permission policy eklemek; ardından PostgreSQL RLS ve uçtan uca çapraz tenant entegrasyon testlerini tamamlamak.
