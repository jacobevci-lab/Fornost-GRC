# Fornost GRC Kullanıcı Rehberi

[Dokümantasyon dizini](README.md) · [Ürün tanıtımı](PRODUCT-OVERVIEW.md) · [Yönetici rehberi](ADMIN-GUIDE.md)

Kapsam: 26 Ekim 2026 itibarıyla günlük kullanım. Menü/işlem görünürlüğü rolünüze, modül izinlerinize ve işteki atamanıza bağlıdır. Türkçe ve İngilizce arayüz adları gerektiğinde birlikte verilmiştir.

## 1. Giriş ve çalışma alanı

Kurumunuzun HTTPS adresini açıp hesabınızla giriş yapın. Yerel oturum varsayılan olarak girişten 30 dakika sonra sona erer; kurum yöneticisi bu süreyi değiştirebilir. Açık formu tamamlamadan oturum dolarsa ekrandaki hatayı takip edin; işlem başarılı görünmedikçe kaydedildiğini varsaymayın.

Ana Sayfa genel durumu, **Benim İşlerim / My Work** size atanmış hazırlık ve incelemeleri gösterir. Dil seçimi TR/EN'dir. Sol menü geniş/ikon/gizli görünümde kullanılabilir; küçük ekranlarda menü düğmesiyle açılır.

Eksik menü için yöneticiye başvurun. Paylaşılan bir kayıt bağlantısına sahip olmak ilgili modülü okuma yetkisi vermez.

## 2. Kayıt bulma, oluşturma ve paylaşma

### Kayıt bulma

Üst aramayı veya **Ctrl+K** komut paletini açın. **Modules** menüye geçer; **Records** sekiz çekirdek sicilde kayıt arar: risk, BIA, varlık, uyum, tedarikçi, kontrol, kanıt ve denetim gereksinimi. En az iki karakterle kod, başlık, sahip veya ilgili referansı arayın. Dosya içeriği ve bütün kurumsal geçmiş bu aramanın kapsamında değildir.

Sonuç tam kaydı açar. Çekirdek listelerde filtre/arama bağlamı aynı kullanıcı ve tarayıcı sekmesi için korunur. **Önceki görünüme dön / Return to previous view** kaynak görünüme döner; haritadan geldiyseniz arama ve seçili düğüm korunur. Çekirdek kayıtta sayfayı yenilemek seçimi korur ve mevcut erişimle kaydı yeniden doğrular; **Tüm kayıtları göster / Show all records** filtreyi açıkça temizler. Kaynak yükleme hatasında yeniden deneyin; hata mesajı “kayıt yok” sonucu değildir.

### Kayıt işlemleri

Risk, varlık, BIA, uyum, kontrol ve kanıt listelerinde **henüz kayıt yok**, **filtreye uyan kayıt yok**, **yükleniyor** ve **yüklenemedi** durumları ayrı açıklanır. Modül erişimiyle sınırlandırılmış kullanıcıların çekirdek tedarikçi listesi de aynı düzeni kullanır. Boş listede yazma yetkiniz varsa modüle uygun ilk kayıt aksiyonu bulunur. **Arama ve filtreleri temizle / Clear search and filters** yalnız açık sorguyu ve filtreleri sıfırlar; seçtiğiniz sütunları, kayıtları ve kaydettiğiniz görünümleri silmez. Kaynak hatasında **Yeniden yükle / Reload records** ile tekrar deneyin; liste doğrulanana kadar yeni kayıt, içe aktarma ve CSV işlemleri kapalıdır.

Kayıt formunun üstündeki açıklama ilgili işi ve bağlantıları özetler. Uzun formlarda **Temel alanlar / Core fields** ve **Gelişmiş alanları göster / Show advanced** kontrolü formun başındadır. Riskte başlık, sorumlu ve ilgili varlıkla başlayıp değerlendirmeyi tamamlayabilirsiniz. Formu iptal etmek kayıt oluşturmaz; Escape kapanışından sonra odak açtığınız düğmeye döner. Bildirimleri klavyeyle erişilebilir kapatma düğmesinden kapatabilirsiniz.

1. İlgili modülü açın ve yeni kayıt işlemini seçin.
2. Zorunlu alanları, sorumluyu, tarihleri ve ilişki alanlarını doldurun. Kurum verisi için yeni kayıt oluşturun; örnek kimliklerini gerçek kayıt olarak kullanmayın.
3. Kaydedin; başarı mesajı ve listede doğru kayıtla işlemi doğrulayın.
4. Düzenlemek için mevcut kaydı açın. Eşzamanlı değişiklik uyarısında güncel kaydı inceleyip tekrar deneyin; eski verinin üstüne yazmayın.
5. Çekirdek kayıt silme Admin yetkisi ister. Kurumsal yaşam döngülerindeki iptal/yeniden açma işlemleri silmeden farklıdır; kapanmış denetimler yazmaya kilitlenir.

**Tedarikçi Yönetimi → Tedarikçi Envanteri → Excel İçe Aktar** gelişmiş TPRM ekranından da erişilebilir. İçe alınan tedarikçiler envantere hemen yansır; **Kapsama al** ile ayrı onboarding ve risk değerlendirmesi başlatılır.

Risk, BIA, varlık, uyum, tedarikçi, kontrol ve denetim maddelerinde Excel içe aktarma ilk çalışma sayfasındaki `.xlsx` verisini okur: en fazla 5 MB, 100 sütun ve 1.000 dolu satır. Sütunları eşleştirin; Excel satır numaralarıyla hata listesini ve 20 satırlık sayfalar hâlindeki kayıt önizlemesini inceleyin. Eşlenmeyen sütunlar ve eşlenen alanları boş olduğu için dışarıda bırakılan satırlar sayıyla gösterilir. **Önizlemeyi doğrula** sunucuda alanları, yetkiyi, bağlantıları ve kapalı denetimleri kontrol eder; kayıt oluşturmaz. Doğrulama sonrasında gösterilen normalleştirilmiş değerleri inceleyip **İçe aktar** seçin.

Boş başlıklı dolu sütun, tekrarlanan başlık/eşleme ve sınır aşımı içe aktarmayı engeller; veri kesilmez. Çoğu alan en fazla 1.000 karakterdir; denetim maddesinin statement/guidance/assessment alanları 100.000 karaktere kadar destekler. Her kaydın serileştirilmiş toplamı ayrıca 100.000 karakter sınırına tabidir. İstek toplamı 2 MB’ı aşarsa dosyayı küçük parçalara bölün. Tarihler `YYYY-MM-DD` veya Excel’in gerçek tarih hücresi olabilir. Durum değerleri modülün saklanan değerleriyle eşleşmelidir; hatayı düzeltip yeniden önizleyin. Dosya veya eşleme değişirse önceki doğrulama geçersiz olur.

