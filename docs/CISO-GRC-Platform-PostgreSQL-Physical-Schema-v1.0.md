# CISO GRC & Assurance Platform — PostgreSQL Fiziksel Şema ve Migration Temeli

**Belge Kodu:** DB-001  
**Sürüm:** 1.0  
**Tarih:** 6 Ağustos 2026  
**Durum:** Uygulanabilir veritabanı temeli  
**Bağlı belgeler:** CHARTER-001, PRD-001, IA-001, IAM-001, DATA-001, RISK-001

## 1. Sonuç

DB-001, ürünün ilk gerçek çalıştırılabilir altyapısını kurar. Fiziksel model framework merkezli değildir; tenant/kimlik, organizasyon, varlık, yükümlülük, ortak kontrol, risk, kanıt, assurance, bulgu ve denetim izi domainlerini tek PostgreSQL veritabanında net şema sınırlarıyla ayırır.

İlk migration, ekran prototipindeki şu zinciri veri seviyesinde destekler:

`HOME-002 → AST-003/AST-002 → RSK-002/RSK-003 → CTL-002/CTL-003 → EVD-004/EVD-006 → CTL-007 → FND-002/FND-005 → AUD-014`

## 2. Fiziksel tasarım kararları

| Karar | Uygulama |
|---|---|
| Mimari | Domain sınırları tanımlı modüler monolit |
| Kimlik | UUID; UUIDv7 uygulama katmanında üretilebilir, DB fallback `gen_random_uuid()` |
| Tenant izolasyonu | Her iş tablosunda `tenant_id`, composite tenant FK ve zorunlu PostgreSQL RLS |
| Yetki | RLS tenant sınırını kurar; RBAC+ABAC+ReBAC+SoD kararları ayrıca API policy katmanında uygulanır |
| Tarih | Bütün `timestamptz` değerleri UTC; iş geçerliliği ve değerlendirme dönemi ayrı |
| Değişmezlik | Published/approved snapshot güncellenmez; yeni version/revision üretilir |
| Kanıt | Metadata DB'de, binary/ham çıktı object storage'da; SHA-256 bütünlük kontrolü |
| Audit | Append-only, tenant bazlı sıra ve hash zinciri, zamana göre partition |
| Eşzamanlılık | Kullanıcı tarafından güncellenen kayıtlarda `row_version` optimistic locking |
| Silme | Yayınlanmış/denetimde kullanılmış kayıtlar fiziksel silinmez; archive/supersede kullanılır |
| Secret | Yalnızca vault/HSM/KMS referansı; secret değeri asla DB'ye girmez |

## 3. Domain şemaları

Migration şu şemaları baştan oluşturur:

- Çekirdek: `platform`, `iam`, `org`
- İş alanları: `asset`, `obligation`, `control`, `risk`, `evidence`, `assurance`, `audit`, `issue`
- Genişleme sınırları: `privacy`, `tprm`, `resilience`, `policy`, `secops`, `ai`, `reporting`

Genişleme şemalarının ilk günden tanımlanması, privacy/TPRM/BCM/AI modüllerinin sonradan bağımsız eklenti gibi veri modeline yapıştırılmasını engeller. Tablolar, ilgili domain uygulama sırasına göre yeni migration'larla eklenecektir.

## 4. Tenant ve kimlik sınırı

`platform.current_tenant_id()` ve `platform.current_principal_id()` transaction-local uygulama bağlamını okur. Uygulama her transaction başında:

```sql
SET LOCAL app.tenant_id = '<tenant uuid>';
SET LOCAL app.principal_id = '<principal uuid>';
```

değerlerini kurar. Tenant bağlamı yoksa `tenant_id = NULL` sonucu oluşur ve RLS hiçbir iş kaydına izin vermez.

Tenantlar arası ilişkiyi engellemek için iş tabloları yalnızca `id` ile değil `(tenant_id, id)` üzerinden bağlanır. Global kataloglar (`framework`, `requirement`, `control_objective`) tenant verisi taşımaz; kurum uygulamaları ve eşlemeleri taşır.

RLS yalnızca tenant güvenlik sınırıdır. Aşağıdaki kararlar servis policy katmanında ve sorgu filtrelerinde uygulanır:

- Nesne ve fiil izni
- Organizasyon/veri kapsamı
- Owner, reviewer, auditor veya vendor ilişkisi
- Veri sınıfı
- Oturum, cihaz, MFA ve lokasyon koşulu
- SoD ve maker-checker

