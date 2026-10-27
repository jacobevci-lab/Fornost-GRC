# Fornost GRC Yönetici Rehberi

İşlerim, süreklilik planı/tatbikat/açık sorumluluklarını mevcut yetkilerle okur. Ayrı bir yapılandırma veya veri göçü gerekmez. Kaynak başına 2.000 kayıt sınırı, eksik ilişki veya okuma hatası varsa liste eksik olarak işaretlenir ve CSV kapanır; yenileme ile tekrar denenir. Kurumsal süreklilik verileri sınırlı modül yetkili hesaplara açılmaz. [Süreklilik iş kuyruğu ve tarih kuralları](continuity-my-work.md).

[Dokümantasyon dizini](README.md) · [Kullanıcı rehberi](USER-GUIDE.md) · [Ürün tanıtımı](PRODUCT-OVERVIEW.md)

Kapsam: 19 Ekim 2026 itibarıyla müşteri kurulumunun uygulama yönetimi ve işletimi. Komutlar on-prem Linux içindir; hosted ortamın veri yedekleme ve dağıtım işlemleri ayrı yürütülür.

## 1. Kurulumdan ilk kullanıma

1. [Linux Kurulum Rehberi](LINUX-INSTALLATION.md) ile test edilmiş commit paketini kurun. Standart paket amd64 ve `/fornost-grc` içindir. Kurucunun sağlık kontrolü tamamlanmadan kullanıcı açılışı yapmayın.
2. Kurucunun verdiği HTTPS adresini açın ve ilk yerel Admin hesabını oluşturun. Parola ekranındaki koşulları sağlayın; en az 12 karakter gerekir.
3. Kurum DNS/TLS ayarlarını tamamlayın. Sunucuya FQDN ile erişiliyorsa `.env.onprem` içindeki `FORNOST_TLS_HOSTNAME` ve sertifika adını eşleştirin.
4. Kimlik ve Erişim üzerinden kişisel hesapları oluşturun. Bağımsız inceleme gereken işler için farklı aktif kullanıcılar atayın; bütün-denetim kapanışı iki ayrı Admin gerektirir.
5. Sistem ayarlarını, örnek veri kararını ve gerekli entegrasyonları tamamlayın. İlk gerçek risk, kontrol, kanıt ve denetim akışını ilgili ekiplerle deneyin.
6. Yedek alın ve ayrı volume üzerinde geri dönüş tatbikatı yapın. [Canlıya geçiş kabul listesini](PRODUCTION-READINESS.md) kurulum özelinde tamamlayın.

## 2. Roller ve modül izinleri

**Kimlik ve Erişim → Yerel Kullanıcı Hesapları / Identity & Access → Local User Accounts** alanında kullanıcı oluşturulur, rol/durum değiştirilir, kilit sıfırlanır ve modül politikası kaydedilir.

| Rol | Genel yetki |
| --- | --- |
| Admin | Kullanıcı, ayar ve entegrasyon yönetimi; çekirdek kayıt silme; kurumsal rapor/kapanış gibi Admin'e özel akışlar |
| Editor | İzin verilen alanlarda oluşturma ve düzenleme; atanmış sahip/reviewer olarak uygun yaşam döngüsü işlemleri |
| Viewer | İzin verilen kayıtları okuma; kendisine ait politika attestation gibi açıkça tanımlı kişisel akışlar kendi kurallarına tabidir |

Rol, bir onay akışında atanmış reviewer olma koşulunu kaldırmaz. Örneğin kanıt talebini yalnız atanmış bağımsız reviewer kabul edebilir; başka bir Admin onun yerine onay veremez. Son aktif Admin koruması vardır.

Admin dışındaki kullanıcı için **Module access → Selected core modules** seçilerek Risk Assessment, BIA, Varlık Envanteri, Uyum, Tedarikçiler, Kontroller, Kanıtlar ve Denetim Yönetimi izinleri ayrı verilir. Seçenekler erişim yok, okuma, okuma/düzenlemedir. Viewer'a yazma seçilse de rol tavanı geçerlidir.

- Kaydedilmiş politikası olmayan mevcut kullanıcılar tam çalışma alanı erişimini korur.
- Seçili modül izni o modülün bütün kayıtlarını kapsar; kayıt sahibi/departman/alan bazlı izolasyon değildir.
- Sekiz modülün tamamını seçmek, paylaşılan kurumsal raporları, CAPA'yı, genişletilmiş tedarikçi akışını veya AI yönetişimi veri kümelerini açmaz.
- Kanıt talebi/çalışma kâğıdı atamalarında aktif Admin/Editor, denetim yazma ve kanıt okuma koşulları birlikte aranır.
- Rol, durum veya izin değişikliği yerel oturumları iptal eder. Erişim değişiklikleri işlem geçmişine kaydedilir.
- Trusted-platform kimliğinde eşlenmiş hesap aynı politikaya uyar. Eşlenmemiş kimliklerin mevcut Viewer davranışını sınırlamak için yerel hesap eşlemesi yapılmalıdır.

