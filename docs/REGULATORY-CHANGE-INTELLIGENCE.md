# Regulatory Change Intelligence

Fornost Regülasyon Merkezi, düzenleyici değişiklikleri kaynak kaydından kanıtlı kapanışa kadar izleyen ana GRC iş akışıdır. Modül harici bir web tarayıcısı olduğunu iddia etmez; yetkili kaynak sicili, gözden geçirme takvimi ve kontrollü değişiklik alımı sağlar. Gelecekteki feed bağlantıları aynı alım ve doğrulama sınırlarına bağlanabilir.

## Yaşam döngüsü

1. Admin; HTTPS adresi, otorite, yetki alanı, sahip ve 1–365 günlük gözden geçirme periyoduyla kaynağı tanımlar.
2. Admin veya Editor, kaynağa ait değişikliği dış referans, yayın/yürürlük tarihi, önem, sahip ve bağımsız reviewer ile triaj kuyruğuna alır. İçerik özeti sunucuda SHA-256 ile mühürlenir.
3. Değişiklik; kontrol, politika, risk, varlık, tedarikçi, süreç, denetim veya kanıt kaydına etki olarak bağlanır. Her etki için aksiyon sahibi ve yürürlük tarihini aşmayan termin belirlenir.
4. Aksiyon sahibi çalışmayı başlatır ve kanıt referansı ile SHA-256 bütünlük değerini doğrulamaya gönderir.
5. Atanmış Admin reviewer, oluşturucu/gönderenden farklıysa kanıtı doğrular veya yeniden açar.
6. Değişiklik, en az bir etki kaydı bulunmadan ya da tüm etkiler doğrulanmadan kapatılamaz. Kapanış yalnız atanmış bağımsız reviewer tarafından yapılır.

## Roller ve karar kontrolleri

| İşlem | Admin | Editor | Viewer |
|---|---:|---:|---:|
| Kaynak tanımlama ve CSV dışa aktarma | Evet | Hayır | Hayır |
| Kaynak inceleme, değişiklik ve etki oluşturma | Evet | Evet | Hayır |
| Aksiyon başlatma ve doğrulamaya gönderme | Evet | Evet | Hayır |
| Etki doğrulama, yeniden açma ve değişiklik kapatma | Evet, maker-checker koşuluyla | Hayır | Hayır |
| Kayıtları görüntüleme | Evet | Evet | Evet |

Yüksek etkili kararlar tam onay ifadeleri ister. Kapsam dışı bırakma, değişiklik kapatma/yeniden açma ve etki geçişleri değişmez olay günlüğüne aktör, zaman ve ayrıntı ile yazılır.

## Güvenlik ve bütünlük

- Kaynak adresleri yalnız güvenli HTTPS URL olarak kabul edilir; private/on-prem adresler açık yönetici politikası olmadan engellenir.
- İstek boyutu 128 KiB ile, sorgu sonuçları sabit üst sınırlarla kısıtlanır.
- Değişiklik içeriği ve aksiyon/doğrulama kanıtları SHA-256 değerleriyle izlenir.
- CSV yalnız Admin içindir, cache dışıdır ve formül enjeksiyonuna karşı hücreleri güvenli hale getirir.
- Durum geçişleri sunucu tarafında doğrulanır; arayüzde düğmeyi gizlemek tek yetkilendirme katmanı değildir.
- Kaynak gözden geçirme işlemi otomatik veri toplama yerine sorumlu kişinin kontrollü attestation kaydıdır.

## Operasyonel göstergeler

Öncelik kuyruğu; inceleme zamanı gelen kaynakları, triaj bekleyen değişiklikleri, yüksek/kritik açık değişiklikleri, yürürlük tarihi geçmiş kayıtları, açık aksiyonları ve doğrulama kuyruğunu gösterir. Admin CSV çıktısı değişiklik sicilinin sınırlandırılmış anlık görünümüdür.
