# Third-Party Risk Management 2.0

Fornost TPRM 2.0, üçüncü taraf riskini yalnız bir envanter satırı olarak değil; onboarding, due diligence, risk kararı, CAPA, yeniden değerlendirme ve çıkıştan oluşan kanıtlı bir yaşam döngüsü olarak yönetir. Mevcut `Tedarikçiler` kayıtları silinmez; profili bulunmayan kayıtlar onboarding kuyruğunda gösterilir ve kontrollü biçimde yeni modele alınabilir.

## Yaşam döngüsü

1. Admin veya Editor; tüzel kişilik, hizmet, kritiklik, veri sınıfı, iş/risk sahipleri, bağımsız reviewer, sözleşme bitişi, inceleme tarihi ve çıkış planıyla üçüncü tarafı oluşturur ya da mevcut kaydı kapsama alır.
2. İlk değerlendirme aynı işlemde oluşturulur. Etki, olasılık, kontrol olgunluğu ve 12 due-diligence alanı deterministik doğal/kalıntı risk üretir.
3. Atanmış risk sahibi değerlendirmeyi kütüphaneden seçtiği dosya sürümüyle bağımsız incelemeye gönderir.
4. Atanmış Admin reviewer; oluşturucu ve gönderen kişiden farklıysa tam onay, koşullu onay veya ret kararı verir.
5. Açık yüksek/kritik bulgu ya da kritik kontrol boşluğu tam onayı engeller. Koşullu onay ayrıntılı bir karar notu ile birlikte destekleyici belge veya açık risk kabul gerekçesi gerektirir.
6. Bulgular sahip, termin, önem ve CAPA açıklamasıyla yürütülür; kapatma ayrı reviewer ve ikinci kanıt zinciri gerektirir.
7. Yeniden değerlendirme yeni bir döngü oluşturur, önceki karar sürümünü `superseded` durumuna alır ve geçmişi korur.
8. Offboarding yalnız tüm bulgular kapalıyken, atanmış bağımsız reviewer tarafından kütüphaneden seçilen çıkış kanıtıyla tamamlanır.

## Due-diligence kapsamı

- Bilgi güvenliği programı
- Erişim ve ayrıcalık kontrolü
- Aktarımda ve depoda şifreleme
- Loglama ve izleme
- Zafiyet ve yama yönetimi
- Olay bildirim SLA'sı
- İş sürekliliği ve felaket kurtarma
- Alt yüklenici yönetişimi
- Veri iade/silme taahhüdü
- Denetim hakkı
- Veri taşınabilirliği ve exit desteği
- DPA / gizlilik eki

Olay bildirimi, veri silme, denetim hakkı ve DPA alanları kritik kontrol olarak değerlendirilir. Eksik kritik alanlar tam onayı fail-closed biçimde engeller.

## Roller ve ayrıştırma

| İşlem | Admin | Editor | Viewer |
|---|---:|---:|---:|
| Profil oluşturma/kapsama alma | Evet | Evet | Hayır |
| Değerlendirme ve bulgu oluşturma | Evet | Evet | Hayır |
| Risk sahibinin değerlendirme göndermesi | Evet | Atanmışsa | Hayır |
| Tam/koşullu onay veya ret | Atanmış bağımsız reviewer | Hayır | Hayır |
| CAPA başlatma/gönderme | Evet | Atanmışsa | Hayır |
| CAPA doğrulama ve offboarding | Atanmış bağımsız reviewer | Hayır | Hayır |
| Görüntüleme | Evet | Evet | Evet |
| CSV dışa aktarma | Evet | Hayır | Hayır |

Yüksek etkili geçişler tam onay ifadeleri kullanır. UI görünürlüğü kolaylık sağlar; gerçek RBAC, sahiplik, durum geçişi ve maker-checker kontrolleri sunucu tarafında uygulanır.

## Operasyonel göstergeler

