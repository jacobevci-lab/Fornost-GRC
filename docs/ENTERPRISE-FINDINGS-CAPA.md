# Enterprise Findings & CAPA Management

Fornost Bulgular ve CAPA Merkezi; denetim, sürekli kontrol, tedarikçi, regülasyon, risk, politika, olay, zafiyet ve AI güvence kaynaklarından gelen iyileştirme ihtiyaçlarını ortak bir kurumsal kayıt ve kanıt zincirinde yönetir.

## Kontrollü kayıt

Her bulgu benzersiz kod, kaynak türü/referansı, bulgu türü, önem seviyesi, açıklama, aksiyon sahibi, bağımsız reviewer, kök neden, düzeltici aksiyon, önleyici aksiyon ve termin içerir. İsteğe bağlı risk ve kontrol referansları, bulguyu mevcut GRC envanterine bağlar.

SLA üst sınırları önem seviyesine göre fail-closed uygulanır:

| Önem | Azami termin |
|---|---:|
| Critical | 7 gün |
| High | 30 gün |
| Medium | 60 gün |
| Low | 90 gün |

## Yaşam döngüsü

1. Bulgu `open` durumunda kaydedilir.
2. Atanmış aksiyon sahibi veya Admin, CAPA çalışmasını `in-progress` durumuna alır.
3. Aksiyon sahibi veya yetkili Admin, kütüphaneden seçtiği uygulama kanıtı ve dosya sürümüyle `verification` aşamasına gönderir. SHA-256 sunucuda doğrulanır.
4. Atanmış bağımsız Admin reviewer, güncel bulguyu ve planı inceleyip kendi doğrulama kanıtını seçerek bulguyu `closed` durumuna getirir.
5. Admin yeniden açarsa kayıt `in-progress` olur ve tekrar sayacı artar.

Tespit eden, aksiyon sahibi veya doğrulamaya gönderen kişi aynı bulguyu kapatamaz. Her geçiş; önceki/yeni durum, aktör, açıklama, kanıt referansı, SHA-256 ve zaman bilgisiyle yalnız eklenen olay geçmişine yazılır.

## Risk kabulü

Açık veya devam eden bir bulgu yalnız atanmış bağımsız Admin reviewer tarafından, kanıt ve en az 20 karakter gerekçeyle en fazla 180 gün kabul edilebilir. Süresi geçen kabul yeniden öncelik kuyruğuna düşer. Kabul edilmiş veya kapalı kayıt yeniden açıldığında tekrar sayacı artırılır; eski olay geçmişi korunur.

## Yönetim görünümü ve güvenlik

- Açık, kritik, gecikmiş, doğrulamadaki, kabul edilmiş ve tekrarlayan kayıtlar ayrı KPI olarak izlenir.
- Dağıtık continuous-control, TPRM, AI assurance ve regülasyon kuyrukları salt okunur kaynak sinyali olarak gösterilir.
- Viewer salt okunur; Editor oluşturma ve sahip olduğu aksiyonu yürütme; Admin bağımsız karar yetkisine sahiptir.
- API gövdeleri 256 KiB, sorgular 3.000 bulgu ve 1.000 olay ile sınırlandırılır.
- CSV yalnız Admin tarafından alınabilir, cache dışıdır ve formül enjeksiyonuna karşı güvenlidir.
- Runtime self-heal şeması, Drizzle migration ve tipli şema aynı veri modelini taşır.

## Workspace recovery (2026-10-06)

- Reads and writes have a 15-second deadline covering response headers and JSON parsing. Superseded reads and unmounted requests are cancelled; writes are never automatically retried.
- Failed or malformed loads show an explicit retry state and suppress KPI values. Existing rows may remain visible as stale context, but mutations are blocked until a successful refresh.
- An uncertain create closes its dialog and performs a read-only refresh. Decision dialogs retain the note and selected evidence, block resubmission and require a read-only context refresh; a changed source must be explicitly adopted with a new confirmation. A completed operation is unavailable. Closing after a changed context refreshes the parent register/history. A synchronous submission guard prevents duplicate requests before React re-renders.
- The register pages through 20 records with server-side search/filtering across canonical findings. Top counts and All CAPA CSV are independent of register filters. Record history pages through 50 events. Legacy unpaged reads retain their disclosed limits.
- Source-count failures carry `available: false`, displayed as unavailable rather than zero. CSV export neutralizes formula markers after leading whitespace.
- `scripts/findings-workspace-qa.mjs` exercises outage recovery, pagination, search, keyboard access, duplicate submissions and uncertain outcomes with isolated fixtures.
- Lifecycle transitions additionally compare the persisted status and update timestamp. The guarded update and its audit event run in one D1 transaction; stale writers receive 409 and audit-write failure rolls back the state change. SQLite regression tests verify competing writers, same-status edits and rollback.

## Bağlı karar kanıtları — 28 Ekim 2026

Yeni kayıtta etkin aksiyon sahibi ve bağımsız Admin doğrulayıcı dizinden seçilir. Gönderim, bağımsız kapanış ve risk kabulü kendi dosya sürümüyle işlem geçmişinde korunur; yeniden açma ve yeni dosya yükleme bu geçmişi değiştirmez. Kanıt Kullanımı tarihsel kararları güncel kaynak durumundan ayrı gösterir ve bulguya döndürür. Kaynak çalışma kâğıdı/tespit kanıtı, düzeltme veya bağımsız doğrulama kanıtının yerine geçmez. [Kullanım, izin, kurtarma ve API sınırları](capa-connected-evidence.md).