Ayrıntılı sınırlar: [Modül Erişimi](onprem/module-access.md).

## 3. Oturumlar ve hesap güvenliği

**Sistem Ayarları → Genel Ayarlar → Maksimum Yerel Oturum Süresi** varsayılan 30 dakikadır; 5–720 dakika arasında ayarlanır. Bu mutlak süredir, hareketsizlik süresi değildir. Kullanıcının işlem yapması süreyi yenilemez. Süreyi azaltmak mevcut oturumlara da uygulanır; artırmak eski oturumu uzatmaz.

**Kimlik ve Erişim → Yerel Kullanıcı Hesapları → Oturum güvenliği** altında bir hesabın tüm yerel oturumları sonlandırılabilir. Hesap aktif kalır ve tekrar giriş yapabilir. Yeni girişin de engellenmesi gerekiyorsa hesabı devre dışı bırakın. Bu işlem harici IdP oturumlarını sonlandırmaz; SSO oturum politikası sağlayıcıda yönetilir. Ayrıntılar: [Oturum Politikası](onprem/session-policy.md).

## 4. Sistem ayarları ve örnek veriler

Sistem Ayarları altında kurumun yerelleştirme, oturum ve diğer platform tercihlerini kaydedin. Uygulama içindeki bir TLS tercihi host sertifikasının kurulmasının yerine geçmez; sertifika ve proxy ayarları Linux rehberindeki şekilde uygulanır.

**Örnek Veri Yaşam Döngüsü / Sample Data Lifecycle** alanı sekiz çekirdek modüldeki bilinen örnek kimliklerini yönetir. Eksik örnekler geri yüklenebilir. Kaldırmak için ekrandaki **ÖRNEKLERİ KALDIR** onayı gerekir. Sonradan oluşturulan kurum kayıtları korunur; ancak örnek kimliği üzerinde düzenlenmiş kayıt hâlâ örnek kapsamındadır. Kurum verisini örnek kaydın üzerine kurmadan önce ayrı kayıt oluşturun.

Kayıt silme ile yaşam döngüsü iptalini ayırın: bazı kurumsal işler geçmişi korumak için iptal/yeniden açma kullanır. Kapalı denetim kilitlerini veritabanından atlatmayın.

## 5. E-posta ve görev hatırlatmaları

**E-posta ve Bildirimler / Email & Notifications** yalnız bağlantı, test ve bildirim politikalarının yönetildiği alandır. Günlük kullanım için delivery/dispatch/recovery log tabloları veya manuel kuyruk işletimi gerektirmez.

1. SMTP Relay Bridge, Microsoft Graph Mail veya HTTP Email API sağlayıcısını seçin.
2. Ekrandaki sağlayıcı alanlarını ve gerekli sırrı doldurup kaydedin. SMTP seçeneği HTTPS bridge gerektirir; uygulamanın doğrudan SMTP soketi açtığı varsayılmamalıdır.
3. **Uygulama adresi (görev bağlantıları)** alanına kullanıcıların eriştiği tam HTTPS adresini yazın. Örnek: `https://grc.company.example:8443/fornost-grc/`. Kimlik bilgisi, query veya fragment eklemeyin. Alan boşsa e-postada doğrudan görev bağlantısı oluşmaz; mevcut menü talimatları kalır.
4. Gerçek kurum posta altyapısıyla bağlantı/test gönderimini doğrulayın. Gönderim kabulü mesajın okunduğunu göstermez.
5. Teslim/retry politikası ve alıcı frekans sınırlarını kurum ihtiyacına göre ayarlayın. Scheduler'ın çalıştığını ayrıca doğrulayın.

Denetim bazında **Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon** alanı kullanılır. Takvim günü/iş günü, çalışma günleri, elle girilen tatiller, hatırlatma eşikleri ve tek eskalasyon alıcısı seçilebilir. İş günü modunda çalışma dışı günlerde bildirim bekler; asıl teslim/review tarihi değişmez. Eskalasyon sahipliği veya erişim yetkisini devretmez. Ortak kurum takvimleri aşağıdaki sürümlü kütüphaneden yönetilir. Otomatik tatil servisi, çok seviyeli eskalasyon ve digest mevcut kapsam değildir.

Standart on-prem container içinde `container-runtime.mjs`, geçerli scheduler token ile dahili döngüyü başlatır; varsayılan aralık 300 saniyedir. Döngü `/api/evidence-automation` üzerinden vadesi gelen işleri yürütür. Hosted ortam Worker scheduled handler kullanır ve cron dağıtımda yapılandırılmalıdır. E-posta formunun kaydedilmesi tek başına zamanlayıcı kurmaz. Token'ı kullanıcıya veya loglara çıkarmayın. [Takvimler](audit-reminder-profiles.md) · [Görev bağlantıları](record-links.md).

