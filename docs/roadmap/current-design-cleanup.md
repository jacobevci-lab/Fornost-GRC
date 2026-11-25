# Güncel tasarım ve kaynak temizliği

25 Kasım 2026 · Başlangıç: `1f4a371e33043833535c98a3113fc5f0579423f1`

## Amaç

Canlı uygulamanın kompakt tipografi, form ve tema sözleşmesini kaynakta da açık hale getirmek; kullanılmayan ekran/tema denemelerini ve yanlış sürüme işaret eden başlangıç belgelerini kaldırmak.

## Kabul

- Tek font ailesi ve 10 / 10.5 / 11 / 12 / 13 / 15 / 17 px rol ölçeği; kök kullanıcı yazı ölçeği korunur.
- TR/EN, açık/koyu, masaüstü/mobil; tablolar, modallar, çekmeceler, giriş ve dış portallar mevcut işlevlerini korur.
- Uygulamaya bağlanmayan eski dashboard/tema dosyaları import grafiği ve repo referanslarıyla doğrulanır; aktif kontrol/kanıt/kod/veri yaşam döngülerine dokunulmaz.
- Bileşenlerde global sözleşmenin zaten geçersiz kıldığı yazı tanımları kaldırılır; ikon/pseudo içerik ve bağımsız rapor çıktısı ayrımı korunur.
- Güncel rehberler doğrulanmış davranışı anlatır; tarihsel migration/QA/karar belgeleri geçmiş kanıt olarak kalır.
- Kalite/build/regresyon ve tarayıcı matrisi; main birleştirme sonrası canlı revision ve smoke kontrolü.

## Geri dönüş

Bu değişiklik veri migration'ı içermez. Önceki uygulama revizyonuna dönülebilir; silinen kaynak denemeleri Git geçmişindedir. Kabul kanıtları PR ve CI artifact'larında tutulur.

## Doğrulama bulgusu

Yerel taramada 384 görünüm, 14 dialog türü ve 49.414 metin/alan ölçümü hatasız geçti; sidebar kontrolü beş görünümü doğruladı. Ayrı Connected GRC testi, genel buton yoğunluk kuralının diyagram kartlarının hesaplanmış yüksekliğini ezdiğini ortaya çıkardı. Diyagram düğümleri bu genel geometri kuralından ayrıldı; metinleri ortak kompakt ölçeği kullanmaya devam eder. Nihai revizyon testleri ve yayın kanıtı PR #491’de izlenir.

Yayın sonrası canlı tıklama kontrolü, eski giriş ekranının dekoratif pseudo katmanının tema düğmesini kapattığını gösterdi. Eski halka ve büyük filigran kaldırıldı. Enterprise Login QA, TR/EN ve masaüstü/mobil kombinasyonlarında tema düğmesine iki yönde gerçekten tıklayıp DOM ve kalıcı tercihi doğrular.
