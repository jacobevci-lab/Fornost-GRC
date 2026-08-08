# CISO-GRC

CISO-GRC; bilgi güvenliği, siber güvenlik ve yönetişim, risk ve uyum operasyonlarını tek tenant-aware platformda birleştirmeyi amaçlayan bir monorepodur. Bu depo ilk çalışan foundation sürümüdür ve **henüz production-ready değildir**.

## Mimari ve modüller

- `apps/web`: Next.js tabanlı erişilebilir, responsive Türkçe yönetim arayüzü.
- `apps/api`: NestJS REST API, Swagger, DTO doğrulama, standart hata modeli ve güvenlik başlangıç ayarları.
- `apps/worker`: outbox olaylarını işleyecek arka plan worker başlangıcı.
- `packages/database`: PostgreSQL/Prisma şeması ve anonim örnek seed verileri.
- `packages/shared`: API sözleşmeleri, enum'lar ve tenant context tipleri.
- `packages/config`: paylaşılan TypeScript yapılandırması.

İlk dikey dilim dashboard, varlık, risk, kontrol, kanıt metadata, değerlendirme, bulgu/aksiyon ve audit çalışma alanlarını kapsar. API bu alanlarda tenant-scoped Prisma repository kullanır; kritik yazmalar audit log ve outbox olayını aynı transaction içinde üretir. API OIDC JWT'lerini issuer/audience/JWKS ile doğrular, tenant context'ini doğrulanmış kullanıcı üyeliğinden üretir ve açık izin politikalarını deny-by-default uygular. PostgreSQL migration'ları tenant session context'ine bağlı zorunlu RLS politikalarını kurar. Gerçek dosya nesnesi yükleme sonraki fazdadır.

## Gereksinimler

- Node.js 22+
- pnpm 10+
- Docker ve Docker Compose

## Yerel kurulum ve çalıştırma

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres minio
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Web `http://localhost:3000`, API `http://localhost:3001/api/v1`, Swagger `http://localhost:3001/docs`, MinIO konsolu `http://localhost:9001` adresindedir.

## Test ve kalite

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

## Güvenlik notları

- Secret veya gerçek kurum verisi commit edilmez; yalnızca sentetik seed verisi kullanılır.
- Production istekleri Bearer OIDC token ve açık `x-tenant-id` seçimi taşır; tenant seçimi token subject'ine ait aktif üyelikle doğrulanmadan kabul edilmez.
- `AUTH_DEV_BYPASS=true` yalnızca production dışı pilot kullanım içindir; production ortamında fail-closed davranır.
- Repository sorguları transaction-local tenant context'i kurar; Prisma filtresine ek olarak PostgreSQL forced RLS çapraz-tenant okumayı ve yazmayı reddeder. Controller'lar açık permission policy olmadan erişime açılmaz.
- DTO validation, güvenlik header'ları, CORS allowlist, rate limit ve genişletilebilir authorization guard iskeleti vardır.
- Kanıt yükleme sözleşmesi dosya türü ve boyutunu doğrular; bu foundation yalnızca metadata kaydeder.
- Kritik değişiklikler audit/outbox modeliyle izlenmek üzere tasarlanmıştır. Ayrıntılar `docs/SECURITY.md` içindedir.

## Roadmap

Foundation sonrası kalıcı repository katmanı ve kimlik doğrulama; Core GRC; Evidence/Audit; entegrasyon/otomasyon; ileri analitik ve AI-assisted workflow fazları planlanmıştır. Ayrıntılar `docs/ROADMAP.md` ve güncel durum `PROJECT_STATUS.md` içindedir.