Plan sekmesindeki yapılandırılmış kilometre taşı görevleri Benim İşlerim ve kapanış kontrollerine katılır; kanıt talebi bildirimlerinden farklıdır ve görev bazında açıldığında mevcut e-posta taşıması/zamanlayıcısıyla hatırlatma üretir. Varsayılan kapalıdır; görev kendi saat dilimini ve denetimin hatırlatma profilini kullanır. Görev güncelleme veya kapatma eski kuyruğu geri çeker, gönderim öncesi alıcının aktif denetim yazma yetkisi yeniden doğrulanır. Admin görevleri aktif denetim yazarlarına atayabilir; görev tamamlama bağımsız kanıt kabulü değildir. [Görev sözleşmesi](audit-milestones.md).

## 6. Kimlik, ticket ve kanıt kaynakları

| Bağlantı | Yönetici işlemi ve doğrulama |
| --- | --- |
| Kimlik ve Erişim | Entra/Okta/OIDC/SAML veya LDAP/LDAPS profilini kaydedin; gerçek IdP/bridge, kullanıcı ve grup→rol eşlemesini doğrulayın. Profil kaydı otomatik SSO kurulumu değildir. |
| İş Akışı Entegrasyonları | Jira, ServiceNow, Azure DevOps, GitHub Issues veya webhook hedefini en az yetkili servis hesabıyla kurun; doğru proje ve ticket sonucunu test edin. Genel çift yönlü senkronizasyon varsaymayın. |
| Kanıt Otomasyonu | Desteklenen native dataset veya kurum collector'ını seçin; önce bağlantıyı, sonra dönen alanları ve kontrol eşlemesini doğrulayın. Test kuralı ve tazelik/sıklık ayarlarını bundan sonra etkinleştirin. |

Native connector başarı sonucu sadece tanımlı credential kapsamını gösterir. **Collector required** etiketli ürünler harici HTTPS JSON adaptörü ister. Public/private bağlantı politikası, şifreleme anahtarı ve sır rotasyonu [kaynak rehberinde](integrations/product-connectors.md) açıklanır. Test bağlantısı bir kontrolü otomatik olarak uyumlu yapmaz.

## 7. AI yapılandırması

**AI Ayarları / AI Settings** üzerinden OpenAI-compatible veya Ollama sağlayıcısını, modelini, gerekirse yedek sağlayıcıyı ve veri/güven politikalarını yönetin. Sağlayıcıya hangi verinin çıkabileceğini kurum politikasına göre belirleyin; yerel sağlayıcı kullanımı da erişim ve kaynak planlaması gerektirir.

Bağlantı ve yetenek durumunu kontrol edin, yetkisi sınırlı bir hesapla bağlam erişimini deneyin, kaynak gösterimini ve insan onaylı taslak akışını doğrulayın. Modeli kaydetmek veya provider testini geçmek üretim release gate onayı değildir. Anahtarları kaynak koda koymayın. [AI Architecture](AI-ARCHITECTURE.md) güven sınırları için esas belgedir.

## 8. Kanıt, rapor ve denetim yönetişimi

Kanıt yükleme limiti dosya başına 10 MiB'dır. PDF, PNG/JPEG/WebP, UTF-8 metin/CSV/TSV/JSON ve desteklenen DOCX/XLSX kabul edilir. HTML/SVG, eski DOC/XLS, makrolu Office ve genel ZIP kabul edilmez. Office doğrulaması yapısal kontroldür; antivirüs taraması değildir. [Format ayrıntıları](EVIDENCE-DOCUMENT-FORMATS.md).

Bütün-denetim kapanışı ve denetim durum raporu paketleri Admin'e özeldir. Kapanış için ayrı hazırlayan ve reviewer gerekir. Açık bulguların takip planıyla kapanışa alınabilmesi, bulguların çözüldüğü anlamına gelmez. Hash doğrulaması uygulama bütünlüğünü denetler; yasal arşiv/elektronik imza politikalarının yerine geçmez. Saklama ve erişim politikalarını kurum olarak tanımlayın.

## 9. Güncelleme, yedek ve geri dönüş

Uygulama verisi, şifreleme/mühürleme anahtarları ve eşleşen sürüm birlikte korunmalıdır. Repo kopyası tek başına yedek değildir.

- Güncellemeden önce [yedekleme rehberiyle](onprem/backup-recovery.md) yeni bir hedef dizine yedek alın ve doğrulayın.
- `git pull --ff-only origin main` ve kurulum scriptleri için [Linux güncelleme adımlarını](LINUX-INSTALLATION.md) izleyin. Yerel değişikliklerin üzerine zorla yazmayın.
- Güncelleme sonrası `sudo bash scripts/linux/check.sh`, oturum açma, bilinen kayıt ve kanıt indirme kontrollerini yapın.
- Yedek şifrelenmemiş kurtarma anahtarları içerir; erişim kontrollü ve şifreli, host dışı depoda saklayın.
- Yedek TLS dosyalarını, proxy/OS yapılandırmasını veya container image'ını içermez; bunları ayrıca koruyun.
- Geri dönüşü aynı sürümle **yeni volume** üzerinde deneyin; çalışan verinin üstüne yazmayın. Checksum doğrulaması gerçek uygulama geri dönüş tatbikatının yerine geçmez.

