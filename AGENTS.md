# CISO-GRC Agent Rehberi

## Ürün kapsamı

Kurumsal risk, varlık, kontrol, kanıt, değerlendirme, bulgu, aksiyon, audit, politika, exception, vendor ve workflow süreçleri tek tenant-aware platformda yönetilir.

## Değişmez mimari kararlar

- pnpm workspace monorepo; Next.js web, NestJS REST API ve PostgreSQL/Prisma.
- UUID kimlikler, UTC timestamp, soft delete (`deletedAt`) ve açık `tenantId`.
- Kritik yazmalarda audit log ve transactional outbox tasarımı.
- API sözleşmeleri geriye uyum gözetir; breaking change karar kaydına yazılır.

## Kod standartları

- TypeScript strict mode; İngilizce kod/API adları, Türkçe ürün metinleri.
- ESLint ve Prettier zorunludur. Input'lar DTO ile doğrulanır.
- Secret, token, connection string, kişisel veri veya gerçek kurum verisi loglanmaz/commit edilmez.

## Tenant izolasyonu ve güvenlik

- Tenant context controller'dan servis/repository katmanına açıkça taşınır.
- Tenant kapsamı olmayan sorgu yazılmaz; çapraz tenant ID'leri `404` gibi güvenli yanıt üretir.
- Kullanıcıdan gelen tenant ID tek başına güvenilmez; production'da doğrulanmış kimlikten türetilir.
- Dosya türü, boyutu ve storage key sunucu tarafında doğrulanır; içerik taranmadan güvenilir sayılmaz.
- Authorization deny-by-default genişletilir; kritik değişiklik audit olayı üretir.

## Test ve doğrulama

Değişen kapsam için lint, typecheck, unit/integration test ve mümkünse build çalıştırılır. Tenant sınırı, validation ve hata yolları test edilmeden güvenlik özelliği tamamlanmış sayılmaz.

## Dokümantasyon kuralı

Davranış veya mimari değişince README, PROJECT_STATUS, CHANGELOG ve ilgili `docs/` kararı aynı değişiklikte güncellenir. **Tamamlanmadıysa tamamlandı yazma.** Erişilemeyen kaynak içeriği tahmin etme.
