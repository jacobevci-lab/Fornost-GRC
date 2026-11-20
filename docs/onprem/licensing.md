# On-prem lisans yönetimi

Ticari kurulum lisansı çevrimdışı doğrular. Her paket bir önceki paketin özelliklerini içerir. Mevcut kullanıcı rolleri ve modül yetkileri her pakette geçerlidir.

| Paket | Bu seviyede açılan başlıca işlemler |
| --- | --- |
| Essentials | Varlık envanteri, risk değerlendirmesi, BIA, kontroller, uyum ve Kanıt Kütüphanesi’ne elle dosya yükleme |
| Professional | Denetim planlama, kanıt talebi ve dosya sürümünü talebe bağlama, bulgular ve CAPA, tedarikçiler, risk iştahı ve KRI, iş sürekliliği |
| Enterprise | Connected GRC, API ile kanıt toplama, zamanlanmış kontroller, sürekli güvence ve AI yönetişimi |

## Müşteri yöneticisi

1. **Sistem Ayarları → Lisans** ekranındaki kurulum kimliğini satış ekibine iletin. İletişim adresi **sales@fornostsecurity.com**.
2. Aynı ekrandan bu kurulum için gönderilen imzalı `.fornost` dosyasını yükleyin. Paket, müşteri ve bitiş tarihini kontrol edin.
3. Yükseltme veya yenilemede aynı kurulum kimliği için daha yüksek revizyonlu dosyayı yükleyin. Mevcut kayıtlar ve dosya sürümleri aynı kurulumda kullanılmaya devam eder.

İlk ticari sürüme mevcut bir kurulumdan geçerken önceden yedek alın. Ticari sürüm etkinleştirme beklerken yerel yöneticinin ilk kuruluma, oturum ve sistem yönetimine erişimi sürer. Süre dolduğunda veya paket düşürüldüğünde mevcut kayıtlar saklanır. İlgili geçmiş kayıtların görüntülenmesi kullanıcının mevcut rolüyle sınırlıdır. Üst pakete ait yeni talepler, toplama ve zamanlanmış işlemler etkin paket gerektirir. Veritabanı ile kanıt deposunu birlikte yedekleyin. Kurulum kimliği ve lisans revizyonu veritabanında saklanır.

## Fornost yayın ekibi

Üretim imza anahtarını yayın ekibinin yönettiği güvenli ortamda oluşturun. Özel anahtar orada saklanır. İmaj derlemesi yalnızca açık anahtarı kullanır. Kaynak depoda `FORNOST_LICENSE_PUBLIC_KEY` adlı Actions değişkenine açık anahtar dosyasının içeriğini girin. On-prem derlemesi Ed25519 açık anahtarını zorunlu tutar. Geliştirme ve iç demo derlemesi ayrı çalışır.

```sh
node scripts/issue-license.mjs keygen /secure/fornost-private.pem /secure/fornost-public.txt
node scripts/issue-license.mjs issue /secure/fornost-private.pem "$INSTALLATION_ID" "Örnek Kurum" Professional 2027-11-20T00:00:00Z 2 kurum-professional.fornost
```

Her kurulum için verilen son revizyonu satış kaydında takip edin. Yeni dosyada bu sayıyı artırın. Aynı dosyanın tekrar yüklenmesi güvenlidir. Eski revizyon veya başka kurulum adına düzenlenen dosya reddedilir. Süre UTC olarak değerlendirilir. İmzalama anahtarının değişimi, yeni açık anahtarı içeren imaj ve yeni imzalı lisansların birlikte planlanmasını gerektirir.

## Kabul testi

Bağımlılıkları kurulmuş, bu teste ayrılmış bir kaynak kopyasında `bash tests/onprem-license-journey.sh` çalıştırılır. Test yerel Worker, D1, R2 ve tek kullanımlık bir yayın anahtarı kullanır. Aynı kurulumda elle yüklenen dosyayı Professional denetim talebine ekler, Enterprise ile yerel HTTP kaynağından toplama başlatır, ardından paketi düşürüp erişimi ve kayıtları yeniden denetler. Bu kopyanın ürettiği imaj yalnız test içindir.
