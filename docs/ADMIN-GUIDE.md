# Fornost GRC Yönetici Rehberi

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

Denetim bazında **Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon** alanı kullanılır. Takvim günü/iş günü, çalışma günleri, elle girilen tatiller, hatırlatma eşikleri ve tek eskalasyon alıcısı seçilebilir. İş günü modunda çalışma dışı günlerde bildirim bekler; asıl teslim/review tarihi değişmez. Eskalasyon sahipliği veya erişim yetkisini devretmez. Ortak kurum takvimi, tatil servisi, çok seviyeli eskalasyon ve digest mevcut kapsam değildir.

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

Optional paired preparation/review deadlines use each workpaper's IANA time zone. Legacy undated records need no migration. Dates participate in existing revision-checked draft writes, history, report integrity and closed-audit restrictions. My Work switches to the review deadline after submission and removes active deadlines for approved/cancelled work. Older clients that omit scheduling fields preserve saved dates. This feature does not queue email; workpaper reminder transport remains out of scope. See [Audit workpapers](audit-workpapers.md#preparation-and-review-deadlines).

### Dashboard operational data loading

The collapsed operational detail does not fetch delivery/owner history. Opening it loads the current sources with a 15-second deadline, and closing it cancels pending requests. Failed sources are explicitly unavailable rather than zero; successful sources remain visible and Retry refreshes both. This keeps background operational reads from blocking initial dashboard loading. Email configuration remains in Email & Notifications.

### Çalışma kâğıdı termin hatırlatmaları

Çalışma kâğıdı taslağında **E-posta hatırlatmaları** varsayılan kapalıdır ve iki termin gerektirir. Denetim bazlı hatırlatma profili, çalışma günleri/tatiller ve eskalasyon ayarları kullanılır. Hazırlamada sorumlu, incelemede inceleyen hedeflenir. Alıcı aktif olmalı, denetime yazma ve kanıtlara okuma yetkisi bulunmalıdır. Gönderim öncesinde güncel kayıt/profil/süreç/yetki tekrar doğrulanır. Kaydetme ile eski kuyruk atomik geri çekilir; kuyruk oluşturma başarısızsa kayıt korunur ve arayüz zamanlayıcının yeniden deneyeceğini bildirir. Onay/iptal, denetim kapanışı ve yetki kaybı gönderimi durdurur. Mevcut e-posta transport, retry/rate-limit ve uygulama URL ayarları geçerlidir. Kimlikler ve termin dışında örneklem veya kanıt içeriği e-postaya taşınmaz. 5.000 aktif ve hatırlatması açık çalışma kâğıdı kaynak sınırı aşılırsa işlem açık hata verir; müşteri mail altyapısında UAT ayrıca yapılmalıdır.

### Denetimler arasında takvim aktarımı

**Denetim → Talepler ve inceleme → Hatırlatma takvimi ve eskalasyon → Hatırlatma profilini düzenle → Takvimi başka denetimde kullan** bölümünden taslak takvimi JSON olarak indirebilirsiniz. Dosya yalnızca gün hesabını, çalışma günlerini ve tatil tarihlerini içerir; kişi, denetim kimliği, bildirim eşiği veya eskalasyon alıcısı içermez.

Başka denetimde dosyayı seçin veya JSON içeriğini yapıştırıp önizleyin. **Takvimi taslağa uygula**, bu üç alanı değiştirir; tatilleri birleştirmez. Hedef denetimin bildirim eşikleri, eskalasyon sorumlusu ve terminleri korunur. Son olarak **Hatırlatma profilini kaydet** ile kalıcı hale getirin. Kaydetmeden vazgeçerseniz kayıt değişmez. Kaydetmede mevcut yetki, kapalı denetim ve eşzamanlı değişiklik kontrolleri uygulanır; bekleyen bildirimler yeniden değerlendirilir. Aktarım bir kopyadır: kaynak takvim daha sonra değişirse hedef denetimler otomatik güncellenmez. En fazla 16 KB dosya ve 366 benzersiz geçerli tatil tarihi desteklenir; merkezi takvim kütüphanesi ve resmi tatil servisi değildir.


### Toplu denetim görevleri

Görev paketi, aynı denetimde seçili başlangıç görevlerini tek işlemde oluşturur. Admin aktif denetim yazarı seçebilir; Editor yalnız kendisine atar. Kayıt anında hesap/grant ve görev grafiği tekrar doğrulanır; kapalı denetim ve tarihçe hatalarında işlem geri alınır. Paket API’si 1–12 kayıtla ve denetim başına 100 toplam görevle sınırlıdır. Mevcut kayıtlar değiştirilmez; hatırlatmalar/tekrar kapalı başlar. Bir bağlantı hatasından sonra önce listeyi yeniden yükleyin; aynı paket kimlikleri tekrar oluşturulamaz. Merkezi şablon yönetimi ve otomatik tarih planlaması bu özelliğin kapsamında değildir.
