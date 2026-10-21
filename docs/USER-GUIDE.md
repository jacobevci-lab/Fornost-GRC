# Fornost GRC Kullanıcı Rehberi

[Dokümantasyon dizini](README.md) · [Ürün tanıtımı](PRODUCT-OVERVIEW.md) · [Yönetici rehberi](ADMIN-GUIDE.md)

Kapsam: 19 Ekim 2026 itibarıyla günlük kullanım. Menü/işlem görünürlüğü rolünüze, modül izinlerinize ve işteki atamanıza bağlıdır. Türkçe ve İngilizce arayüz adları gerektiğinde birlikte verilmiştir.

## 1. Giriş ve çalışma alanı

Kurumunuzun HTTPS adresini açıp hesabınızla giriş yapın. Yerel oturum varsayılan olarak girişten 30 dakika sonra sona erer; kurum yöneticisi bu süreyi değiştirebilir. Açık formu tamamlamadan oturum dolarsa ekrandaki hatayı takip edin; işlem başarılı görünmedikçe kaydedildiğini varsaymayın.

Ana Sayfa genel durumu, **Benim İşlerim / My Work** size atanmış hazırlık ve incelemeleri gösterir. Dil seçimi TR/EN'dir. Sol menü geniş/ikon/gizli görünümde kullanılabilir; küçük ekranlarda menü düğmesiyle açılır.

Eksik menü için yöneticiye başvurun. Paylaşılan bir kayıt bağlantısına sahip olmak ilgili modülü okuma yetkisi vermez.

## 2. Kayıt bulma, oluşturma ve paylaşma

### Kayıt bulma

Üst aramayı veya **Ctrl+K** komut paletini açın. **Modules** menüye geçer; **Records** sekiz çekirdek sicilde kayıt arar: risk, BIA, varlık, uyum, tedarikçi, kontrol, kanıt ve denetim gereksinimi. En az iki karakterle kod, başlık, sahip veya ilgili referansı arayın. Dosya içeriği ve bütün kurumsal geçmiş bu aramanın kapsamında değildir.

Sonuç tam kaydı açar. Çekirdek listelerde filtre/arama bağlamı aynı kullanıcı ve tarayıcı sekmesi için korunur. **Önceki görünüme dön / Return to previous view** eski filtreyi geri getirir; **Tüm kayıtları göster / Show all records** filtreyi açıkça temizler. Kaynak yükleme hatasında yeniden deneyin; hata mesajı “kayıt yok” sonucu değildir.

### Kayıt işlemleri

1. İlgili modülü açın ve yeni kayıt işlemini seçin.
2. Zorunlu alanları, sorumluyu, tarihleri ve ilişki alanlarını doldurun. Kurum verisi için yeni kayıt oluşturun; örnek kimliklerini gerçek kayıt olarak kullanmayın.
3. Kaydedin; başarı mesajı ve listede doğru kayıtla işlemi doğrulayın.
4. Düzenlemek için mevcut kaydı açın. Eşzamanlı değişiklik uyarısında güncel kaydı inceleyip tekrar deneyin; eski verinin üstüne yazmayın.
5. Çekirdek kayıt silme Admin yetkisi ister. Kurumsal yaşam döngülerindeki iptal/yeniden açma işlemleri silmeden farklıdır; kapanmış denetimler yazmaya kilitlenir.

Çekirdek Excel içe aktarma `.xlsx`, 5 MB ve en fazla 1.000 satır içindir. Ekranın sunduğu şablon/alan düzenini kullanın; önce küçük bir örnekle alan ve tarih eşlemelerini kontrol edin. Kanıt dosyası olarak XLSX yükleme, kayıt içe aktarma değildir.

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

**Plan ve kapsam → Görevler ve kilometre taşları** altında başlık, beklenen çıktı, sorumlu, hedef tarih ve saat dilimi girin. Kayıt Benim İşlerim'e doğrudan yansır. Editor kendi işini oluşturur/yönetir; Admin farklı aktif denetim yazarına atayabilir. Başlatma, tamamlama, iptal ve yeniden açma gerekçe ister; tamamlanmış iş düzenlenmeden önce yeniden açılır. Bu görevlerde bağımsız reviewer onayı yoktur. Eski plan notları korunur ve otomatik göreve dönüştürülmez. Görev bazında E-posta hatırlatmalarını aç seçeneği kullanılabilir; varsayılan kapalıdır.

Açık görevler bütün-denetim kapanışını engeller; tamamlayın veya gerekçeyle iptal edin. Denetim başına iptaller dahil 100 görev sınırı vardır. [Görev ayrıntıları](audit-milestones.md).

### Kanıt talebi: hazırla → başlat → sun → incele