Bağlantı kesilip sonuç alınamazsa pencereyi açık tutup **Aynı işlemi yeniden dene** kullanın. Aynı kullanıcı/işlem kimliği/içerik, kaydedilmiş sonuçla yanıtlanır ve ikinci kez kayıt oluşturmaz. Pencereyi kapatıp yeni içe aktarma başlatmak yeni bir işlemdir; önce sicildeki sonucu kontrol edin. İçe aktarma mevcut kayıtları güncellemez, birleştirmez veya içerik bazında tekilleştirmez. Kanıt dosyası olarak XLSX yükleme ayrı bir işlemdir. Ayrıntı: [Güvenilir kayıt içe aktarma](register-import.md).

### Bağlantı paylaşma

Kayıt detayında veya tam kayıt odak alanında **Kayıt bağlantısını kopyala / Copy record link** kullanın. Bu işlem sekiz çekirdek sicil, seçili tedarikçi çalışma alanı, denetim talebi, çalışma kâğıdı ve kaydedilmiş denetim görevinde bulunur. Görev bağlantısı ilgili denetimin Plan ve kapsam sekmesinde tam görevi açar. Alıcı giriş yaptıktan sonra kendi yetkisiyle tam hedefe gider. Pano engellenirse seçilebilir bağlantı alanını kullanın. Silinmiş/erişilemeyen hedef yerine benzer isimli başka kayıt açılmaz. [Ayrıntılar](record-links.md).

## 3. Benim İşlerim

Sahibi veya reviewer'ı olduğunuz işleri ve bekleyen adımı inceleyin. Bir işi açmak ilgili modüle ve tam kayda götürür; karar aynı modülde verilir. Bir talep sunulduğunda aktif iş reviewer'a geçebilir; sahibin ekranında başkasını bekleyen iş olarak kalabilir.

Çalışma kâğıdı taslakları sahibine, sunulan kâğıtlar reviewer'a görünür. Onay/iptal tamamlanan işe, yeniden açma tekrar hazırlığa dönüşür. Bu işler ayrı kopya görevler değil, kaynak kayıtların mevcut durumudur. Kaynak eksikliği uyarısı varken listenin bütün işleri içerdiğini varsaymayın.

## 4. Risk, kontrol ve kanıtla çalışma

Risk Assessment içinde riskin kapsamını, sahibini ve değerlendirmesini kaydedin; mevcut varlık/BIA/kontrol referanslarını ilgili alanlarda bağlayın. Risk İştahı ve KRI alanında ölçümleri ve eşik ihlallerini, İş Sürekliliği'nde BIA bağlantılı hedefleri ve tatbikatları takip edin.

Kontrollerde yaşam döngüsü ile uygulama etkinliği ayrı durumlardır. Kontrolü ilgili gereksinim ve kanıtla bağlayın; boşluk veya bulguyu ilgili aksiyon/CAPA akışında takip edin. Bağlantılı GRC eksik referansları incelemek için kullanılır; ilişki bulunması tek başına kontrol etkinliği kanıtı değildir.

### Kanıt yükleme ve sürüm

1. **Kanıtlar / Evidence** alanında kaydı ve dosyayı oluşturun; ilgili kontrol/denetim bağlamını belirtin.
2. Dosya başına en fazla 10 MiB yükleyin. Desteklenenler: PDF, PNG/JPEG/WebP, UTF-8 CSV/TSV/TXT/LOG/JSON ve doğrulamadan geçen DOCX/XLSX.
3. Kanıt detayında dosyayı inceleyin. PDF/görsel ve desteklenen metin türleri önizlenebilir; metin önizlemesi uzun içerikte ilk 120.000 karakterle sınırlıdır. DOCX/XLSX için orijinali indirin.
4. Değişen dosyayı yeni sürüm olarak yükleyin. Yeni sürüm önceki onayı devralmaz; inceleme bekler.
5. Kanıtın tarih, dönem, kapsam ve kabul ölçütünü sağladığını reviewer olarak ayrıca değerlendirin.

HTML/SVG, makrolu Office, eski DOC/XLS ve genel ZIP desteklenmez. Yapısal Office kontrolü kötü amaçlı yazılım taraması değildir; indirilen dosyada kurum politikasını uygulayın. Önceden kabul edilmiş talep, sonradan yüklenen sürüme otomatik geçmez. [Format ve sürüm kuralları](EVIDENCE-DOCUMENT-FORMATS.md).

## 5. Denetimi baştan sona yürütme

### Plan ve gereksinimler

**Denetim Yönetimi** içinden denetimi açın. Amaç, kapsam, denetim sorumlusu ve diğer plan alanlarını kaydedin; doğru gereksinim kayıtlarını seçin/oluşturun. Kaydedilmemiş form değişikliği rapor/kapanış paketine girmez. Katalog başlığı veya hazırlık göstergesi otomatik uygunluk kararı değildir.

### Tarihli görev ve kilometre taşı

**Plan ve kapsam → Görevler ve kilometre taşları** altında başlık, beklenen çıktı, sorumlu, hedef tarih ve saat dilimi girin. Kayıt Benim İşlerim'e doğrudan yansır. Editor kendi işini oluşturur/yönetir; Admin farklı aktif denetim yazarına atayabilir. Başlatma, tamamlama, iptal ve yeniden açma gerekçe ister; tamamlanmış iş düzenlenmeden önce yeniden açılır. İncelemeci atanmamış görevleri sorumlu veya Admin doğrudan tamamlayabilir. Eski plan notları korunur ve otomatik göreve dönüştürülmez. Görev bazında E-posta hatırlatmalarını aç seçeneği kullanılabilir; varsayılan kapalıdır.