## 5. Değişmez kayıtlar

| Nesne | Değişmezlik başlangıcı | Değişiklik yöntemi |
|---|---|---|
| Framework version | `published` | Yeni framework version |
| Control objective version | `published` | Yeni objective version |
| Risk methodology | `published` | Yeni methodology version |
| Risk assessment | `approved` | Yeni assessment revision |
| Assessment result | `approved` | Yeni assessment instance/result |
| Evidence version | Oluşturulduğu an | Yeni evidence version |
| Audit event | Oluşturulduğu an | Değişiklik yasak |

`risk_assessment` ve `assessment_result` üzerindeki trigger, onaylanmış kaydın UPDATE/DELETE işlemini reddeder. Skorun yeni bilgiyle değişmesi geçmiş sonucu düzeltmez; yeni revision oluşturur.

## 6. Risk fiziksel modeli

Risk senaryosu; neden/tehdit, olay ve sonuç bileşenleriyle saklanır. Her değerlendirme:

- metodoloji sürümü,
- değerlendirme dönemi ve `as_of_at`,
- assessor ve bağımsız approver,
- kapsam snapshot'ı,
- veri kaynakları,
- varsayımlar,
- güven seviyesi

taşır.

Doğal, artık ve hedef skorlar ayrı `risk_score_result` kayıtlarıdır. Her biri ham olasılık/etki, 1–5 seviye, üretilen 5×5 skor, risk bandı, formül/girdi snapshot'ı ve input hash taşır. Override varsa orijinal sonuç ile gerekçe zorunludur.

Kontrol–risk eşlemesi `maximum_likelihood_reduction`, `maximum_impact_reduction`, `treatment_role`, `dependency_type` ve `dependency_factor` taşır. Böylece aynı mekanizmanın iki kez sayılması fiziksel modelde görünür ve hesaplama katmanında engellenebilir.

## 7. Kontrol etkinliği ve assurance

Kontrol etkinliği tek bir boolean değildir. Her `assessment_instance` kontrol, test tanımı, dönem, kapsam ve tester'a bağlanır. Sonuçta aşağıdaki boyutlar ayrı saklanır:

- Design Effectiveness (DE)
- Operating Effectiveness (OE)
- Coverage (CV)
- Evidence Confidence (EC)
- Birleşik etkinlik ve kullanılan formül snapshot'ı

Varsayılan ağırlıklar RISK-001 uyarınca DE %25, OE %35, CV %25 ve EC %15'tir. Fiziksel DB yalnızca sonucu ve yeniden üretim girdilerini saklar; geometrik ortalama, cap'ler ve stale kuralları versioned domain service tarafından hesaplanır.

Maker-checker koşulu, sonuç yaratıcısının approver olmasını DB CHECK ile engeller. Daha geniş SoD kombinasyonları workflow/policy katmanında doğrulanır.

## 8. Evidence Eligibility

Kanıt yeniden kullanımı dosya kimliğine göre yapılmaz. `assessment_evidence` şu üçlüye bağlanır:

1. Belirli `evidence_version`
2. Belirli `eligibility_evaluation`
3. Belirli `assessment_instance`

Eligibility kaydı assertion, kapsam, dönem, güncellik, popülasyon, örneklem, güven, onay, bütünlük ve izin boyutlarını ayrı tutar. Motor sürümü, input snapshot ve hash saklandığından karar yeniden üretilebilir.

## 9. Audit trail

`audit.audit_event`:

- Tenant bazlı monoton sıra
- Önceki event hash ve event hash
- Actor/impersonator
- Entity ve version
- Güvenli değişiklik özeti
- Request/correlation/session
- IP ve cihaz bağlamı
- Gerekçe ve workflow referansı

taşır. Tablo zamana göre partition edilmiştir; default partition ilk kurulumun kayıt kaybetmemesini sağlar. Operasyon runbook'u aylık partition'ları önceden oluşturacak ve hash zinciri anchor değerini bağımsız immutable storage/SIEM'e aktaracaktır.

Hash değeri uygulama/audit writer tarafından kanonik serileştirme ile üretilir. Normal servis rolünün audit UPDATE/DELETE yetkisi olmayacaktır; trigger ikinci savunma katmanıdır.

## 10. İndeks stratejisi

