# Changelog

Tüm önemli değişiklikler bu dosyada belgelenir. Yapı Keep a Changelog yaklaşımını izler.

## [Unreleased]

### Added

- Tenant-scoped Prisma repository ve Prisma lifecycle servisi.
- Kritik GRC yazmaları için transaction içi audit log ve outbox olayları.
- Kalıcı ekran zincirini besleyen genişletilmiş sentetik seed.
- Yerel/pilot PostgreSQL şema hazırlığı için açık `db:push` komutu.

- CISO-GRC platform foundation monoreposu.
- İlk GRC dikey dilimi, tenant-aware Prisma şeması, API, worker ve web deneyimi.
- Güvenlik, roadmap, karar ve proje durum dokümantasyonu.
- Docker Compose ve GitHub Actions kalite hattı.
# 2026-08-08

- OIDC issuer/audience/JWKS token doğrulaması eklendi.
- Tenant context doğrulanmış identity membership üzerinden üretilir hale getirildi.
- Route izinleri deny-by-default guard ve açık permission deklarasyonlarına taşındı.

