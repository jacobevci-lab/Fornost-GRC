# Enterprise Policy Lifecycle Management

Fornost Politika Merkezi, kurumsal politikayı yalnız bir doküman kaydı olarak değil; sahiplik, sürüm, eşleme, bağımsız karar, yayın, çalışan kabulü, istisna ve emeklilikten oluşan kanıtlanabilir bir yaşam döngüsü olarak yönetir.

## Yaşam döngüsü

1. Politika sicilinde benzersiz kod, kategori, bilgi sınıfı, hedef kitle, sahip, bağımsız reviewer ve 30–1095 günlük inceleme sıklığı tanımlanır.
2. Her değişiklik yeni bir sürümdür. İçerik en az bir kontrol, regülasyon veya risk referansıyla eşlenir ve sunucuda SHA-256 özeti alınır.
3. Taslak, tam onay ifadesi ve kanıtla incelemeye gönderilir. Reviewer, sürümü oluşturan veya gönderen kişi olamaz.
4. Yalnız atanmış Admin reviewer onay/red kararı verir. Yalnız onaylı sürüm yayımlanabilir; önceki yayın otomatik olarak `superseded` olur.
5. Sonraki inceleme tarihi yürürlük tarihi ve politika inceleme sıklığından deterministik hesaplanır. Geciken ve 30 gün içinde gelen incelemeler öncelik kuyruğuna girer.
6. Yalnız yayımdaki sürüm için attestation kampanyası ve süreli istisna açılabilir. Politika, açık kampanya veya aktif istisna varken yürürlükten kaldırılamaz.

## Attestation

Admin, yayımdaki içerik sürümüne en fazla 500 benzersiz kullanıcı içeren kampanya açar. Viewer dahil her kullanıcı yalnız kendi e-posta adresine atanmış satırı görebilir ve yalnız kendi kararını verebilir. Kabul veya ret tam onay ifadesi ve not gerektirir. Karar, okunan politika içeriğinin SHA-256 özetiyle birlikte saklanır; sonradan değişmiş bir içerik aynı kabulün parçası gibi gösterilemez.

## İstisnalar

İstisna kapsamı, gerekçe, telafi kontrolü, sorumlu, bağımsız reviewer ve 1–180 günlük bitiş tarihi zorunludur. Taslak → gönderildi → onaylandı/reddedildi → kapatıldı akışı uygulanır. Oluşturan, gönderen veya istisna sahibi karar veremez. Onay ve kapanışta kanıt referansı ile 64 karakter SHA-256 gerekir. Süresi dolan onaylar çalışma anında `expired` olarak gösterilir.

## Güvenlik sınırları

- İstek boyutu 256 KiB, politika içeriği 50.000 karakter, sorgu ve dışa aktarma sonuçları sabit üst sınırlarla korunur.
- Admin CSV dışa aktarımı formül enjeksiyonuna karşı güvenlidir ve dışa aktarma olayı değişmez olay kaydına yazılır.
- Viewer metadata okuyabilir; attestation satırlarında yalnız kendi atamalarını görür. Editor politika/sürüm/istisna taslağı oluşturabilir. Kararlar, kampanya ve kontrollü emeklilik Admin ile sınırlıdır.
- Tüm kritik geçişler tam Türkçe onay ifadesi, açıklama ve gerekli yerlerde kanıt SHA-256 ile fail-closed çalışır.
- `policy_events` tablosu olay eklemeli audit izidir; uygulama mevcut olayları güncellemez veya silmez.

## Denetim kanıtı

Politika sürümünün içerik özeti, eşlemeleri, maker/checker kimlikleri, gönderme/onay/yayın zamanları, attestation imzaları, istisna kanıtları ve olay geçmişi birlikte denetlenebilir kanıt zincirini oluşturur. Migration `drizzle/0070_policy_lifecycle_management.sql`, çalışma zamanı şema güvenliği API içinde ve Drizzle modeli `db/schema.ts` içinde tutulur.