İlk indeksler kullanıcı akışlarına göre tanımlanmıştır:

- Aktif varlıkların tenant ve lifecycle durumu
- Kontrol/risk/bulgu sahipliği ve durum listeleri
- Risk değerlendirme geçmişi
- Skor tipi ve yüksekten düşüğe 5×5 skor
- Kanıt item/version ve SHA-256 araması
- Purpose bazlı eligibility geçmişi
- Assurance sonucu
- Entity ve correlation bazlı audit izi

Üretim indeksleri gerçek sorgu planları ve tenant veri hacmiyle ölçülerek genişletilecektir; her JSONB alanına gelişigüzel GIN indeks eklenmeyecektir.

## 11. Güvenli deployment rolleri

| Rol | Yetki |
|---|---|
| Migration owner | DDL ve migration; uygulama runtime'ında kullanılmaz |
| Application service | Gerekli tablolarda sınırlı DML; RLS zorunlu, `BYPASSRLS` yok |
| Audit writer | Audit insert; update/delete yok |
| Read replica/reporting | Maskelenmiş ve kapsam kontrollü read model |
| Support operator | İş verisine varsayılan erişim yok; süreli break-glass |

Tablo sahibi olan rol RLS'yi aşabildiği için uygulama servis hesabı hiçbir tablonun sahibi olmayacaktır. `FORCE ROW LEVEL SECURITY` ayrıca uygulanmıştır.

## 12. Migration politikası

- Uygulanmış migration dosyası değiştirilmez.
- Her migration transaction içinde ve `ON_ERROR_STOP` ile çalışır.
- Destructive schema değişikliği expand–migrate–contract yaklaşımıyla yapılır.
- Büyük tablo değişikliklerinde online/backfill planı ve geri dönüş prosedürü hazırlanır.
- Seed edilen framework içeriğinin lisans türü ve source provenance kaydı olmadan import yapılmaz.
- Migration checksum'u deployment tablosunda saklanacak; bu tablo uygulama iskeletiyle birlikte eklenecektir.

## 13. Doğrulama durumu

Bu çalışma ortamında PostgreSQL binary/runtime bulunmadığı için migration gerçek PostgreSQL 16 instance üzerinde çalıştırılamadı. Buna karşılık dosya yapısı, transaction sınırı, tablo/FK bağımlılık sırası, tenant composite FK yaklaşımı, RLS kapsamı, immutability trigger'ları ve indeks hedefleri statik olarak gözden geçirildi.

İlk uygulama iskeleti oluşturulurken CI içinde PostgreSQL 16 container ile şu testler zorunlu olacaktır:

1. Temiz veritabanına migration uygulama
2. Tenant bağlamı olmadan read/write reddi
3. Tenant A kaydına Tenant B erişiminin reddi
4. Cross-tenant FK reddi
5. Approved/published kayıt mutation reddi
6. Evidence version bütünlük ve URI kısıtları
7. Maker-checker constraint'leri
8. Audit UPDATE/DELETE reddi
9. Risk score ve percentage sınırları
10. Migration idempotency değil, checksum ve tek sefer uygulama davranışı

## 14. Kabul kriterleri

- [x] Tüm planlanan domain şemaları oluşturuldu.
- [x] İlk prototip zincirinin çekirdek tabloları tanımlandı.
- [x] İş tablolarında tenant kimliği ve RLS zorunlu kılındı.
- [x] Cross-tenant FK riski composite tenant FK ile azaltıldı.
- [x] Risk score snapshot ve methodology version ilişkisi kuruldu.
- [x] DE/OE/CV/EC sonuç yapısı kuruldu.
- [x] Evidence version + scope + eligibility modeli kuruldu.
- [x] Finding/action ve bağımsız closure doğrulaması kuruldu.
- [x] Append-only audit ve hash zinciri modeli kuruldu.
- [x] Published/approved kayıt immutability kuralları eklendi.
- [x] Kullanıcı akışlarına yönelik başlangıç indeksleri tanımlandı.
- [ ] PostgreSQL 16 üzerinde migration entegrasyon testi — uygulama iskeleti aşamasında.

## 15. Sonraki teknik teslimat

`ARCH-001` ile uygulama mimarisi ve API sözleşmesi hazırlanacaktır. Ardından çalışan repository iskeletinde PostgreSQL 16 CI testi, migration runner, backend domain modülleri ve ilk UI akışı birlikte kurulacaktır.