Risk kuyruğu onboarding bekleyen kayıtları, yüksek/kritik kalıntı riski, yaklaşan/gecikmiş incelemeleri, açık/gecikmiş CAPA'ları ve 90 gün içinde bitecek sözleşmeleri gösterir. CSV çıktısı Admin ile sınırlı, cache dışı ve formül enjeksiyonuna karşı güvenlidir. Tüm karar ve yaşam döngüsü olayları aktör, zaman ve ayrıntıyla değişmez olay tablosuna yazılır.

## Bağlı kanıt ve sorumlular

İş/risk sahipleri, bağımsız Admin incelemecisi ve bulgu sahibi etkin kullanıcı dizininden seçilir; tedarikçinin dış iletişim adresi serbest metindir. Bulgu sahibi aynı kaydın incelemecisi olamaz. Gönderim, onay/koşullu onay, bulgu gönderim/doğrulama ve çıkış kararları mevcut kanıt kaydının açıkça seçilen dosya sürümüne sabitlenir. Sunucu SHA-256 ve sürüm zincirini kontrol eder; kullanıcı hash yazmaz.

Karar penceresinde güncel risk, sorumluluk ve iş bağlamını inceleyin. Kaynak değişirse taslak not ve dosya seçimi korunur; **Güncel sürümü kullan** ile yeni bağlamı kabul edip onay ifadesini yeniden girin. Yeni bir dosya yüklemek geçmiş kararı değiştirmez. **Son kararların kanıtları** ve **Kanıt Kütüphanesi → Kullanım ve değişiklik etkisi → Tedarikçi kararları** kaydedilmiş sürümleri ve ilgili işe dönüşü gösterir. [İş akışı, sınırlar ve operasyon](tprm-connected-evidence.md).

### Envanterden değerlendirmeye

Profili açılmamış tedarikçi **Onboarding Bekliyor** olarak görünür. Admin, envanterden kaydı açıp gerekçesini girerek kapsam dışı kararı verebilir veya kaydı yeniden onboarding kuyruğuna alabilir. Karar, aktör ve tarih geçmişte saklanır. Profili olan bir tedarikçinin çıkışı mevcut kanıtlı sonlandırma akışından yürütülür.

Onboarding sırasında üç sorumluyu dizinden seçin. Bağımsız incelemeci etkin bir Admin olmalıdır. Formdaki doğal ve kalıntı risk, kaydedilen değerlendirmeyle aynı yöntemle hesaplanır. Destekleyici kanıt kayıtları tedarikçiyle ilişkilendirilir. Resmî inceleme ve onayda kullanılan dosya sürümü karar anında ayrıca seçilir. Envanterdeki VEN kodu ile tedarikçiyi tanıyabilir, bağlı AST ve BIA rozetlerinden ilgili kaydı açabilirsiniz.

## Güvence belgeleri ve karar ön koşulları

Tedarikçi sahibi beş belge türü için Kanıt Kütüphanesinden bir sürüm ve geçerlilik tarihi seçer. Risk kuyruğu belge bitişini 30, sözleşme bitişini 90 gün önceden gösterir. Kritik/Tier-1 için güncel DPA ve ISO 27001 veya SOC 2/ISAE 3402 güvencesi aranır. Yenileme uyarısı geçmiş kararı korur. Etki alanı tedarikçinin varlıklarını, doğrudan ve bu varlıklar üzerinden bağlı BIA süreçlerini ve kaydedilmiş en kısa kurtarma hedeflerini gösterir.

Karar veren bağımsız Admin, atamaları, tamamlanmış puanlamayı ve geçerli destekleyici belgeyi veya açık risk kabul gerekçesini inceler. Kütüphaneden seçilen değerlendirme gönderim kanıtı da destekleyici belge olarak kullanılabilir. Sunucu karar anındaki ön koşulları, dayanakları ve kararı aynı işlemde geçmişe yazar. Eski kararlar için sonradan bir değerlendirme üretilmez.
