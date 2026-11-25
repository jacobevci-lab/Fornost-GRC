# Continuous Control Monitoring 2.0

Fornost CCM, üreticiye bağımlı olmayan REST/JSON kaynaklarını uyum ve güvenlik kontrollerine bağlar. Her kontrol testi bir kaynak, JSON path, operatör, beklenen değer, framework kontrol referansları, çalışma takvimi ve kanıt tazelik hedefi taşır.

## Yaşam döngüsü

1. Admin, şifreli kimlik bilgisiyle bir kanıt kaynağı tanımlar ve bağlantıyı test eder.
2. Admin; saatlik, günlük, haftalık veya aylık sürekli kontrol tanımlar.
3. Yetkili kullanıcı tek kontrolü ya da zamanı gelen en fazla 20 kontrolü güvenli bir batch olarak çalıştırır.
4. Motor JSON alanını değerlendirir, yanıtın SHA-256 hash'ini üretir ve Kanıtlar modülüne tazelik son tarihiyle kayıt açar.
5. Başarısızlık sayısı tanımlı eşiğe ulaşırsa aynı kontrol için tek açık CCM bulgusu ve Risk Assessment kaydı oluşur. Yeni hatalar aynı bulgunun occurrence sayısını artırır.
6. Editor bulguyu sahiplenir. Admin, kapanış notu, kanıt referansı ve 64 karakter SHA-256 sağlamadan bulguyu kapatamaz. Bulguyu sahiplenen kişi aynı bulguyu doğrulayamaz.

## Güvenlik sınırları

- Connector URL'leri SSRF politikasından geçer; private adresler varsayılan olarak reddedilir.
- HTTP redirect kabul edilmez, bağlantı 12 saniyede zaman aşımına uğrar ve JSON yanıtı 1 MB ile sınırlıdır.
- API sırları hiçbir GET cevabına veya çalışma kaydına dönmez.
- Başarılı, başarısız ve teknik hata çalışmaları ayrı kaydedilir; teknik hatalar `SOURCE_REQUEST_FAILED` kodunu taşır.
- Rule pause/resume ve bulgu kapatma yalnız Admin rolündedir.
- Kapanış maker-checker ayrımı ve kanıt hash'i gerektirir.

## Sağlık durumları

- `healthy`: son test başarılı ve kanıt taze.
- `failing`: son test başarısız/hatalı veya ardışık hata vardır.
- `expiring`: tazelik penceresinin yüzde 80'i aşılmıştır.
- `stale`: tazelik süresi dolmuştur.
- `missing`: kontrol henüz kanıt üretmemiştir.
- `paused`: kontrol yönetici tarafından duraklatılmıştır.

Hosted ve on-prem dağıtımlar aynı D1 uyumlu migration ve API sözleşmesini kullanır. Eski Evidence Automation tabloları çalışma anında eksik kolonlar eklenerek geriye uyumlu biçimde yükseltilir.