## 10. Sorun giderme

| Belirti | Kontrol |
| --- | --- |
| Kullanıcı menüyü göremiyor | Rol, aktiflik, modül politikası ve ilgili kurumsal alanın tam çalışma alanı gereksinimi |
| Bağlantı hedefi kullanılamıyor | Doğru kurulum adresi, güncel oturum, modül/kanıt erişimi, kayıt ve parent denetimin varlığı |
| Kayıt güncellenemiyor | Kapalı denetim kilidi, atanmış kişi, zorunlu alanlar ve eşzamanlı değişiklik uyarısı; güncel kaydı yeniden inceleyin |
| E-posta gelmiyor | Sağlayıcı/test, alıcı aktifliği/izinleri, çalışma takvimi, frekans/retry politikası ve scheduler |
| Görev bağlantısı e-postada yok | Uygulama adresi kaydedilmiş mi; mesaj bu ayar kaydından sonra mı oluşturulmuş? Eski mesaj yeniden yazılmaz. |
| Dosya reddediliyor | Uzantı/MIME/içerik uyumu, boyut, desteklenmeyen Office nesneleri; gerekirse PDF'e dönüştürün |
| HTTP 421 veya TLS sorunu | FQDN allowlist, sertifika adı ve proxy/port ayarları |
| Kurulum/servis hatası | `status.sh`, `check.sh`, `logs.sh`; rapora sır eklemeden faz, sürüm ve hata mesajını alın |

Müşteri IdP/e-posta/ticket kabulü, yedek saklama ve geri dönüş tatbikatı kurulum sahibinin sorumluluğundadır. CI ve referans canlı ortam testleri bunların yerine geçmez.

## Personal register preferences

Named register views use per-user/module browser local storage and require no server configuration or migration. They do not grant access, modify records or enter database backups. Browser site-data clearing removes them; browser-profile access can expose names, search text and filter values. See [Saved register views](saved-register-views.md) for limits and recovery.

### Workpaper deadlines

Optional paired preparation/review deadlines use each workpaper's IANA time zone. Legacy undated records need no migration. Dates participate in existing revision-checked draft writes, history, report integrity and closed-audit restrictions. My Work switches to the review deadline after submission and removes active deadlines for approved/cancelled work. Older clients that omit scheduling fields preserve saved dates. Optional workpaper reminders are documented in the reminder section below and use the existing transport. See [Audit workpapers](audit-workpapers.md#preparation-and-review-deadlines).

### Dashboard operational data loading

The collapsed operational detail does not fetch delivery/owner history. Opening it loads the current sources with a 15-second deadline, and closing it cancels pending requests. Failed sources are explicitly unavailable rather than zero; successful sources remain visible and Retry refreshes both. This keeps background operational reads from blocking initial dashboard loading. Email configuration remains in Email & Notifications.

### Çalışma kâğıdı termin hatırlatmaları

Çalışma kâğıdı taslağında **E-posta hatırlatmaları** varsayılan kapalıdır ve iki termin gerektirir. Denetim bazlı hatırlatma profili, çalışma günleri/tatiller ve eskalasyon ayarları kullanılır. Hazırlamada sorumlu, incelemede inceleyen hedeflenir. Alıcı aktif olmalı, denetime yazma ve kanıtlara okuma yetkisi bulunmalıdır. Gönderim öncesinde güncel kayıt/profil/süreç/yetki tekrar doğrulanır. Kaydetme ile eski kuyruk atomik geri çekilir; kuyruk oluşturma başarısızsa kayıt korunur ve arayüz zamanlayıcının yeniden deneyeceğini bildirir. Onay/iptal, denetim kapanışı ve yetki kaybı gönderimi durdurur. Mevcut e-posta transport, retry/rate-limit ve uygulama URL ayarları geçerlidir. Kimlikler ve termin dışında örneklem veya kanıt içeriği e-postaya taşınmaz. 5.000 aktif ve hatırlatması açık çalışma kâğıdı kaynak sınırı aşılırsa işlem açık hata verir; müşteri mail altyapısında UAT ayrıca yapılmalıdır.

### Denetimler arasında takvim aktarımı

**Denetim → Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon → Hatırlatma profilini düzenle → Takvimi başka denetimde kullan** bölümünden taslak takvimi JSON olarak indirebilirsiniz. Dosya yalnızca gün hesabını, çalışma günlerini ve tatil tarihlerini içerir; kişi, denetim kimliği, bildirim eşiği veya eskalasyon alıcısı içermez.

Başka denetimde dosyayı seçin veya JSON içeriğini yapıştırıp önizleyin. **Takvimi taslağa uygula**, bu üç alanı değiştirir; tatilleri birleştirmez. Hedef denetimin bildirim eşikleri, eskalasyon sorumlusu ve terminleri korunur. Son olarak **Hatırlatma profilini kaydet** ile kalıcı hale getirin. Kaydetmeden vazgeçerseniz kayıt değişmez. Kaydetmede mevcut yetki, kapalı denetim ve eşzamanlı değişiklik kontrolleri uygulanır; bekleyen bildirimler yeniden değerlendirilir. Aktarım bir kopyadır: kaynak takvim daha sonra değişirse hedef denetimler otomatik güncellenmez. En fazla 16 KB dosya ve 366 benzersiz geçerli tatil tarihi desteklenir; dosya aktarımıdır. Ortak takvim kütüphanesi aşağıda açıklanır; otomatik resmi tatil servisi yoktur.


