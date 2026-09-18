# Connected GRC Relationship Intelligence

Connected GRC, Fornost içindeki risk, varlık, BIA, kontrol, kanıt, denetim, tedarikçi ve diğer operasyonel kayıtların birbirine verdiği kalıcı referansları tek görünümde gösterir.

## Davranış

- Kayıt kimliği, kodu, kontrol referansı ve anlamlı başlık alanları üzerinden deterministik bağlantı kurar.
- Aynı modül içindeki benzer metinleri ilişki saymaz; çapraz alan referanslarını gösterir.
- Kaynak veya hedef düğümden ilgili canlı modüle geçilir.
- Modül yoğunluğu, toplam düğüm, doğrulanmış bağlantı, bağlı kayıt ve bağlantısız kayıt KPI'ları hesaplanır.
- Arama ve alan filtresi istemci tarafında çalışır; veri bir AI sağlayıcısına gönderilmez.
- Dışa aktarım formül enjeksiyonuna karşı güvenli, UTF-8 CSV üretir.

Bu görünüm bir çıkarım veya otomatik karar motoru değildir. Yalnız mevcut kayıtlardaki açık referansları gösterir; bağlantının yönetişim anlamı kayıt sahibi tarafından doğrulanır.
