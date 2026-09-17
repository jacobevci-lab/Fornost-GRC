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
3. Aksiyon sahibi, uygulama kanıtı ve SHA-256 özetiyle `verification` aşamasına gönderir.
4. Atanmış bağımsız Admin reviewer, ikinci kanıt zinciriyle bulguyu `closed` durumuna getirir.
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
