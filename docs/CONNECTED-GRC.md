# Connected GRC Relationship Intelligence

Connected GRC, Fornost içindeki risk, varlık, BIA, kontrol, kanıt, denetim, tedarikçi ve diğer operasyonel kayıtların birbirine verdiği kalıcı referansları tek görünümde gösterir.

## Davranış

- Serbest metin benzerliği kullanmaz; `asset`, `processLink`, `controlRef`, `riskRef`, `evidenceRef`, `vendor`, `framework(s)` ve `requirementRef` gibi tanımlı ilişki alanları üzerinden deterministik bağlantı kurar.
- İlişkileri `risk-asset`, `risk-process`, `control-evidence`, `audit-control`, `audit-risk`, `audit-evidence`, `asset-vendor` ve `control-framework` tipleriyle sınıflandırır.
- Kaynak modül ve hedef modül kuralları yanlış pozitif eşleşmeleri engeller; aynı ilişki yinelenmez.
- Kaynak veya hedef düğümden ilgili canlı modüle geçilir.
- Modül yoğunluğu, toplam düğüm, doğrulanmış bağlantı, bağlı kayıt, bağlantısız kayıt ve çözülmeyen referans KPI'ları hesaplanır.
- Risk, kontrol, kanıt ve denetim kayıtları için beklenen ilişki zinciri ölçülür; güvence izlenebilirliği yüzdesi ve önceliklendirilmiş boşluk kuyruğu üretilir.
- Boşluk kartı kayıt sahibini ilgili canlı modüle götürür; değerlendirme salt okunur kalır ve otomatik veri değişikliği yapmaz.
- Hedefi bulunamayan referanslar ayrı inceleme kuyruğunda kaynak kodu, alan ve değer ile gösterilir.
- Arama ve alan filtresi istemci tarafında çalışır; veri bir AI sağlayıcısına gönderilmez.
- Dışa aktarım formül enjeksiyonuna karşı güvenli, UTF-8 CSV üretir.

Bu görünüm bir çıkarım veya otomatik karar motoru değildir. Yalnız mevcut kayıtlardaki açık ve şeması tanımlı referansları gösterir; bağlantının yönetişim anlamı kayıt sahibi tarafından doğrulanır.
