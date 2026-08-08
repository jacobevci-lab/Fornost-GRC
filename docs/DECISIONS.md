# Mimari Kararlar

## ADR-001 — Modüler monorepo

**Karar:** Next.js, NestJS, worker ve paylaşılan paketler pnpm workspace içinde tutulur. **Gerekçe:** İlk sürümde sözleşme paylaşımı ve tek kalite hattı sağlar; modüller gerektiğinde bağımsız deploy edilebilir.

## ADR-002 — Tenant kapsamı her katmanda açık

**Karar:** `tenantId` veri modellerinde zorunlu, servis/repository çağrılarında açık parametredir. **Gerekçe:** Gizli global state yerine denetlenebilir izolasyon sağlar ve PostgreSQL RLS için temel oluşturur.

## ADR-003 — PostgreSQL ve Prisma

**Karar:** UUID, UTC timestamp, soft delete ve tenant bileşik indeksleri kullanılan PostgreSQL/Prisma modeli. **Gerekçe:** İlişkisel GRC verisi, transaction ve denetim ihtiyaçları.

## ADR-004 — Audit log ve transactional outbox

**Karar:** Kritik state değişiklikleri append-only audit kaydı ve aynı transaction'da outbox olayı üretir. **Gerekçe:** İzlenebilirlik ve güvenilir asenkron entegrasyon.

## ADR-005 — Foundation API'de demo repository

**Karar:** İlk çalışan API sentetik process-memory veri ile sunulur; Prisma şeması hazırdır. **Gerekçe:** Ekran ve API sözleşmesini hemen test edilebilir bırakmak. Bu production kalıcılığı değildir ve sonraki iş olarak açıkça kaydedilmiştir.

## ADR-006 — Kanıt yükleme iki aşamalı

**Karar:** Foundation metadata doğrular; nesne yükleme ileride presigned URL, malware scan ve quarantine akışıyla eklenir. **Gerekçe:** Doğrulanmamış byte akışını uygulama sunucusuna güvenli varsaymamak.
