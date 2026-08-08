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

## ADR-007 — Foundation backend kararı

**Karar:** Yaşayan repository ve `AGENTS.md` uyarınca foundation backend NestJS olarak devam eder. **Gerekçe:** Merge edilmiş çalışan foundation'ı yeniden kurmamak ve mevcut API sözleşmesini korumak. Ana Technical Architecture kaynak belgesindeki .NET kararı tarihsel kaynak olarak korunur; dokümanların resmî olarak uzlaştırılması ayrı karar işidir.

## ADR-008 — GRC API kalıcı repository

**Karar:** Process-memory demo repository, tenant ve soft-delete kapsamını her sorguda uygulayan Prisma repository ile değiştirilir. Kritik yazmalar domain kaydı, audit log ve outbox olayını tek PostgreSQL transaction'ında üretir. **Gerekçe:** Restart sonrası kalıcılık, izlenebilirlik ve ileride RLS uygulanacak açık repository sınırı.

## ADR-009 — Yerel şema hazırlığı

**Karar:** Versioned production migration seti tamamlanana kadar yalnızca yerel/pilot profil `prisma db push` ile hazırlanır. **Gerekçe:** Kalıcı repository'nin çalıştırılabilir olması; bu yaklaşım production migration rollout veya RLS tamamlandı anlamına gelmez.

## ADR-006 — Tenant context ve PostgreSQL RLS

- Karar: Uygulama sorguları, transaction başında `set_config('app.current_tenant_id', tenantId, true)` ile transaction-local tenant context kurar.
- Karar: Tenant kapsamlı tablolar `ENABLE ROW LEVEL SECURITY` ve `FORCE ROW LEVEL SECURITY` ile korunur; hem `USING` hem `WITH CHECK` politikaları uygulanır.
- Karar: Production runtime veritabanı rolü migration sahibinden ayrı, `BYPASSRLS` yetkisi olmayan en az ayrıcalıklı rol olacaktır.
- Sonuç: Prisma filtreleri defense-in-depth olarak kalır; veritabanı çapraz-tenant okuma ve yazmayı bağımsız olarak reddeder.