Admin göreve farklı bir **Görev incelemecisi** ve **Görev inceleme tarihi** atayabilir. Böyle görevlerde sorumlu gerekçeyle **İncelemeye gönder** seçer. İncelemede içerik kilitlidir; atanan kişi **Onayla ve tamamla** veya **Düzeltme için geri gönder** kullanır. Sorumlu ve gönderimi yapan kendi işini onaylayamaz. Geri gönderilen görev düzenlenip tekrar sunulur; yeniden açılan görev yeni onay gerektirir. Benim İşlerim ve açık e-posta hatırlatmaları hazırlıkta sorumlu/tamamlanma tarihini, incelemede incelemeci/inceleme tarihini izler. [Ayrıntılı akış](audit-milestones.md#independent-milestone-review).

Açık görevler bütün-denetim kapanışını engeller; tamamlayın veya gerekçeyle iptal edin. Denetim başına iptaller dahil 100 görev sınırı vardır. [Görev ayrıntıları](audit-milestones.md).

### Kanıt talebi: hazırla → başlat → sun → incele

1. **Talepler ve inceleme / Requests and review** bölümünde başlık, kabul ölçütü, sahip, farklı reviewer, teslim/review tarihleri ve gerekiyorsa kanıt dönemini girin. İki atama da aktif ve uygun erişimli olmalıdır.
2. Taslağı kaydedin. Taslaklar henüz Benim İşlerim'e veya bildirimlere çıkmaz.
3. İş planını başlatırken tam talep listesini, atamaları, tarihleri ve saat dilimini önizlemede kontrol edin. Eski önizleme uyarısında güncel listeyi yeniden inceleyin.
4. Atanmış sahip olarak 1–10 mevcut kanıt sürümünü seçip sunun. Talep belirli sürümlere sabitlenir.
5. Atanmış bağımsız reviewer olarak dosyaları ve ölçütleri inceleyin. Kabul edin veya gerekçe ve yeni teslim/review tarihleriyle geri gönderin. Başka Admin sizin yerinize kabul edemez.
6. Geri dönen işte sahibi düzeltip tekrar sunar. Sunulmuş talebin ölçüt/atama değişikliği eski incelemeyi geçersiz kılar ve yeniden sunum gerektirir.

Başlamış denetime yeni talep eklerseniz önce sessiz taslak olur; **Review additions** üzerinden eklemeleri ve gerekçeyi inceleyip etkinleştirin. Kabul edilmiş eski talepler yeniden başlatılmaz. Hatırlatma takvimi denetim bazında ayarlanır; e-posta gelmemesi görev tarihinin ertelendiği anlamına gelmez.

### Çalışma kâğıdı ve örnekleme

İsteğe bağlı **Hazırlama termini**, **İnceleme termini** ve **Termin saat dilimi** ile çalışma kâğıdını planlayabilirsiniz. İki tarihi birlikte girin; inceleme tarihi hazırlamadan önce olamaz. İşlerim taslakta hazırlama, gönderimde inceleme terminini izler. İade/geri çekme/yeniden açma hazırlama tarihine döner; tarihler otomatik ötelenmez. Onay/iptalde aktif termin kalkar, kayıt ve geçmişte iki tarih korunur. Hesaplama seçili saat diliminde gün sonuna göredir. E-posta için taslakta **E-posta hatırlatmaları** seçeneğini ayrıca açın; iki termin gereklidir. Hazırlamada sorumluya, incelemede inceleyene bildirim gider. Denetimin hatırlatma takvimi, tatilleri ve varsa eskalasyon alıcısı kullanılır. Onay/iptalde bildirim durur. Mevcut kayıtlarda kapalıdır; aynı sürüm/aşama için her gün tekrar gönderilmez. Kayıt veya takvim değişirse yeni bildirim oluşabilir. E-posta örneklem içeriğini içermez; oturum gerektiren çalışma kâğıdı bağlantısını kullanır.


**Workpapers** sekmesinde amaç, test prosedürü, popülasyon/kaynak, seçim yaklaşımı/gerekçesi, sahip ve farklı reviewer girin. En fazla 100 test birimini referans, sonuç, not ve sabitlenmiş kanıt sürümüyle kaydedin. Sonuç ve kanıtları tamamlayıp sahip olarak incelemeye sunun. Reviewer onaylar veya geri gönderir; içeriği daha önce düzenleyen kişi sonradan reviewer yapılarak aynı kâğıdı onaylayamaz.

Tam sayım seçilmişse bütün popülasyon temsil edilmelidir; 100'ü aşan popülasyon bu sınır içinde tamamlanmış sayım olarak gösterilemez. CSV evreninden tekrarlanabilir rastgele seçim aşağıda açıklanmıştır; güven aralığı ve istatistiksel örneklem büyüklüğü hesaplanmaz. Onaylı istisna için **İstisnalardan CAPA → CAPA oluştur** yolunu kullanın. Kök neden, aksiyon planı, sorumlu, sorumludan ve aktarımı yapandan farklı Admin doğrulayıcı, termin ve gerekçeyi girip önizleyin; **Onayla ve CAPA oluştur** açık CAPA kaydı oluşturur. Kaynak örnek/kanıt sürümü korunur; aynı örnek tekrar aktarılamaz. CAPA detayından kaynak çalışma kâğıdına dönebilirsiniz. Bu işlem tam erişimli Admin veya atanmış Editor sorumlu/inceleyen içindir. Onaylı kâğıdı değiştirmek için gerekçeli yeniden açma gerekir. [Çalışma kâğıdı rehberi](audit-workpapers.md).

### Üç ayrı tamamlanma kavramı

| İşlem | Anlamı |
| --- | --- |
| Kanıt talebini kabul | Atanmış reviewer'ın belirli sürümler ve talep ölçütleri için verdiği karar |
| Talep iş planını kapat | Bütün talepler kabul/iptal durumunda; taslak ekleme yok; gerekçeli anlık görüntü korunur |
| Bütün denetimi kapat | Ayrı Admin hazırlayan/reviewer akışıyla plan, gereksinim, talep, çalışma kâğıdı ve doğrudan bağlı CAPA kapsamı onaylanır |

Bütün-denetim kapanışında tamamlanmamış gereksinim, açık talep planı veya taslak/review aşamasındaki çalışma kâğıdı engel oluşturur. Açık bağlı bulguların sorumlu, geçerli tarih ve takip planı gerekir; bu bulgular kapanmış sayılmaz. Onay sonrasında denetim kaynaklarında yazma kilidi uygulanır. Admin gerekçeyle yeniden açabilir; eski paket ve kararlar korunur. Talep planı ayrıca kapalı kalabilir. [Kapanış rehberi](audit-closure.md).

## 6. Bulgular ve diğer iş akışları

| Alan | Kullanıcının izleyeceği iş |
| --- | --- |
| Bulgular ve CAPA | Doğru kaynağa bağla, sahip/son tarih ve kök nedeni kaydet, düzeltici/önleyici aksiyonu kanıtla, bağımsız kapanışa sun. Risk kabulü kapanışla aynı değildir. |
| Tedarikçiler | Sicili oluştur, değerlendirme/due diligence ve bulguları tamamla, atanmış reviewer kararını izle; offboarding kanıtlarını kaydet. |
| Politika Merkezi | Sürümü incelemeye sun, onaylı sürümü yayınla; sana atanmış attestation'ı doğru sürüm için tamamla. |
| Regülasyon Merkezi | Değişikliği triajla, etkilediği kayıtları bağla, sorumlu aksiyonları ve kanıtları tamamla. |
| Güvenlik Olayları | Triaj, müdahale, recovery, bildirim değerlendirmesi ve RCA aşamalarını kendi koşullarıyla ilerlet. |
| İş Sürekliliği | BIA hedeflerine bağlı plan/tatbikatı kaydet; başarısız veya hedef dışı sonuçların iyileştirme açıklarını takip et. |
| AI Yönetişimi | Modeli ve kullanım bağlamını kaydet; risk/değerlendirme, değişiklik, izleme, istisna ve release kararlarını ilgili akışta tamamla. |

Bu kurumsal alanların ayrıntılı belgeleri [dokümantasyon dizinindedir](README.md). Bazıları tam çalışma alanı gerektirir; seçili çekirdek modül erişimi bunları açmaz.

## 7. Rapor alma

**Raporlar** ekranında kapsam ve filtreleri seçin, veri/eksiklik uyarılarını kontrol edin. **PDF Raporu** doğrudan indirilebilir PDF üretir; **Dışa aktar** altında HTML, CSV ve Excel seçenekleri bulunur. Önizleme sayfası ile dışa aktarma kapsamını karıştırmayın; ekrandaki kapsam açıklamasını kontrol edin.

**Genel GRC güvencesi · ayrı kapsam** bölümünü açarak genel güvence değerlendirmesini, kaynak durumunu ve yeniden değerlendirme aksiyonunu görebilirsiniz. **Genel Güvence Paketi** bu bölümden indirilir; değerlendirme tamamlanmamışsa indirme kapalı kalır ve nedeni yanında açıklanır. Bu pakete yukarıdaki rapor filtreleri ve CAPA kapsamı uygulanmaz.

Denetimin **Audit status reports** bölümü ayrı, Admin'e özel bir kaydedilmiş durum raporudur. Başlık, hazırlayan özeti ve sınırlamaları kaydedin; kaynak değişmişse önizlemeyi yenileyin. Kaydedilmiş rapor HTML/PDF/CSV/JSON olarak alınır ve daha sonraki kaynak düzenlemesi eski raporu değiştirmez. Rapor dosya içeriklerini paketlemez; durum raporu bağımsız denetim kapanış onayı değildir. [Rapor kapsamı](audit-status-reports.md).

## 8. Ask Fornost kullanımı

Soruyu ilgili kayıt/iş bağlamıyla sorun; yanıtın kaynaklarını açıp doğrulayın. Sağlayıcı veya özellik yönetici tarafından etkinleştirilmemişse bu durumu yöneticiyle çözün. AI taslağını doğrudan onay saymayın; değişiklik ve karar için mevcut inceleme akışını kullanın. Kısıtlı hesap, izin verilmeyen modülün verisine AI üzerinden de erişemez.

## 9. Bir işlem ilerlemiyorsa

- **Yetki veya atama:** doğru hesapla giriş yaptığınızı ve o adımın sahibi/reviewer'ı olduğunuzu kontrol edin.
- **Eşzamanlı değişiklik:** güncel kaydı/önizlemeyi yeniden okuyun; korunan taslağınızı karşılaştırın.
- **Kapalı denetim:** Admin'in gerekçeli yeniden açma işlemi gerekir; yeni kayıtla kilidi dolanmaya çalışmayın.
- **Eksik kaynak veya hata:** yeniden deneyin; eski ekrandaki sayıları güncel kabul etmeyin.
- **Dosya reddi:** boyut ve desteklenen formatı kontrol edin; Office dosyasındaki desteklenmeyen nesneleri kaldırın veya PDF kullanın.

Yöneticiye modül, kayıt kodu, işlem saati ve ekrandaki hata metnini iletin. Parola, token veya gereksiz hassas kanıt içeriği paylaşmayın.

## Personal saved register views

Open **Saved views** below the toolbar in Risk, BIA, Assets, Compliance, Controls, Evidence or an audit’s Requirements and tests tab. Set the search, filters and columns, enter a name and save. Select a view and Apply to reuse it against current records. Rename, replace or delete it without changing business records. Up to 10 views per user/module are saved in this browser, not synchronized between devices. See [Saved register views](saved-register-views.md).

**Hesap ve ortak görünümler / Account and team views** aynı listelerde ve Benim İşlerim'de bulunur. **Kişisel hesabım** seçeneğiyle modül başına 20 görünümü farklı cihazlardan kullanabilirsiniz. **Ortak görünümler** yöneticinin yayınladığı, mevcut modül yetkilerinizle kullanılabilen görünümlerdir. Arama/filtre/sütunları ayarlayın, ad verin, **Yeni kaydı önizle** ile ölçütleri inceleyin ve **Görünümü kaydet** seçin. Seçili görünümü uygulamak güncel kayıtları kullanır; Benim/Organizasyon kapsamını ve açık denetimi korur. Güncelleme, ad değiştirme ve kaldırma da önizleme ister. Çakışma veya bağlantı hatasında taslağınız korunur; yenileyip kaydın durumunu kontrol edin. Eski tarayıcı görünümünü önce uygulayıp ardından hesabınıza açıkça kaydedebilirsiniz. Ortak görünümde **Sürüm geçmişini yükle** ile değiştireni, gerekçeyi ve önceki ölçütleri inceleyin. Admin bir eski sürümü seçip gerekçe girerek **Geri yüklemeyi önizle** ve **Sürümü geri yüklemeyi onayla** adımlarını kullanabilir. Bu işlem ortak tanımı yeni sürüm olarak kaydeder; açık filtreleri değiştirmez. Kullanmak için ayrıca **Hesap görünümünü uygula** seçin. [Kullanım ve sınırlar](account-team-views.md).

### Entegrasyon ve kanıt kaynağı yükleme hataları

İş Akışı Entegrasyonları ekranındaki genel görünüm ve Kanıt Otomasyonu kaynak listesi, yanıt veya JSON içeriği 10 saniyede tamamlanmazsa yüklemeyi sonlandırır. Alınamayan bilgi, boş veya sağlıklı bir sonuç gibi gösterilmez. Genel görünümde **Entegrasyonları yenile / Refresh integrations**, kaynak listesinde **Yeniden dene / Retry** ile tekrar okuyabilirsiniz. Başka ekrana geçtiğinizde bu okumalar iptal edilir; geç gelen eski yanıt yeni görünümü değiştirmez. Bu süre sınırı yalnızca bu ekranların veri okumaları içindir; kaynak çalıştırma veya kaydetme işlemini otomatik tekrar etmez.

### Policy Center load recovery

If policy data cannot be loaded, Policy Center shows an explicit error and **Retry**. The data read times out after 10 seconds, including an incomplete response body. Until a verified response arrives, policy counts and actions are unavailable rather than showing an empty register. Navigating away cancels the read; late responses cannot overwrite newer data. Retry only reloads data and does not repeat a policy decision or write.

### Import workpaper samples

In Audit Management → audit → Workpapers, create or edit a draft and open **Import samples from CSV**. Download the `reference,note` template or paste/upload your selected samples, inspect the preview, then choose **Add samples to draft**. Duplicates, malformed rows and population/sample limit violations block the whole import. Imported samples start as Pending without evidence; complete testing and evidence selection, then Save draft. See [Audit workpapers](audit-workpapers.md#bulk-sample-entry).

### Filter My Work by module

**Süreklilik / Continuity** seçimi artık plan onayı/etkinleştirme ve gözden geçirme sorumluluklarını, planlı tatbikatları ve iyileştirme açıklarını da içerir. Satır ilgili kaydı doğrudan açar; işlemi mevcut kaynak ekranında tamamlayın, ardından İşlerim'i yenileyin. Onaylı plan etkinleştirilene kadar açık kalır; iptal edilen tatbikat açık iş sayılmaz. Son 30 gün hesabı gerçek kapanış/iptal tarihini kullanır. [Sorumlular, tarihler ve kapsam sınırları](continuity-my-work.md).

Use **Work queue module** in My Work to focus on Risk, Audit, Evidence, Policy or another module represented in your current authorized personal/organization scope. Summary cards, status-filter counts, completed work, pagination and the downloaded CSV use that module selection. Search and due/status filters continue to apply. The CSV includes a canonical `module_filter` column.

**Clear module filter** restores all modules without changing personal/organization scope or search. If the selected module has no work after a scope change or refresh, the filter remains explicit and the list stays empty rather than silently expanding. This filter does not grant access or change the separate assurance-signal panel's scope.

### Save a recurring My Work view

In **My Work → Saved views**, name and save your current search, module and work-status filter (for example, “Overdue evidence”). Select it and choose **Apply view** to use it again against current authorized work. Applying returns to the first page and keeps your current **Mine/Organization** scope. Counts and CSV use the applied criteria. Views are not applied automatically after reload.

You can rename, replace or delete up to ten personal views in this browser. Deleting a view does not delete work. These are browser-local preferences, not shared/server views or evidence snapshots; they do not save records, deadlines or approvals. A supported module with no current work stays selected. Unsupported criteria show an error instead of widening the queue.

### Reuse audit plan and milestone templates

Open **Audit Management → audit → Plan and scope → Templates** for plan starters. A second Templates panel within an editable task provides milestone starters. Preview each proposed field beside your draft; filled fields are not preselected. Apply only the fields you choose, then use **Save plan** or **Save milestone** to persist through the existing authorized workflow. People, dates, states and approvals are never copied.

Plans include internal-control and remediation-follow-up starters; milestones include scope, evidence preparation, fieldwork and closure preparation. These are editable prompts, not a claim of compliance or automatic audit completion. You can name and download your customized text as JSON, then paste it into a matching plan/task template panel for preview and reuse. Portable JSON does not create a library record; centrally shared definitions are available separately in Shared template library. Plan templates contain narrative text only; milestone templates contain title and expected output only. Existing task limits, role checks, revision conflicts and closure locks still apply.

### Sequence audit tasks with prerequisites

In **Plan and scope → Tasks and milestones**, select prerequisite tasks and save with a reason. Only tasks in the same audit are available, up to 20 per task. The selected tasks must be completed before you can start or complete the dependent task; cancellation does not satisfy a prerequisite. My Work shows blocked task counts and the Waiting filter includes your blocked tasks.

Cycles are rejected. A prerequisite cannot be reopened while dependent work is in progress or completed. Resolve or reopen that dependent work first. Dependencies do not reschedule deadlines, send emails or certify evidence approval. Saved dependencies appear in task history and audit snapshots.


### Repeat an audit task for the next period

In **Audit → Plan and scope → Tasks and milestones**, select a recurrence (weekly, monthly, quarterly, or yearly) and save. Complete the task, enter an action reason, then use **Create next occurrence**; the button shows the calculated due date. The new Planned task appears in My Work with its own deadline. Use **Previous occurrence** / **Next occurrence** to move between periods.

Creation is explicit and happens once per completed task. No next-period tasks are created in the background. Email reminders follow the task setting. The next period is based on the previous due date; month-end dates retain their original day where possible. Only the previous task is carried as a prerequisite; review other prerequisites for the new period. All periods count toward the 100-task audit limit. Set recurrence to One-off on an editable task to stop further periods. A cancelled successor can be reopened; repeatedly clicking the original never creates a replacement duplicate.


### Denetim görevi e-posta hatırlatmaları

**Denetim → Plan ve kapsam → Görevler** içinde **E-posta hatırlatmalarını aç** seçeneğini işaretleyip kaydedin. Ön hatırlatma, son gün, gecikme ve isteğe bağlı eskalasyon tarihleri ekranda gösterilir. Takvim aynı denetimin **Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon** bölümünden yönetilir; görevin saat dilimi kullanılır. E-posta taşıması **Ayarlar → E-posta ve Bildirimler** altında yapılandırılır.

Mevcut görevlerde seçenek kapalıdır. Görev kapanınca veya hatırlatma kapatılınca bekleyen bildirim geri çekilir. Görev/profil değişikliği yeni bildirim oluşturabilir; her gün tekrarlanan e-posta gönderilmez. E-posta teslimi görevin tamamlandığı anlamına gelmez. Yeni tekrar dönemine hatırlatma tercihi aktarılır; kendi tarihi gelene kadar bildirim üretilmez.

### Denetimler arasında takvim aktarımı

**Denetim → Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon → Hatırlatma profilini düzenle → Takvimi başka denetimde kullan** bölümünden taslak takvimi JSON olarak indirebilirsiniz. Dosya yalnızca gün hesabını, çalışma günlerini ve tatil tarihlerini içerir; kişi, denetim kimliği, bildirim eşiği veya eskalasyon alıcısı içermez.

Başka denetimde dosyayı seçin veya JSON içeriğini yapıştırıp önizleyin. **Takvimi taslağa uygula**, bu üç alanı değiştirir; tatilleri birleştirmez. Hedef denetimin bildirim eşikleri, eskalasyon sorumlusu ve terminleri korunur. Son olarak **Hatırlatma profilini kaydet** ile kalıcı hale getirin. Kaydetmeden vazgeçerseniz kayıt değişmez. Kaydetmede mevcut yetki, kapalı denetim ve eşzamanlı değişiklik kontrolleri uygulanır; bekleyen bildirimler yeniden değerlendirilir. Aktarım bir kopyadır: kaynak takvim daha sonra değişirse hedef denetimler otomatik güncellenmez. En fazla 16 KB dosya ve 366 benzersiz geçerli tatil tarihi desteklenir; dosya aktarımıdır. Ortak takvim kütüphanesi aşağıda açıklanır; otomatik resmi tatil servisi yoktur.


### Denetim görev paketini toplu oluşturma

**Denetim → Plan ve kapsam → Görevler ve kilometre taşları → Görev paketi oluştur** altında başlangıç paketini hazırlayın. Kapsam, kanıt hazırlığı, saha çalışması ve kapanış görevlerinden gerekenleri seçin; metinleri, sorumluyu, saat dilimini ve her hedef tarihi düzenleyin. İsterseniz seçili görevleri sırayla birbirine bağlayın. **Görev paketini önizle** henüz kayıt oluşturmaz; **Tüm görevleri kaydet** seçili görevleri birlikte kaydeder. Görevler Benim İşlerim’e yansır. Tekil görev taslağınız varsa önce kaydedin veya bırakın.

Tarihler otomatik atanmaz; hatırlatmalar ve tekrar başlangıçta kapalıdır. Hata veya bağlantı kesintisinde taslak korunur; yeni paket hazırlamadan önce listeyi yeniden yükleyip sonucu kontrol edin. Denetim başına iptaller dahil 100 görev sınırı ve mevcut yetkiler uygulanır.


### Ortak denetim şablonlarını kullanma

**Denetim → Plan ve kapsam** altında plan veya tekil görev için **Şablonlar → Ortak şablon kütüphanesi**, toplu görevler için **Görev paketi oluştur → Ortak şablon kütüphanesi** bölümünü açın. Kurum şablonunu arayın, sürümünü ve içeriğini inceleyip **Bu şablonu taslak önizlemesine aktar** seçeneğini kullanın. Plan/görev metninde uygulanacak alanları seçin; paket için **Ortak paketi taslağa uygula** ile görev listesini alın. Asıl denetim kaydı ancak kendi Kaydet düğmesine bastığınızda değişir.

Ortak paket kişi veya tarih taşımaz. Sorumlu ve saat diliminizi kontrol edin, her görev tarihini seçin. **Pakete görev ekle**, **Yukarı/Aşağı taşı** ve **Taslak görevini çıkar** seçenekleriyle en fazla 12 görevi düzenleyebilirsiniz. Şablon daha sonra değişirse sizin taslağınız veya kaydınız otomatik değişmez. Eski sürümler ve arşivlenenler yalnız inceleme içindir. Şablon yayınlama/sürümleme/arşivleme yalnız Admin'e açıktır. [Ayrıntılı iş akışı](audit-template-library.md).


### Sürümlü ortak takvimler

**Denetim → Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon → Hatırlatma profilini düzenle → Ortak takvim kütüphanesi** yolunu kullanın. Güncel takvimi seçin, **Takvim değişikliklerini önizle** ile çalışma günlerini ve eklenecek/kaldırılacak tatilleri karşılaştırın. **Ortak takvimi taslağa uygula**, ardından **Hatırlatma profilini kaydet** ile denetime bağlayın. Bildirim eşikleri, eskalasyon alıcısı, saat dilimleri ve kayıtların terminleri korunur.

Denetim kullanılan takvim adını ve sürümünü gösterir. **Takvim güncellemelerini kontrol et** yeni sürümü önizlemeye getirir; kütüphane güncellemeleri denetimlere otomatik yayılmaz. Arşivlenen kaynağın önceden kaydedilmiş sürümü çalışmaya devam eder. **Yerel takvim olarak devam et**, takvim alanlarını elle düzenlemek veya JSON uygulamak kaynak bağlantısını taslakta kaldırır; kalıcı olması için kaydedin. Vazgeçmek kayıtlı profili korur. Eşzamanlı kaynak değişikliğinde taslak kaybolmaz; güncel sürümü tekrar kontrol edin.

Yalnız Admin ortak takvim yayımlar, sürümler, arşivler veya yeniden etkinleştirir. Yayımlama ekrandaki taslak gün hesabı, çalışma günleri ve tatilleri kullanır; takvim adı ve gerekçe girip önizleyin, sonra **Kütüphane değişikliğini kaydet** seçin. En fazla 200 takvim (arşivler dahil), takvim başına 366 tatil tarihi desteklenir. Son 50 sürüm listelenir; eski sürümler saklanır. Otomatik tatil servisi, toplu otomatik yayılım ve takvime özel ayrı yönetici ataması bu kapsamda yoktur. [Veri ve yetki sözleşmesi](audit-reminder-profiles.md#shared-organization-calendars).


### Terminleri iş gününe taşıma

Denetimin **Talepler ve inceleme** bölümünde iş günü takvimini kaydedin. **Plan ve kapsam → Görevler** veya düzenlenebilir **Çalışma kâğıdı** içinde tarihleri girip **İş günü tarihlerini önizle** seçin. Her tarih aynı ya da sonraki çalışma gününe taşınır; hazırlama ve inceleme aynı güne gelebilir. Eski/yeni tarihleri inceleyin, gerekçe girin, **Tarihleri taslağa uygula** ve ardından normal kaydet düğmesini kullanın. **Tarih önerisini geri al** önceki taslak tarihlerini getirir. Önizleme ve uygulama kayıt yapmaz.

Takvim eşzamanlı değişirse taslak korunur. Görevde **Takvimi yenile (taslağı koru)**, çalışma kâğıdında **Yeniden dene (taslağı koru)** kullanın; eski öneriyi geri alıp yeni önizleme oluşturun. İnceleme tarihini değiştiren görev önerisini yalnız Admin uygulayabilir. İşlerim kaydedilen terminleri kullanır; eski/yeni tarihler ve takvim sürümü ilgili kaydetme işleminin geçmişinde bulunur. [Kapsam ve örnekler](audit-deadline-planning.md).


### Kanıt talebi ve düzeltme dönüşü için iş günü planlama

**Talepler ve inceleme → Talep ekle / Düzenle** içinde teslim ve inceleme tarihlerini girin; **İş günü tarihlerini önizle → gerekçe → Tarihleri taslağa uygula → Talebi kaydet** akışını kullanın. Kanıt dönemi ve atamalar değişmez. Taslak talepler başlatılana/etkinleştirilene kadar bildirim veya İşlerim kaydı oluşturmaz. Başlatmadan önce UTC gösterilir; etkin iş planının saat dilimi başlangıç onayında seçilir.

Atanan bağımsız inceleyen, **Yeni teslim / Yeni inceleme sonu** tarihlerini aynı şekilde planlayıp ayrı karar gerekçesiyle **Düzeltme iste** seçebilir. Takvim değişmişse **Takvimi yenile (taslağı koru)**, ardından **Tarih önerisini geri al** ve yeniden önizleme adımlarını kullanın. Başlık, diğer alanlar ve karar gerekçesi korunur. Kayıt da değişmişse güncel kaydı yeniden yükleyip incelemek gerekir. **İşlem geçmişi** önceki/sonraki tarihleri, gerekçeyi ve kullanılan takvim sürümünü gösterir. İncelemedeki talebi düzenlemek mevcut incelemeyi durdurur ve yeniden kanıt sunulmasını gerektirir.

### CSV evreninden rastgele örnek seçimi

Denetim → **Çalışma kâğıtları → Taslağı düzenle / Yeni çalışma kâğıdı → Seçim yöntemi: Rastgele örneklem** yolunu kullanın. Tam evreni `reference,note` CSV’siyle yükleyin (en fazla 5000 satır, 256 KiB); 1–100 adet ve seçim gerekçesi girin. Boş anahtar otomatik üretilir; aynı CSV ve anahtar aynı sonucu verir. **Rastgele seçimi önizle** kayıt yazmaz. **Taslak örneklerini bu seçimle değiştir** mevcut örneklerin sonuç/kanıtlarını değiştirir; yeni örnekler Bekliyor olarak gelir. Test ve kanıtları tamamlayıp **Taslağı kaydet** deyin; sunucu seçimi yeniden doğrular. Önizlemeyi değiştirmek uygulanmış taslağı kendiliğinden değiştirmez.

**Rastgele seçim kaydı** bölümünden anahtar, evren özeti ve gerekçeyi indirin; özgün CSV’yi ayrıca koruyun. Referansları elle değiştirmek için Yargısal yönteme geçin. Kayıtlı seçimi kontrol etmek için taslağı açıp özgün CSV’yi yükleyin; kayıtlı anahtar/adetle önizleme eşleşmeyi gösterir. Bağımsız inceleyen seçim kaydını ve test kanıtlarını birlikte görür. Güven düzeyi hesaplanmaz. [Ayrıntılı iş akışı](audit-workpapers.md#reproducible-random-selection).

## Kanıt kullanımını ve yeni sürümün etkisini inceleme

**Kanıt Kütüphanesi → Kullanım ve değişiklik etkisi** alanında kanıtı seçin. Kontrol/uyum bağlantıları, denetim maddeleri, talepler, çalışma kâğıtları, CAPA referansları ve süreklilik/regülasyon kararlarında kullanılan kanıtlar aynı listede görünür. **Açık işlerde incelenecek** filtresi önceki sürüme bağlı veya sürümü doğrulanamayan açık talepleri/çalışma kâğıtlarını gösterir. **Kaydı aç** ile doğru işe gidip gerekli yeniden sunma/inceleme kararını verin. Yeni sürüm, onaylı işin sabit kanıtını veya kararını değiştirmez.

**Kaynak türü** ile süreklilik veya regülasyon kararlarını seçebilir, **Korunan geçmiş** ile önceki kullanımları inceleyebilirsiniz. Karar türü, karar veren kişi ve zamanı ile sabit dosya sürümü gösterilir; üstteki durum kaynak kaydın bugünkü durumudur. Geçmiş karar güncel onay anlamına gelmez. **Kaydı aç**, normal liste sınırı dışında kalan eski tatbikat, açık veya etkiyi de doğrudan bulur. Kaynak silinmişse karar kanıtı görünür kalır ve bağlantı kapatılır.

**Kullanımı yenile** güncel durumu okur; **Kullanım raporunu indir** filtrelerden bağımsız tüm yüklenmiş sonucu ve kaynak kapsamını JSON olarak indirir. **Kaynak kapsamı** özetini açarak her kaynağın sonucunu ve okuma sınırını görün. Eksik, erişilemeyen veya yetki dışında kalan kaynak uyarıları bu bölüm kapalıyken de görünür. Okuma 15 saniyede tamamlanmazsa hata gösterilir; kullanımda **Kullanımı yenile**, süreklilik/regülasyon ekranında **Tekrar dene** ile yeniden okuyabilirsiniz. Karar yeniden gönderilmez. [Eşleştirmeler ve okuma sınırları](evidence-usage.md).

Bağlı talep/çalışma kâğıdındaki **İnceleme görevi** ile kanıt değişikliği için sorumlu, tarih ve gerekçeli takip oluşturabilirsiniz. **İnceleme görevini önizle → İnceleme görevini oluştur** bir planlı denetim görevi kaydeder; Benim İşlerim, geçmiş, rapor ve kapanış kontrollerine dahil olur. Kaynak değişirse **Kaynağı yenile (taslağı koru)** ile yeniden önizleyin. Aynı sürüm/kaynak için görev varsa mevcut kayıt açılır; tamamlanmış/iptal edilmiş kayıt da çoğaltılmaz. Görevdeki **Kaynak kanıtı aç / Kaynak işi aç** bağlantıları doğru kayda götürür. Görevi tamamlamak kaynak kanıtı değiştirmez veya onaylamaz. [Koşullar, yetkiler ve sınırlar](evidence-change-followups.md).

### Görev paketinde iş günü tarihleri

**Görev paketi oluştur** alanında seçili görevlerin tarihlerini girdikten sonra **Paket iş günü tarihlerini önizle** düğmesini kullanın. Değişmeyen tarihler de listelenir; seçilmeyen görevler etkilenmez. Her tarih aynı veya sonraki çalışma gününe gider; görev süreleri hesaplanmaz, tarihler aynı güne gelebilir. Gerekçe yazıp **Paket tarihlerini taslağa uygula** seçin; ardından **Görev paketini önizle → Tüm görevleri kaydet** ile tamamlayın.

Öneri uygulanınca tarih/saat dilimi ve görev seçimi kilitlenir; değiştirmek için **Paket tarih önerisini geri al** seçin. Başlık, açıklama ve sorumlu düzenlenebilir. Takvim değişirse kayıt yapılmaz ve taslak korunur: **Takvimi yenile ve tarih önerisini geri al** özgün tarihleri getirir; metinleri ve seçiminizi korur. Yeniden önizleyip uygulayın. Takvim yenileme başarısızsa taslak ve öneri korunur. Her görevin değişiklik geçmişinde gerekçe ve kullanılan takvim bulunur. [Ayrıntılar](audit-deadline-planning.md#task-pack-dates).

## Güvence sonuçları ve kanıt güncelliği

Kanıt listesindeki **Güncellik**, kayıt yaşından değil onay/inceleme durumu, geçerlilik tarihleri, doğrulama ve mevcut bütünlük/otomasyon değerlendirmesinden hesaplanır. Tam çalışma alanında liste ile kalite özeti aynı kaynak ve değerlendirme zamanını kullanır. Kaynak okunamazsa “Doğrulanamadı” görünür; Yenile ile tekrar değerlendirin. Kayıt durumu ve denetim talebinin bağımsız kabulü ayrı kalır. Sınırlı modül erişiminde liste mevcut yetkili metadata üzerinden değerlendirilir; portföy değerlendirme erişimi genişletilmez.

Dashboard’da denetime bağlı olmayan maddeler veya eksik denetim kaynakları varsa geçerli kanıt/kontrol göstergeleri görünmeye devam eder. Bütünleşik güvence skoru ve genel güvence paketi, gereken kaynaklar doğrulanana kadar kapalı kalır. Uyarıdaki bağlantıyla bağlantısız maddeleri inceleyin. Normal modül CSV/PDF dışa aktarımları kendi kapsamlarında çalışır.

## AI yönetişiminde başlangıç

Boş yönetim özetindeki **İlk AI sistemini ekle / Add your first AI system** envanter formunu açar. AI çalışma alanları envanter/sahiplik, risk/uyum, test/güvence, inceleme/aksiyon, AI yardımı ve operasyon gruplarından seçilir. Envanter ve yönetişim işlemleri için çıkarım sağlayıcısı gerekmez; AI ile yanıt üretimi yapılandırılmış sağlayıcı gerektirir. Bu düzenleme mevcut rol ve onay kurallarını değiştirmez.


## Liste sıralaması ve tekrar kullanılabilir görünümler

Risk, BIA, Varlık, Uyum, Kontrol, Kanıt, denetim maddeleri ve Benim İşlerim ekranlarında **Sırala** alanından bir ölçüt ve artan/azalan yön seçebilirsiniz. Risk puanı sayısal, tarihler kronolojik sıralanır; eksik değerler her iki yönde de sonda kalır. Sıralama tüm filtrelenmiş listeye uygulanır, sonra sayfalama yapılır. **Varsayılan sıralama** önceki liste düzenini geri getirir; arama ve filtreleri temizlemek seçtiğiniz sıralamayı korur.

Sıralamayı kişisel tarayıcı görünümüne, hesabınıza veya yetkiniz varsa ortak görünüme kaydedebilirsiniz. Eski, sıralama içermeyen bir görünüm uygulandığında varsayılan düzen kullanılır. Ortak sürüm geri yükleme açık listenizi değiştirmez; geri yüklenen tanımı ayrıca uygulayın. Denetim sonuçları ve Benim İşlerim CSV indirmesi listenin sırasını korur. Benim/Organizasyon kapsamı ve erişim yetkileri değişmez. Ayrıntılar: [kayıtlı görünümler](saved-register-views.md#list-order).


## Süreklilik ve regülasyon kararlarında kanıt seçimi

Tatbikat sonucunda, iyileştirme açığını kapatırken ve regülasyon etkisini doğrulamaya gönderirken veya doğrularken **Karar kanıtı** alanından mevcut kanıt kaydını ve dosya sürümünü seçin. Başlık, dosya, dönem veya kayıt kimliği ile arayabilirsiniz. Dosya adı, dönem, sahibi ve sürüm gösterilir; dosyayı indirip inceleyebilirsiniz. Son sürüm otomatik seçilmez: kararınız için uygun olan sürümü bilinçli seçin. Hash hesaplamanız veya yapıştırmanız gerekmez.

Kayıt sırasında sunucu dosya içeriğini ve sürüm zincirini doğrular. Bu, kanıtın iş açısından yeterli olduğu anlamına gelmez; yeterliliği sorumlu ve bağımsız inceleyen değerlendirir. Karar kaydedilince seçilen sürüm sabitlenir. Daha sonra yeni sürüm yüklemek eski kararı değiştirmez. İlgili tatbikat, açık veya etki satırındaki **Son kararların kanıtları** alanı, işlem türü başına en son kanıtı ve karar veren kişiyi gösterir. Regülasyon gönderimi ile bağımsız doğrulama ayrı kanıtlardır.

Yeni atamalarda ad/e-posta ile etkin hesapları arayın. Bu iki modül tam erişimli Admin/Editor hesaplarını kullanır; bağımsız inceleyen etkin bir Admin olmalı ve kaydı oluşturan kişi olmamalıdır. Başarısız seçenek yüklemesinde **Tekrar dene** kullanılabilir. Seçim reddedilirse girilen not ve seçim korunur; kaydı kontrol edip düzeltin. Sonucun doğrulanamadığı ağ hatasında yeniden göndermeden önce güncel kaydı inceleyin.

Sürümlü dosya içermeyen eski kanıt kayıtlarını seçmek için önce Kanıtlar modülünden geçerli bir dosya sürümü yükleyin. Önceki serbest referans/hash API kayıtları korunur; bunlara geriye dönük doğrulanmış kütüphane sürümü atanmamıştır. Karara bağlanmış bir kanıt kaydı silinemez; yeni dosya sürümü eklenebilir.

## Süreklilik planının periyodik incelemesi

**Benim İşlerim → İş Sürekliliği** veya süreklilik modülünden planı açıp **Plan ayrıntıları ve incelemeler** seçin. Planın stratejisi, hedefleri, bağımlılıkları, sorumluları ve önceki incelemeler aynı alandadır. Etkin planın atanmış bağımsız Admin incelemecisi **Gözden geçirmeyi kaydet** ile en az 20 karakter gerekçe ve hem bugünden hem mevcut inceleme tarihinden sonraki tarihi girer; mevcut planın geçerliliğini onaylayıp kaydeder. Plan sahibi, kriz lideri ve oluşturan kişi kendi planını inceleyemez.

Plan değişirse taslak korunur. **Planı yenile**, güncel ayrıntıları incele, **Güncel plan sürümünü kullan** ve tekrar onayla. Yanıt doğrulanamadığında aynı taslakla tekrar denemek çift kayıt oluşturmaz; yenileme sonrası **Kaydedilen sonucu kullan** da sunulabilir. Pencereyi kapatmak veya sayfayı yeniden yüklemek kaydedilmemiş taslağı siler. Sonucu belirsiz bir işlemden sonra yeni karar oluşturmadan önce geçmişi kontrol edin.

Geçmişte son 20 karar, incelemeci, zaman, gerekçe, önceki/sonraki tarih ve **İncelenen plan kopyası** gösterilir. Daha eski kararlar saklanır. **Benim İşlerim → Yenile** yeni tarihi getirir; atanmış incelemeci de etkin planı kendi kuyruğunda görür. Bu işlem plan içeriğini değiştirmez ve tatbikat doğrulamasının yerine geçmez. [İşleyiş ve sınırlar](continuity-plan-review.md).
