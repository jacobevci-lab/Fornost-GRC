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