1. **Talepler ve inceleme / Requests and review** bölümünde başlık, kabul ölçütü, sahip, farklı reviewer, teslim/review tarihleri ve gerekiyorsa kanıt dönemini girin. İki atama da aktif ve uygun erişimli olmalıdır.
2. Taslağı kaydedin. Taslaklar henüz Benim İşlerim'e veya bildirimlere çıkmaz.
3. İş planını başlatırken tam talep listesini, atamaları, tarihleri ve saat dilimini önizlemede kontrol edin. Eski önizleme uyarısında güncel listeyi yeniden inceleyin.
4. Atanmış sahip olarak 1–10 mevcut kanıt sürümünü seçip sunun. Talep belirli sürümlere sabitlenir.
5. Atanmış bağımsız reviewer olarak dosyaları ve ölçütleri inceleyin. Kabul edin veya gerekçe ve yeni teslim/review tarihleriyle geri gönderin. Başka Admin sizin yerinize kabul edemez.
6. Geri dönen işte sahibi düzeltip tekrar sunar. Sunulmuş talebin ölçüt/atama değişikliği eski incelemeyi geçersiz kılar ve yeniden sunum gerektirir.

Başlamış denetime yeni talep eklerseniz önce sessiz taslak olur; **Review additions** üzerinden eklemeleri ve gerekçeyi inceleyip etkinleştirin. Kabul edilmiş eski talepler yeniden başlatılmaz. Hatırlatma takvimi denetim bazında ayarlanır; e-posta gelmemesi görev tarihinin ertelendiği anlamına gelmez.

### Çalışma kâğıdı ve manuel örnekleme

İsteğe bağlı **Hazırlama termini**, **İnceleme termini** ve **Termin saat dilimi** ile çalışma kâğıdını planlayabilirsiniz. İki tarihi birlikte girin; inceleme tarihi hazırlamadan önce olamaz. İşlerim taslakta hazırlama, gönderimde inceleme terminini izler. İade/geri çekme/yeniden açma hazırlama tarihine döner; tarihler otomatik ötelenmez. Onay/iptalde aktif termin kalkar, kayıt ve geçmişte iki tarih korunur. Hesaplama seçili saat diliminde gün sonuna göredir. Bu tarihler e-posta göndermez.


**Workpapers** sekmesinde amaç, test prosedürü, popülasyon/kaynak, seçim yaklaşımı/gerekçesi, sahip ve farklı reviewer girin. En fazla 100 test birimini referans, sonuç, not ve sabitlenmiş kanıt sürümüyle kaydedin. Sonuç ve kanıtları tamamlayıp sahip olarak incelemeye sunun. Reviewer onaylar veya geri gönderir; içeriği daha önce düzenleyen kişi sonradan reviewer yapılarak aynı kâğıdı onaylayamaz.

Tam sayım seçilmişse bütün popülasyon temsil edilmelidir; 100'ü aşan popülasyon bu sınır içinde tamamlanmış sayım olarak gösterilemez. Bu araç istatistiksel/rastgele örnekleme veya güven aralığı hesaplamaz. İstisna sonucu otomatik CAPA oluşturmaz; ilgili bulguyu ayrıca yönetin. Onaylı kâğıdı değiştirmek için gerekçeli yeniden açma gerekir. [Çalışma kâğıdı rehberi](audit-workpapers.md).

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

### Entegrasyon ve kanıt kaynağı yükleme hataları

İş Akışı Entegrasyonları ekranındaki genel görünüm ve Kanıt Otomasyonu kaynak listesi, yanıt veya JSON içeriği 10 saniyede tamamlanmazsa yüklemeyi sonlandırır. Alınamayan bilgi, boş veya sağlıklı bir sonuç gibi gösterilmez. Genel görünümde **Entegrasyonları yenile / Refresh integrations**, kaynak listesinde **Yeniden dene / Retry** ile tekrar okuyabilirsiniz. Başka ekrana geçtiğinizde bu okumalar iptal edilir; geç gelen eski yanıt yeni görünümü değiştirmez. Bu süre sınırı yalnızca bu ekranların veri okumaları içindir; kaynak çalıştırma veya kaydetme işlemini otomatik tekrar etmez.

### Policy Center load recovery

If policy data cannot be loaded, Policy Center shows an explicit error and **Retry**. The data read times out after 10 seconds, including an incomplete response body. Until a verified response arrives, policy counts and actions are unavailable rather than showing an empty register. Navigating away cancels the read; late responses cannot overwrite newer data. Retry only reloads data and does not repeat a policy decision or write.

### Import workpaper samples