### Toplu denetim görevleri

Görev paketi, aynı denetimde seçili başlangıç görevlerini tek işlemde oluşturur. Admin aktif denetim yazarı seçebilir; Editor yalnız kendisine atar. Kayıt anında hesap/grant ve görev grafiği tekrar doğrulanır; kapalı denetim ve tarihçe hatalarında işlem geri alınır. Paket API’si 1–12 kayıtla ve denetim başına 100 toplam görevle sınırlıdır. Mevcut kayıtlar değiştirilmez; hatırlatmalar/tekrar kapalı başlar. Bir bağlantı hatasından sonra önce listeyi yeniden yükleyin; aynı paket kimlikleri tekrar oluşturulamaz. Merkezi şablon yönetimi ayrı ortak kütüphanede sunulur; otomatik tarih planlaması kapsam dışıdır.

### Oturum etkinlik zamanı

Yerel oturumların hesap durumu, rolü, modül yetkileri ve mutlak süre sınırı her istekte veritabanından güncel okunur; yetki sonucu önbelleğe alınmaz. Son görülme zamanı operasyonel metaveridir ve yoğun isteklerde en fazla dakikada bir güncellenir. Bu alan boşta kalma süresi hesabı değildir; etkin istekler oturumun mutlak sona erme tarihini uzatmaz. Bu sınırlama oturum doğrulamasındaki gereksiz yazma yükünü azaltır.


### Ortak şablon kütüphanesini yönetme

Plan, tekil görev ve görev paketi ekranlarında **Ortak şablon kütüphanesi** bulunur. Admin mevcut yerel taslak metnini ad ve değişiklik gerekçesiyle önizleyip yeni kurum şablonu olarak yayınlayabilir; seçili şablon için yeni sürüm de oluşturabilir. Arşivleme ve yeniden etkinleştirme gerekçe/önizleme ister. Denetim erişimi olan kullanıcılar ortak içeriği okuyabilir; düzenleme yetkisi olanlar kendi taslaklarına alıp normal kayıt akışında kullanır.

Her tür için arşivler dahil 200 şablon sınırı vardır. Son 50 sürüm listelenir; daha eski kayıtlar saklanır. Kayıt ve sürüm geçmişi atomiktir; güncel aktif Admin hesabı ve beklenen sürüm yazma anında denetlenir. Çakışma/bağlantı hatasında taslak korunur; kütüphaneyi yenileyip sonucu kontrol edin. Şablonlar yapılandırılmış kişi, termin, kanıt veya onay bilgisi içermez, ancak paylaşılacak serbest metni yayınlamadan önce inceleyin. Mevcut denetimler güncellenmez; e-posta log ekranı eklenmez. [API, sınırlar ve veri modeli](audit-template-library.md).

### Hesap ve ortak görünümler

Yedi çekirdek liste ve Benim İşlerim'deki **Hesap ve ortak görünümler** bölümünde Admin, **Ortak görünümler** kapsamını seçerek modül başına 50 tercih yayınlayabilir. Ortak içerik modüle erişimi olan hesaplara görünür; yeni bir grup veya veri paylaşım yetkisi vermez. Ad, arama ve filtre metinlerini paylaşım önizlemesinde inceleyin. Editor/Viewer ortak tanımları değiştiremez; her hesap okuma yetkisi olan modüllerde kendi 20 kişisel görünümünü yönetebilir. Başkasının kişisel listesi Admin'e API üzerinden açılmaz.

Sunucu görünüm kayıtları normal veritabanı yedeklerine dahildir. İşlem anında aktif hesap, rol, modül politikası ve beklenen sürüm yeniden doğrulanır. Silme iş kayıtlarına dokunmaz; ad/ölçütler temizlenir, eski isteğin kaydı geri getirmemesi için asgari kimlik işareti tutulur. Kişisel tercihler yalnızca son sürümü saklar. Ortak tanımların ad/ölçütleri, değiştiren Admin e-postası, gerekçesi ve varsa geri yükleme kaynağı değiştirilemeyen sürüm geçmişinde tutulur; silinen ortak tanımın geçmişi de veritabanında/yedeklerde kalır, API üzerinden açılmaz veya geri getirilemez. Bu geçmiş bağımsız onay değildir. Mevcut eski tanımlar ilk değişiklikte yazarı bilinmeyen bir başlangıç sürümüyle korunur. Son 50 sürüm listelenir; daha eskiler saklanır. Admin geçmiş sürümü önizleyip 3–500 karakterlik gerekçeyle yeni sürüm olarak geri yükleyebilir. Geçmiş yazımı başarısızsa güncel tanım da değişmez. Mevcut tarayıcı kayıtları otomatik taşınmaz veya paylaşılmaz. [API, erişim ve kurtarma ayrıntıları](account-team-views.md).


