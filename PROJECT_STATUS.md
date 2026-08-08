# Proje Durumu

Son güncelleme: 2026-08-08

## Tamamlananlar

- pnpm monorepo, Next.js web, NestJS API, worker ve Prisma foundation.
- Tenant-aware fiziksel veri modeli, sentetik seed ve outbox/audit temeli.
- Dashboard'dan audit çalışma alanına uzanan ilk gezilebilir ekran zinciri.
- API doğrulama, Swagger, güvenlik header'ları, CORS ve rate-limit başlangıcı.
- Docker Compose, CI, lint/typecheck/test/build yapılandırmaları.

## Devam edenler

- API'nin demo repository'sinden PostgreSQL/Prisma repository'sine geçişi.
- Gerçek authentication/authorization provider entegrasyonu.

## Bekleyenler

- Library'deki beş ürün dokümanı; bu çalışma oturumunda Library erişimi yoktur ve içerik üretilmemiştir.
- MinIO presigned upload, malware scanning ve kanıt immutable retention.
- RLS politikaları, workflow engine, collector ve entegrasyonlar.

## Bilinen sorunlar

- Demo API verileri process restart'ta sıfırlanır.
- UI foundation verisini yerel fixture üzerinden gösterir; API entegrasyonu sonraki iştir.
- Authentication guard yalnızca genişletilebilir sözleşme iskeletidir.

## Sonraki önerilen iş

OIDC tabanlı kimlik doğrulama ile tenant üyeliğini bağlayıp servis katmanını Prisma repository'sine geçirmek; ardından PostgreSQL RLS entegrasyon testlerini eklemek.
