# Enterprise Risk Appetite & KRI Command Center

Fornost Risk İştahı ve KRI Merkezi, soyut risk toleransını ölçülebilir hedef, uyarı ve ihlal eşiklerine dönüştürür. KRI ölçümleri, ihlal aksiyonları, stres senaryoları ve yönetim kurulu paketleri aynı kanıt ve maker-checker zincirinde yönetilir.

## Risk iştahı yaşam döngüsü

Her beyan benzersiz kod, kategori, açıklama, KRI, ölçüm birimi, eşik yönü, hedef, uyarı/ihlal eşikleri, ölçüm sıklığı, geçerlilik dönemi, risk sahibi ve bağımsız reviewer içerir. Üst sınır metriklerinde `iştah ≤ uyarı < ihlal`, alt sınır metriklerinde `iştah ≥ uyarı > ihlal` zorunludur.

Taslak yalnız tam onay ifadesi ve kanıtla incelemeye gider. Atanmış Admin reviewer; oluşturan, gönderen veya risk sahibi değilse onay/red kararı verebilir. Açık KRI ihlali bulunan beyan yürürlükten kaldırılamaz.

## KRI ölçümü ve otomatik ihlal

Ölçüm dönemi, değer, kaynak referansı, açıklama ve SHA-256 kanıtı zorunludur. Ölçüm kayıtları değişmezdir ve aynı beyan/dönem sonu tekrar kaydedilemez. Motor değeri çift yönlü eşiklere göre `green`, `amber` veya `red` sınıflandırır. Kırmızı sonuçta yüksek/kritik ihlal otomatik açılır ve bir sonraki ölçüm tarihi sıklıktan deterministik hesaplanır.

İhlal, müdahale sahibi, en az 20 karakter plan ve termin ile başlatılır. Aksiyon sahibi kanıtla doğrulamaya gönderir; yalnız risk iştahının bağımsız reviewer’ı kapatabilir. Ölçümü kaydeden, aksiyon sahibi veya gönderen kişi kapanış yapamaz.

## Stres senaryoları

Onaylı beyana bağlı senaryo; ufuk, baz/stres/tahmin değerleri, güven yüzdesi, varsayımlar, tedavi planı, sahip ve bağımsız reviewer içerir. Taslak → review → verified akışı uygulanır. Doğrulama SHA-256 kanıtı ve maker-checker ayrımı gerektirir.

## Yönetim kurulu paketi

Admin, seçilen ay için aşağıdaki canlı ve üst sınırlandırılmış portföyü tek snapshot içinde mühürler:

- onaylı risk iştahı ve eşikleri,
- açık yüksek/kritik KRI ihlalleri,
- incelenen/doğrulanan stres senaryoları,
- ana Risk Assessment sicilindeki kurumsal riskler.

Alanları sıralanmış canonical JSON, SHA-256 ile özetlenir. Paketi hazırlayandan farklı atanmış Admin reviewer, kayıtlı özeti yeniden hesaplayıp doğruladıktan sonra kanıtla onaylar. Böylece sonradan değişen canlı veri eski yönetim kurulu kararının parçası gibi gösterilemez.

## Güvenlik ve denetim

- Viewer salt okunur; Editor taslak, ölçüm, plan ve senaryo oluşturabilir; yönetişim kararları Admin’e aittir.
- Kritik geçişler tam Türkçe onay ifadesiyle fail-closed çalışır.
- İstek 256 KiB, API/CSV/snapshot sorguları sabit sonuç üst sınırlarıyla korunur.
- Admin CSV formül enjeksiyonuna karşı güvenlidir ve export olayı audit izine yazılır.
- `risk_appetite_events` yalnız eklenen, uygulama tarafından güncellenmeyen veya silinmeyen olay geçmişidir.
- Drizzle migration `drizzle/0071_enterprise_risk_appetite_kri.sql`, çalışma zamanı self-heal şeması API içinde ve tipli model `db/schema.ts` içinde tutulur.