### Denetim görevlerinde bağımsız onay

Görev detayında Admin, sorumludan farklı aktif denetim yazarı ve sorumlu tarihinden önce olmayan inceleme tarihi atar. İncelemeci/tarih değişikliği ve kaldırma yalnız Admin'e açıktır ve mevcut görevde gerekçe ister. Sunulmuş görev düzenlenemez; atanan incelemeci geri göndermeli veya görev gerekçeyle iptal edilip yeniden açılmalıdır. Admin rolü, atanmadığı görevi onaylama hakkı vermez; incelemeci görevi kendisi gönderemez. Yetkisi kaldırılan incelemecinin eski ekranından karar verilemez. Devre dışı kalan sorumlunun işini incelemeci geri gönderebilir; Admin iptal/yeniden açma ile atamayı düzeltebilir.

İncelemede ve düzeltme bekleyen işler denetim kapanışını engeller. Bağlı görevler yalnız tamamlanmış ön koşulla başlayabilir. Yeni dönem önceki incelemeciyi ve tarihler arasındaki takvim günü farkını taşır, eski onayı taşımaz. E-posta taşıması yine yalnız Ayarlar → E-posta ve Bildirimler içindedir. [Görev sözleşmesi](audit-milestones.md#independent-milestone-review).


### Sürümlü ortak takvimler

**Denetim → Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon → Hatırlatma profilini düzenle → Ortak takvim kütüphanesi** yolunu kullanın. Güncel takvimi seçin, **Takvim değişikliklerini önizle** ile çalışma günlerini ve eklenecek/kaldırılacak tatilleri karşılaştırın. **Ortak takvimi taslağa uygula**, ardından **Hatırlatma profilini kaydet** ile denetime bağlayın. Bildirim eşikleri, eskalasyon alıcısı, saat dilimleri ve kayıtların terminleri korunur.

Denetim kullanılan takvim adını ve sürümünü gösterir. **Takvim güncellemelerini kontrol et** yeni sürümü önizlemeye getirir; kütüphane güncellemeleri denetimlere otomatik yayılmaz. Arşivlenen kaynağın önceden kaydedilmiş sürümü çalışmaya devam eder. **Yerel takvim olarak devam et**, takvim alanlarını elle düzenlemek veya JSON uygulamak kaynak bağlantısını taslakta kaldırır; kalıcı olması için kaydedin. Vazgeçmek kayıtlı profili korur. Eşzamanlı kaynak değişikliğinde taslak kaybolmaz; güncel sürümü tekrar kontrol edin.

Yalnız Admin ortak takvim yayımlar, sürümler, arşivler veya yeniden etkinleştirir. Yayımlama ekrandaki taslak gün hesabı, çalışma günleri ve tatilleri kullanır; takvim adı ve gerekçe girip önizleyin, sonra **Kütüphane değişikliğini kaydet** seçin. En fazla 200 takvim (arşivler dahil), takvim başına 366 tatil tarihi desteklenir. Son 50 sürüm listelenir; eski sürümler saklanır. Otomatik tatil servisi, toplu otomatik yayılım ve takvime özel ayrı yönetici ataması bu kapsamda yoktur. [Veri ve yetki sözleşmesi](audit-reminder-profiles.md#shared-organization-calendars).


### Workpaper exception promotion

Approved exceptions can be promoted to canonical CAPA by a full-access Admin or assigned Editor owner/reviewer. Full-access Viewers read the origin; scoped accounts cannot access this shared enterprise workflow. The CAPA owner must be an active full-access writer, and the reviewer an active Admin distinct from both the owner and the promoting actor. Current identity, policy, source revision, pinned evidence and audit closure are guarded atomically with creation/history. Each workpaper has 100 lifetime promotions, one per case-insensitive trimmed sample reference. Origin records are immutable and remain in normal database backups after source/CAPA removal; the UI distinguishes unavailable targets. Source evidence does not satisfy remediation verification. New report/closure snapshots include the origin; historical reports retain their prior content. See [workflow, API and recovery](audit-workpapers.md#exception-to-capa-handoff).


### Takvime bağlı termin önerileri

Görev ve çalışma kâğıdı taslakları, denetime kaydedilmiş iş günü takvimiyle gerekçeli tarih önerisi sunar. Öneri yalnız açık uygulama/kaydet adımıyla tarihleri değiştirir; ortak takvim yayımlamak kayıtları otomatik taşımaz. Görev inceleme tarihini değiştirme yetkisi Admin'de kalır. Sunucu hesaplamayı tekrar yapar; profilin tam içeriğini ve sürümünü kayıt/geçmiş işlemi içinde doğrular. Çakışma ya da geçmiş yazma hatası kısmi güncelleme bırakmaz. Gerekçe, önceki/sonraki tarihler ve kullanılan takvim ilgili kaydetme olayında saklanır; yeni tablo veya migration gerekmez. [İşleyiş ve sınırlar](audit-deadline-planning.md).


Kanıt taleplerinde de oluşturma/düzenleme ve bağımsız inceleyenin düzeltme kararı için aynı açık tarih önerisi kullanılabilir. Etkin talepler iş planının kayıtlı saat dilimini kullanır; öneri bunu değiştiremez. Takvimle birlikte iş planı sürümü/durumu/saat dilimi ve işlem yapan hesabın güncel kimliği, rolü, durumu ve modül politikası aynı kayıt işlemi içinde doğrulanır. Takvim yenilemesi farklı bir kayıt sürümünü taslağın üzerine sessizce almaz. Dönem, kanıt ve kabul yetkileri önceki davranışını korur. Gerekçe yalnız ilgili oluşturma/düzenleme/düzeltme olayına yazılır; sonraki olaylara kopyalanmaz.

### Reproducible random workpaper selection

Random sampling reuses the existing audit-write/evidence-read permissions and independent workpaper review. CSV populations are capped at 5000 unique units / 256 KiB and selections at 100; whole write payloads are capped at 2 MiB UTF-8. The server recomputes newly supplied draws and binds exact references/population to the workpaper revision. Original CSV bytes are not retained: arrange source-export retention in the organization's evidence process. Seed, normalized-population fingerprint, chosen references, reason and saving identity/time persist in workpaper history and new report/closure snapshots. Ordinary test-note/evidence changes retain that selection; switching to a manual method removes current provenance while preserving old history. No migration, new service, permission or notification configuration is needed. Statistical confidence/sample-size calculations remain outside scope. See [selection contract and limits](audit-workpapers.md#reproducible-random-selection).

## Kanıt kullanımı erişim sınırları

[Kanıt kullanım alanı](evidence-usage.md), Kanıtlar okuma iznine sahip kullanıcılara açıktır. Her bağlı kaynak kendi modül izniyle sorgulanır; yalnız Kanıtlar izni olan kullanıcıya denetim, kontrol veya CAPA satırları verilmez. CAPA mevcut scoped erişim kapsamı dışında kalır. Endpoint salt okunurdur ve özel önbelleksiz yanıt döndürür; yeni tablo, zamanlayıcı veya e-posta ayarı gerektirmez. Kaynak hatası/okuma sınırı, boş ve tam bir sonuç olarak sunulmaz. Kaynaklar arası atomik anlık görüntü veya otomatik yeniden değerlendirme sağlamaz.

Ayrı [kanıt değişikliği takip akışı](evidence-change-followups.md), Denetim Yönetimi yazma ve Kanıtlar okuma izniyle mevcut talep/çalışma kâğıdı için tarihli görev oluşturur. Editor kendisine, Admin uygun aktif hesaba atar. Kaynak/güncel kanıt sürümü/sabit sürümler/yetkiler kayıt anında yeniden doğrulanır. Migration `0096_evidence_change_followups.sql`, mevcut görev tablosuna tekillik indeksi ve değişmez kaynak izi koruması ekler. Aynı sürüm/kaynak için ikinci görev oluşmaz; geçmişle birlikte atomik kayıt yapılır. Yalnız denetim erişimi olanlar normal görevi görür; kanıt kaynak izi görev ve geçmiş yanıtından çıkarılır. Yeni rapor/kapanış paketleri izi saklar; eski raporlar değişmez. Hatırlatma, tekrar ve bağımsız görev onayı başlangıçta kapalıdır; e-posta taşıma ayarı yalnız mevcut Ayarlar → E-posta ve Bildirimler alanında kalır.

### Görev paketlerinde takvim doğrulaması

Toplu görev taslakları kayıtlı denetim takvimini önizlemeyle kullanabilir. Sunucu seçili görevlerin tamamını kimlikle eşleştirir, her tarihi tekrar hesaplar ve takvim sürümü/tam içeriğini atomik kayıt içinde doğrular. Her görev için önceki/sonraki tarih, ortak gerekçe ve takvim bilgisi oluşturma geçmişine yazılır. Takvim değişikliği, kapanış, yetki kaybı veya geçmiş yazma hatası yarım paket bırakmaz. Editor yalnız kendisine atar; Admin mevcut uygun kullanıcıları seçebilir. Öneri yeni incelemeci, hatırlatma veya tekrar oluşturmaz. Görev listesi ve yetkiler takvim yenilemeyle değiştirilmez. [Paket iş günü planlaması](audit-deadline-planning.md#task-pack-dates).


## Kayıt içe aktarma ve belirsiz yanıt kurtarma

Yeni Excel akışı mevcut Admin/Editor modül yazma yetkilerini kullanır; Viewer doğrudan API ile de içe aktaramaz. Önizleme iş kaydı oluşturmaz. Kaydetme, güncel hesap/rol/erişim politikasını ve kanonik bağlantıları işlem içinde tekrar korur; kapalı denetim kilitleri geçerlidir. Kayıtlar, kayıt kodları ve tekrar deneme makbuzu aynı işlemde kaydedilir. Hata, tüm grubun geri alınmasına yol açar; kod sayaçlarında boşluk oluşabilir.

Tekrar deneme makbuzları mevcut `simple_grc_metadata` tablosunda `core-import:` önekiyle saklanır. Makbuz kullanıcı kimliği, modül, normalize edilmiş içerik özeti ve kayıt sayısını içerir; çalışma kitabını veya hücre değerlerini saklamaz. Bunları rastgele temizlemeyin: silme, eski bir isteğin tekrarında tekilleştirme güvencesini kaldırır. Makbuz, sonradan silinen kayıtları yeniden oluşturmaz. Ayrı şema migrasyonu yoktur; normal veritabanı yedeği makbuzları da içermelidir.

Eski API istemcileri işlem kimliği olmadan uyumlu çalışır; tekrar deneme koruması bu istemciler için geçerli değildir. Eski sürüme dönüldüğünde belirsiz sonuçlu yeni bir içe aktarmayı yeniden göndermeden önce sicili kontrol edin. Gerçek müşteri veri taşıma/UAT ayrı doğrulanmalıdır. [İş akışı ve sınırlar](register-import.md).


## Connected evidence selections: continuity and regulatory workflows

The continuity exercise/gap and regulatory impact forms now select canonical evidence versions and active directory accounts. `/api/workflow-choices` requires a full-access Admin or Editor, matching these enterprise modules; scoped accounts and Viewers cannot use it. Reviewer choices require Admin, and new directory-backed review assignments reject the creating actor. Existing decision independence checks remain enforced server-side.

Migration `0097_workflow_evidence_pins.sql` adds immutable decision snapshots and their event relationship; it does not rewrite historical records. Runtime initialization supports older on-prem databases. Back up the database and evidence storage together. A code rollback can leave the additive table intact. Its references participate in protected core-record deletion.

New UI writes use `assignmentMode: "directory"` and, on evidence decisions, `evidenceMode: "library"` plus `evidenceSelection: { evidenceId, versionId }`. The server derives evidence reference/hash, validates the selected chain against the canonical record anchor, reads the actual file and compares its digest. Live actor/assignee identities, roles, module policies, the canonical record and version metadata are checked again by the atomic SQL claim. SQL-backed file bytes are also bound to that claim. R2/object-storage bytes are verified immediately before the transaction; object storage and SQL do not share a distributed transaction. File hashes do not provide a legal signature or an automated adequacy judgment.

An accepted decision, its event and its evidence pin commit or roll back together. Existing free-text reference/hash API callers remain compatible but do **not** receive a canonical evidence pin. Do not describe those historical references as verified file selections.

Selector limits: 50 evidence records per page with search, up to 1,000 versions per record, and up to 1,000 account search results with an explicit incomplete-list hint. Records above the version limit require administrative review rather than silently selecting a different version. The module response lists latest pins per decision purpose for the bounded records included in that response; every accepted pin remains stored. Decision pins are visible in their source continuity/regulatory rows and in the [Evidence Usage workspace](evidence-usage.md#retained-workflow-decisions). No external collection, notification provider, AI call or telemetry is introduced.

## Decision evidence usage and exact source reads

Evidence Usage adds two read-only sources over `workflow_evidence_pins`, each limited to 200 matching decisions. Full-access authenticated readers, including Viewers, can inspect them; scoped accounts receive restricted coverage without querying enterprise data. Missing tables/corrupt snapshots are unavailable; missing live parents leave retained decisions visible with limited coverage. Do not interpret a historical pin as a current approval. No schema migration or new notification/log setting is required.

Continuity and regulatory GET routes accept validated `focusKind`/`focusId` pairs under their existing access checks. The requested entity and required parents are prioritized within existing list limits, rather than widening access or removing bounds. Invalid identities return 400; unavailable targets produce an explicit empty focus. Usage/focus reads do not alter decisions or lifecycle state. Failed reads clear unverified data and offer retry; obsolete responses cannot overwrite a newer focus. Code rollback leaves existing pin history intact. Production rollout and customer UAT still require separate verification.

## Periodic continuity plan reviews

The existing continuity endpoint adds an exact-plan `view=review&planId=…` read and a `review-plan` action. Reads retain enterprise module authorization; only the active plan's assigned independent active Admin may record a review. The creator, owner and crisis lead are excluded. The atomic SQL claim binds the full observed plan and current actor identity, role, status and module policy. Next dates must be strictly after today (UTC) and the saved review date. Identical request IDs/content replay the original result; conflicting reuse and stale source revisions are rejected.

Migration `0098_continuity_plan_reviews.sql` adds the immutable review table and index, with runtime initialization for older installations. The review snapshot, event and updated date commit or roll back together. Keep review rows in database backups; update/delete triggers protect retained decisions. A code rollback leaves accepted dates and the additive history intact. The UI shows the latest 20 decisions and signals truncation. No notification, log setting, recurrence service or scoped grant is added. [Workflow, recovery and retention](continuity-plan-review.md).
