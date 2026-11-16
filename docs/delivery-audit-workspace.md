# Denetim çalışma alanını sadeleştirme

16 Kasım 2026 — Kullanıcı denetimi silemiyor; denetim içindeki sekiz ayrı görünüm işi takip etmeyi zorlaştırıyor.

Teslim kapsamı: başlıkta görünür düzenleme/arşivleme/silme; silmeyi engelleyen kayıtların sayısı ve ilgili çalışma alanı; dört ana çalışma alanı; yapılacak iş filtreleri; liste/pano seçimi; madde içinde sorumlu, termin, kanıt, test ve inceleme bağlamı. Mevcut tema ve TR/EN korunur. Arşivleme portföy görünürlüğünü değiştirir, bağımsız denetim kapanışı yerine geçmez ve görevleri durdurmaz.

Kabul: boş denetim güvenli silinebilir; bağlantılı kayıtlar geçmişleriyle korunur; çakışan düzenleme üzerine yazılmaz; Viewer yazamaz; dört sekme ve madde/pano filtreleri çalışır; derin bağlantı doğru görünümü açar; kanıt/test/onay birbirine karıştırılmaz. Mevcut API ve bağımsız onay kuralları yeniden kullanılır. Tarayıcı ve ilgili regresyon sonuçları teslim sonunda kaydedilecek. Ölçülmüş kullanıcı görev süresi henüz yok.

## Teslim ve doğrulama

- Kaynak başlangıcı: `3ac52e3` (main); çalışma dalı `feat/audit-workspace-simplification`.
- Dört ana sekme; aynı filtre/sayfalamayı kullanan liste/pano; maddeye bağlı kanıt talebi ve çalışma kâğıdı; başlık ve portföyde görünür yönetim işlemleri uygulandı.
- Bağımsız kararlar mevcut sunucu iş akışlarında kalır. AI, kaynak isteyen soruyu kullanıcı incelemesi için hazırlar; otomatik kabul/onay veya kullanıcı göndermeden LLM çağrısı yapmaz.
- Arşivleme görünürlük metaverisidir; kapalı denetimi yeniden açmaz, açık görevleri veya bildirimleri durdurmaz. Yönetim değişiklikleri işlem geçmişine yazılır. Silme önizlemesi bilgilendiricidir; asıl silme bağlantıları transaction içinde tekrar doğrular.
- Eski talepler/çalışma kâğıtları denetim genelinde korunur; otomatik madde eşleştirmesi yapılmaz. Yeni bağlantılar kalıcı kayıt kimliği kullanır. Yanlış denetime bağlama ve sonradan başka denetime taşıma SQL guard ile reddedilir.
- `0102_audit_requirement_links.sql` eklemeli migration; aynı kontroller runtime başlatmasında da kuruludur. Veri sütunu veya kayıt silinmez. Güncelleme öncesi mevcut yedekleme prosedürünü uygulayın; eski sürüme dönüşte yeni madde bağlantılarını korumak için uygulama/veritabanı yedeğini birlikte değerlendirin.

| Kontrol | Sonuç |
| --- | --- |
| Tüm regresyon dosyaları | 321 dosya, başarısız dosya yok |
| Yeni yönetim/API testleri | 6 test geçti; rol/scope, kilitli denetim, arşiv/geri alma, çakışma, rollback, bağlantı koruması |
| TypeScript ve ESLint | Geçti |
| D1 migration doğrulaması | Geçti |
| Worker üretim derlemesi ve artifact doğrulaması | Geçti |
| Gerçek tarayıcı, TR/EN, dar ekran ve klavye akışı | Engelli; önizleme kaynak aktarımı otomatik onay incelemesince reddedildi. Statik tasarım/semantik inceleme tarayıcı testi yerine geçmez. |
| Canlı yayın | Yapılmadı; Sites kaynak açma servisi HTTP 500 döndürdü. |

Kalan kabul: gerçek tarayıcıda portföy → denetim → madde → talep/test → bağımsız inceleme; arşiv/geri alma ve bağlı/bağlantısız silme; TR/EN, koyu/açık tema, dar ekran ve Escape/fokus kontrolleri. Müşteri UAT yapılmadı.
