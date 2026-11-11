# Connected GRC Relationship Intelligence

Connected GRC, Fornost içindeki risk, varlık, BIA, kontrol, kanıt, denetim, tedarikçi ve diğer operasyonel kayıtların birbirine verdiği kalıcı referansları tek görünümde gösterir.

## Zincir bütünlüğü ve remediation

İlişki güvence motoru yalnızca “en az bir bağlantı” kontrolü yapmaz. Risk için varlık veya süreç bağını; kontrol için kanıt ve framework bağlarını; kanıt için kontrol bağını; denetim için kontrol ve kanıt izini ayrı zorunlu ilişki grupları olarak ölçer. Kayıtlar tam, kısmi veya eksik olarak puanlanır. Her eksik ilişki, tamamlanması gereken doğru modüle yönlendiren aksiyon üretir.

Eksik bağlantılar sekmesi, tamamlanması gereken ilişkileri ve ilgili kaydı açan aksiyonları gösterir. Böylece ilişki sayısı ile gerçek güvence bütünlüğü birbirinden ayrılır.

## Davranış

- Serbest metin benzerliği kullanmaz; `asset`, `processLink`, `controlRef`, `riskRef`, `evidenceRef`, `vendor`, `framework(s)` ve `requirementRef` gibi tanımlı ilişki alanları üzerinden deterministik bağlantı kurar.
- İlişkileri `risk-asset`, `risk-process`, `control-evidence`, `audit-control`, `audit-risk`, `audit-evidence`, `asset-vendor` ve `control-framework` tipleriyle sınıflandırır.
- Kaynak modül ve hedef modül kuralları yanlış pozitif eşleşmeleri engeller; aynı ilişki yinelenmez.
- Kaynak veya hedef düğümden ilgili canlı modüle geçilir.
- İlk görünümde kayıt, bağlantı ve bağlantısız kayıt sayıları özetlenir. Kayıt listesi ad/kod ve modülle filtrelenir; 10 kayıtlık sayfalar halinde gezilir.
- Seçili kaydın doğrudan gelen/giden ilişkileri gösterilir; bağlantılar sekizerli açılır. Kayıt açma eylemleri mevcut odaklı navigasyonu kullanır.
- Eksik bağlantılar ve güvence işlemleri ayrı sekmelerdedir. Operasyonel iş kuyruğu ve yönetişim bileşenleri yalnız güvence sekmesi açıldığında yüklenir.
- Risk, kontrol, kanıt ve denetim kayıtları için beklenen ilişki zinciri ölçülür; güvence izlenebilirliği yüzdesi ve önceliklendirilmiş boşluk kuyruğu üretilir.
- Boşluk kartı kayıt sahibini ilgili canlı modüle götürür; değerlendirme salt okunur kalır ve otomatik veri değişikliği yapmaz.
- Hedefi bulunamayan referanslar ayrı inceleme kuyruğunda kaynak kodu, alan ve değer ile gösterilir.
- Arama ve alan filtresi istemci tarafında çalışır; veri bir AI sağlayıcısına gönderilmez.
- Dışa aktarım formül enjeksiyonuna karşı güvenli, UTF-8 CSV üretir.

Bu görünüm bir çıkarım veya otomatik karar motoru değildir. Yalnız mevcut kayıtlardaki açık ve şeması tanımlı referansları gösterir; bağlantının yönetişim anlamı kayıt sahibi tarafından doğrulanır.

## Reference integrity

Graph resolution now prefers canonical record IDs (including native IDs retained by enterprise projections), then public record codes, then unique legacy aliases. Each tier is restricted to the relationship's allowed target modules. A collision at a stronger tier cannot fall through to a weaker label match. Explicit reference lists still support multiple targets; an individual ambiguous reference creates no links and contributes no coverage or assurance credit.

The existing Gaps view distinguishes missing targets from ambiguous targets, lists candidate codes/titles, and opens the authoritative source record for correction with a unique code or ID. No records are automatically rewritten. Shared framework names that identify several requirements need explicit requirement references; the graph does not infer that every requirement is covered. This change does not migrate legacy references, enforce database foreign keys, or change permissions.

Asset and BIA/process pickers show the record name with its code and save an unambiguous code (or canonical ID on collision). Saved legacy labels remain visible, with ambiguous or unavailable values marked for review; opening and saving a form does not silently remap them.


## Bağlantı inceleme masası

Bağlantılar görünümünde bir kayıt seçin; 1–3 adımlık diyagram veya liste ile ilişkileri inceleyin. Görünüm en fazla 30 kayıt içerir; daha fazlası için başka bir kaydı merkeze alın. Etki analizi, kayıtlı ilişkilere göre üç adıma kadar inceleme yolları gösterir. Ulaşılabilirlik kesin iş etkisi değildir. BIA RTO/RPO değerleri hedeflerdir.

Eksikler sekmesi kayıt ve takip konusu sayılarını ayırır. Zorunlu bağlantılar, çözümlenemeyen referanslar, süresi geçmiş kanıtlar, gecikmiş gözden geçirmeler ve plan bağlantısı olmayan BIA kayıtları birlikte incelenir. Kaynak hatalarında sonuçlar kısmi olarak işaretlenir.

Admin ve yetkili Editor, desteklenen temel kayıt alanlarında mevcut hedefi seçip gerekçe yazarak bağlantı ekleyebilir/değiştirebilir. İsteğe bağlı bağlantı kaldırılabilir; kayıt silinmez. Zorunlu son bağlantı boşaltılamaz. Desteklenen ilişkiler: risk→varlık/BIA/kontrol, BIA→varlık, varlık→tedarikçi, kontrol→BIA, kanıt→kontrol, denetim→risk/kanıt/kontrol. Diğer ilişkiler kendi kaynak iş akışında yönetilir. Eski metin referanslarını kaynak kayıtta benzersiz ID/kod ile düzeltin.

BIA için plan bağlama yalnız mevcut taslak planın BIA referansını değiştirir. Admin veya plan sahibi Editor işlem yapabilir; onaylı/aktif planlar değiştirilemez ve bu işlem planı onaylamaz. Değişiklik ile kullanıcı/gerekçe/zaman geçmişi aynı veritabanı işlemiyle kaydedilir. Başarılı kayıt sonrası yenileme veya belirsiz ağ hatası otomatik tekrar yazma üretmez. Önce yenileyip bağlantıyı inceleyin.

Dışa aktarım mevcut görünüm kapsamını ve kısmi veri durumunu içerir. Güvence sekmesindeki mevcut kontrol sonucu, onay ve eskalasyon iş akışları korunur.