In Audit Management → audit → Workpapers, create or edit a draft and open **Import samples from CSV**. Download the `reference,note` template or paste/upload your selected samples, inspect the preview, then choose **Add samples to draft**. Duplicates, malformed rows and population/sample limit violations block the whole import. Imported samples start as Pending without evidence; complete testing and evidence selection, then Save draft. See [Audit workpapers](audit-workpapers.md#bulk-sample-entry).

### Filter My Work by module

Use **Work queue module** in My Work to focus on Risk, Audit, Evidence, Policy or another module represented in your current authorized personal/organization scope. Summary cards, status-filter counts, completed work, pagination and the downloaded CSV use that module selection. Search and due/status filters continue to apply. The CSV includes a canonical `module_filter` column.

**Clear module filter** restores all modules without changing personal/organization scope or search. If the selected module has no work after a scope change or refresh, the filter remains explicit and the list stays empty rather than silently expanding. This filter does not grant access or change the separate assurance-signal panel's scope.

### Save a recurring My Work view

In **My Work → Saved views**, name and save your current search, module and work-status filter (for example, “Overdue evidence”). Select it and choose **Apply view** to use it again against current authorized work. Applying returns to the first page and keeps your current **Mine/Organization** scope. Counts and CSV use the applied criteria. Views are not applied automatically after reload.

You can rename, replace or delete up to ten personal views in this browser. Deleting a view does not delete work. These are browser-local preferences, not shared/server views or evidence snapshots; they do not save records, deadlines or approvals. A supported module with no current work stays selected. Unsupported criteria show an error instead of widening the queue.

### Reuse audit plan and milestone templates

Open **Audit Management → audit → Plan and scope → Templates** for plan starters. A second Templates panel within an editable task provides milestone starters. Preview each proposed field beside your draft; filled fields are not preselected. Apply only the fields you choose, then use **Save plan** or **Save milestone** to persist through the existing authorized workflow. People, dates, states and approvals are never copied.

Plans include internal-control and remediation-follow-up starters; milestones include scope, evidence preparation, fieldwork and closure preparation. These are editable prompts, not a claim of compliance or automatic audit completion. You can name and download your customized text as JSON, then paste it into a matching plan/task template panel for preview and reuse. No server template library is created. Plan templates contain narrative text only; milestone templates contain title and expected output only. Existing task limits, role checks, revision conflicts and closure locks still apply.

### Sequence audit tasks with prerequisites

In **Plan and scope → Tasks and milestones**, select prerequisite tasks and save with a reason. Only tasks in the same audit are available, up to 20 per task. The selected tasks must be completed before you can start or complete the dependent task; cancellation does not satisfy a prerequisite. My Work shows blocked task counts and the Waiting filter includes your blocked tasks.

Cycles are rejected. A prerequisite cannot be reopened while dependent work is in progress or completed. Resolve or reopen that dependent work first. Dependencies do not reschedule deadlines, send emails or certify evidence approval. Saved dependencies appear in task history and audit snapshots.


### Repeat an audit task for the next period

In **Audit → Plan and scope → Tasks and milestones**, select a recurrence (weekly, monthly, quarterly, or yearly) and save. Complete the task, enter an action reason, then use **Create next occurrence**; the button shows the calculated due date. The new Planned task appears in My Work with its own deadline. Use **Previous occurrence** / **Next occurrence** to move between periods.

Creation is explicit and happens once per completed task. No next-period tasks are created in the background. Email reminders follow the task setting. The next period is based on the previous due date; month-end dates retain their original day where possible. Only the previous task is carried as a prerequisite; review other prerequisites for the new period. All periods count toward the 100-task audit limit. Set recurrence to One-off on an editable task to stop further periods. A cancelled successor can be reopened; repeatedly clicking the original never creates a replacement duplicate.


### Denetim görevi e-posta hatırlatmaları

**Denetim → Plan ve kapsam → Görevler** içinde **E-posta hatırlatmalarını aç** seçeneğini işaretleyip kaydedin. Ön hatırlatma, son gün, gecikme ve isteğe bağlı eskalasyon tarihleri ekranda gösterilir. Takvim aynı denetimin **Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon** bölümünden yönetilir; görevin saat dilimi kullanılır. E-posta taşıması **Ayarlar → E-posta ve Bildirimler** altında yapılandırılır.

Mevcut görevlerde seçenek kapalıdır. Görev kapanınca veya hatırlatma kapatılınca bekleyen bildirim geri çekilir. Görev/profil değişikliği yeni bildirim oluşturabilir; her gün tekrarlanan e-posta gönderilmez. E-posta teslimi görevin tamamlandığı anlamına gelmez. Yeni tekrar dönemine hatırlatma tercihi aktarılır; kendi tarihi gelene kadar bildirim üretilmez.
