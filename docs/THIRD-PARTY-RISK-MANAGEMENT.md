# Third-Party Risk Management 2.0

Fornost TPRM 2.0, üçüncü taraf riskini yalnız bir envanter satırı olarak değil; onboarding, due diligence, risk kararı, CAPA, yeniden değerlendirme ve çıkıştan oluşan kanıtlı bir yaşam döngüsü olarak yönetir. Mevcut `Tedarikçiler` kayıtları silinmez; eksik TPRM profilleri kapsam boşluğu olarak gösterilir ve kontrollü biçimde yeni modele alınabilir.

## Yaşam döngüsü

1. Admin veya Editor; tüzel kişilik, hizmet, kritiklik, veri sınıfı, iş/risk sahipleri, bağımsız reviewer, sözleşme bitişi, inceleme tarihi ve çıkış planıyla üçüncü tarafı oluşturur ya da mevcut kaydı kapsama alır.
2. İlk değerlendirme aynı işlemde oluşturulur. Etki, olasılık, kontrol olgunluğu ve 12 due-diligence alanı deterministik doğal/kalıntı risk üretir.
3. Atanmış risk sahibi değerlendirmeyi kanıt referansı ve SHA-256 ile bağımsız incelemeye gönderir.
4. Atanmış Admin reviewer; oluşturucu ve gönderen kişiden farklıysa tam onay, koşullu onay veya ret kararı verir.
5. Açık yüksek/kritik bulgu ya da kritik kontrol boşluğu tam onayı engeller. Koşullu onay ayrıntılı risk kabul/iyileştirme notu ve karar kanıtı gerektirir.
6. Bulgular sahip, termin, önem ve CAPA açıklamasıyla yürütülür; kapatma ayrı reviewer ve ikinci kanıt zinciri gerektirir.
7. Yeniden değerlendirme yeni bir döngü oluşturur, önceki karar sürümünü `superseded` durumuna alır ve geçmişi korur.
8. Offboarding yalnız tüm bulgular kapalıyken, atanmış bağımsız reviewer tarafından çıkış kanıtı ve SHA-256 ile tamamlanır.

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

Risk kuyruğu; TPRM dışı eski kayıtları, yüksek/kritik kalıntı riski, yaklaşan/gecikmiş incelemeleri, açık/gecikmiş CAPA'ları ve 90 gün içinde bitecek sözleşmeleri gösterir. CSV çıktısı Admin ile sınırlı, cache dışı ve formül enjeksiyonuna karşı güvenlidir. Tüm karar ve yaşam döngüsü olayları aktör, zaman ve ayrıntıyla değişmez olay tablosuna yazılır.
