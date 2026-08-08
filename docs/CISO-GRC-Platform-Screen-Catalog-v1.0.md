# CISO GRC & Assurance Platform — Ekran Kataloğu ve Bilgi Mimarisi

**Belge Kodu:** IA-001  
**Sürüm:** 1.0  
**Tarih:** 5 Ağustos 2026  
**Durum:** Tasarım temeli  
**Ürün Sahibi ve Alan Uzmanı:** Yakup Evci  
**Bağlı Belge:** PRD-001

## 1. Amaç

Bu belge hedef ürünün bilgi mimarisini, navigasyonunu, çalışma alanlarını, ekranlarını ve kritik kullanıcı akışlarını tanımlar. Katalog yalnızca ilk yayınlanacak ekranları değil; tam ürün kapsamını içerir.

## 2. Deneyim İlkeleri

- Ana ekran rol, yetki, görev ve organizasyon kapsamına göre kişiselleştirilir.
- Kullanıcı her sonuçtan kaynak risk, kontrol, yükümlülük, kanıt ve denetim kaydına inebilir.
- “Tanımlı”, “uygulanmış”, “etkin”, “kanıtlanmış” ve “uyumlu” durumları ayrı gösterilir.
- Skorlar açıklanabilir; formül, veri tarihi, kapsam, kanıt ve onay görünürdür.
- Kritik kararlar maker-checker akışı, gerekçe ve audit izi olmadan kesinleşmez.
- Hassas bilgi ekranda, aramada, bildirimde ve export'ta aynı erişim kurallarına tabidir.
- Liste ekranları filtre, kaydedilmiş görünüm, toplu işlem, kolon seçimi ve yetkili export destekler.
- Her kayıt ekranında özet, ilişkiler, görevler, yorumlar, ekler, değişiklik geçmişi ve audit izi bulunur.
- Türkçe ve İngilizce; WCAG 2.2 AA; responsive web ve yönetici mobil görünümü desteklenir.

## 3. Global Uygulama Kabuğu

| Alan | İşlev |
|---|---|
| Tenant/kapsam seçici | Yetkili şirket, iş birimi, lokasyon ve dönem bağlamını değiştirir |
| Global arama | Yetki filtreli birleşik kayıt, kontrol, risk, kanıt ve doküman araması |
| Oluştur menüsü | Yetkiye göre risk, kanıt, talep, bulgu, aksiyon ve diğer kayıtları açar |
| Görev merkezi | Onaylar, atamalar, gecikmeler, mention ve takip işleri |
| Bildirim merkezi | Sistem ve workflow bildirimleri; hassas içerik maskeleme |
| Yardım ve bağlam | Alan açıklaması, metodoloji, sözlük ve süreç rehberi |
| Kullanıcı menüsü | Dil, erişilebilirlik, oturumlar, vekâlet ve tercih ayarları |
| Breadcrumb | Organizasyon ve nesne hiyerarşisini gösterir |
| Kayıt yan paneli | İlişkili nesneleri sayfadan ayrılmadan hızlı inceleme |

## 4. Ana Navigasyon

1. Ana Sayfa
2. Yönetişim
3. Risk
4. Varlıklar ve Hizmetler
5. Kontroller
6. Uyum ve Yükümlülükler
7. Kanıt ve Assurance
8. Denetim
9. Bulgular ve Aksiyonlar
10. Privacy
11. Tedarikçi Riski
12. Dayanıklılık ve BCM
13. Güvenlik Operasyonları
14. Politika ve Farkındalık
15. AI Governance
16. Strateji ve Yatırım
17. Raporlar
18. Entegrasyonlar
19. Yönetim

Navigasyonda modül görünürlüğü role göre değişir; doğrudan URL erişimi ayrıca sunucu tarafında yetkilendirilir.

## 5. Ekran Kataloğu

### 5.1 Ana Sayfa ve Ortak Çalışma

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| HOME-001 | Kişisel ana sayfa | Görevler, onaylar, gecikmeler, takip edilen kayıtlar, hızlı oluşturma |
| HOME-002 | CISO/CIO cockpit | Top riskler, iştah aşımı, kontrol etkinliği, açık kritik bulgular, yatırım görünümü |
| HOME-003 | Yönetim kurulu görünümü | Eğilimler, kritik hizmet riski, karar ihtiyacı, sade yönetim özeti |
| HOME-004 | İkinci hat görünümü | Challenge bekleyen riskler, istisnalar, kontrol ve kanıt boşlukları |
| HOME-005 | Denetçi çalışma alanı | Atanmış denetimler, talepler, workpaper ve bulgular |
| HOME-006 | Teknik ekip görünümü | Kanıt talepleri, collector hataları, teknik bulgular ve SLA |
| COM-001 | Evrensel arama | Yetki kontrollü sonuçlar, facet, kayıt önizleme, kaydedilmiş arama |
| COM-002 | Görev merkezi | Atanan/oluşturulan/delege edilen görevler, toplu işlem |
| COM-003 | Onay kutusu | Maker-checker kararları, karşılaştırma, gerekçe ve e-imza opsiyonu |
| COM-004 | Bildirim merkezi | Okundu/takip/ertelemeli bildirimler ve kanal tercihleri |
| COM-005 | Takvim | Denetim, review, test, kanıt, politika, tatbikat ve aksiyon tarihleri |

### 5.2 Yönetişim ve Organizasyon

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| GOV-001 | Organizasyon ağacı | Tenant, tüzel kişilik, birim, ekip, lokasyon ve tarihsel hiyerarşi |
| GOV-002 | Organizasyon detay | Sahipler, kapsam, bağlı hedef/risk/kontrol ve tarihçe |
| GOV-003 | Stratejik hedefler | Hedef–risk–program–metrik ilişkileri |
| GOV-004 | Komite ve toplantılar | Üyeler, gündem, karar, aksiyon, quorum ve tutanak |
| GOV-005 | RACI ve Three Lines | Süreç/modül bazlı sorumluluk ve hat çakışmaları |
| GOV-006 | Risk iştahı ve tolerans | Beyanlar, ölçütler, eşikler, ihlaller ve yönetim onayı |
| GOV-007 | Yasal yükümlülük sicili | Regülatör, mevzuat, sorumlu, bildirim ve periyodik görevler |
| GOV-008 | Regulatory change inbox | Değişiklik alımı, etki analizi, kontrol/aksiyon bağlantısı |
| GOV-009 | Sertifikasyon yaşam döngüsü | Kapsam, kuruluş, denetimler, sertifika, gözetim ve yenileme |

### 5.3 Risk Yönetimi

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| RSK-001 | Risk kayıtları | Taksonomi, sahip, skor, iştah, durum ve filtreler |
| RSK-002 | Risk oluşturma sihirbazı | Bağlam, senaryo, etki, olasılık, kapsam, sahibi ve submit |
| RSK-003 | Risk 360 | Doğal/artık/hedef risk, kontroller, kanıt, bulgu, aksiyon, karar |
| RSK-004 | Risk değerlendirmesi | Nitel/nicel skor, etki boyutları, challenge ve karşılaştırma |
| RSK-005 | Tedavi planı | Azalt/kabul/kaçın/transfer/izle; maliyet, hedef ve aksiyonlar |
| RSK-006 | Risk kabulü | Süre, gerekçe, telafi edici kontrol, onay zinciri ve expiry |
| RSK-007 | Risk workshop | Katılımcı görüşleri, oylama, uzlaşma ve tutanak |
| RSK-008 | Heatmap ve agregasyon | Organizasyon, hizmet, kategori ve ortak neden kırılımları |
| RSK-009 | KRI/Kayıp olayları | Eşikler, trend, ihlal, olay ve risk yeniden değerlendirme |
| RSK-010 | FAIR analizi | Frekans, büyüklük, dağılımlar, senaryolar ve simülasyon sonucu |

### 5.4 Varlık, Süreç, Hizmet ve Veri

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| AST-001 | Envanter | Varlık türleri, sahip, kaynak, kritiklik, yaşam döngüsü |
| AST-002 | Varlık 360 | Risk, kontrol, zafiyet, veri, tedarikçi ve bağımlılıklar |
| AST-003 | Kritik hizmet kataloğu | Önem derecesi, sahip, müşteri/ülke ve dayanıklılık hedefleri |
| AST-004 | Süreç kataloğu | Süreç/alt süreç, RACI, varlık/veri ve kontrol bağlantıları |
| AST-005 | Bağımlılık haritası | Yukarı/aşağı bağımlılık, SPOF ve etki analizi |
| AST-006 | Veri varlığı ve sınıflandırma | Veri sahibi, sınıf, yerleşim, kişisel veri, yaşam döngüsü |
| AST-007 | Kapsam yöneticisi | ISO, PCI CDE, DORA, SOC ve özel kapsam dahil/dışlama |
| AST-008 | CMDB mutabakatı | Kaynak eşleme, duplicate, orphan, değişiklik ve onay |

### 5.5 Kontroller

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| CTL-001 | Unified Control Library | Kontrol hedefleri, aile, tür, mapping ve versiyon |
| CTL-002 | Kontrol hedefi 360 | Yükümlülükler, riskler, uygulamalar, kanıt ve test şablonları |
| CTL-003 | Kontrol uygulaması | Kuruma özel prosedür, kapsam, sahip, sıklık ve bağımlılıklar |
| CTL-004 | Kontrol uygulama sihirbazı | Hedef seçimi, kapsam, sahip, test, kanıt ve workflow |
| CTL-005 | Kontrol değerlendirmesi | Tasarım, kapsam, işletim etkinliği ve assurance sonucu |
| CTL-006 | Test planı ve prosedürü | Popülasyon, örneklem, adımlar, beklenen sonuç ve kanıt |
| CTL-007 | Test yürütme çalışma alanı | Adımlar, örneklem, workpaper, exception ve sonuç |
| CTL-008 | Kontrol bağımlılık haritası | Ana/devralınan/telafi edici kontrol ve arıza etkisi |
| CTL-009 | KCI/KPI izleme | Ölçüm, eşik, trend, ihlal ve otomatik test bağlantısı |
| CTL-010 | Kontrol değişiklik etkisi | Versiyon farkı, etkilenen mapping/risk/test ve onay |

### 5.6 Framework, Regülasyon ve Uyum

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| CMP-001 | Framework kataloğu | Standart, regülasyon, versiyon, lisans ve yürürlük |
| CMP-002 | Yükümlülük ağacı | Madde/alt madde, rehber, kaynak, applicability ve mapping |
| CMP-003 | Applicability değerlendirmesi | Şirket/sektör/ülke/kapsam ve uygulanamazlık onayı |
| CMP-004 | Cross-mapping stüdyosu | Yükümlülük–kontrol eşleştirme, güven, gerekçe, uzman onayı |
| CMP-005 | Gap assessment | Kapsam, uygulama, etkinlik, kanıt, gap ve aksiyon |
| CMP-006 | SoA çalışma alanı | ISO kontrol kararı, gerekçe, uygulama, sahip ve kanıt |
| CMP-007 | Uyum görünümü | Doğrulanmış/kanıtsız/uygulanamaz/eksik durumlar; drill-down |
| CMP-008 | Versiyon etki analizi | Yeni/eski framework farkı, etkilenen kontroller ve görevler |
| CMP-009 | OSCAL import/export | Profil, katalog, plan, sonuç doğrulama ve hata raporu |

### 5.7 Kanıt ve Assurance

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| EVD-001 | Kanıt kasası | ID, kaynak, kapsam, dönem, güven, durum, sınıf ve expiry |
| EVD-002 | Kanıt 360 | Önizleme, metadata, hash, sürüm, kullanım, erişim ve audit izi |
| EVD-003 | Kanıt yükleme/toplama | Dosya/API/beyan, kapsam, dönem, popülasyon ve güvenlik taraması |
| EVD-004 | Kanıt talepleri | Talep, sağlayıcı, due date, mevcut kanıt önerisi ve durum |
| EVD-005 | Talep yanıt alanı | Mevcut kanıt seç, yeni sağla, metadata tamamla, açıklama |
| EVD-006 | Eligibility review | 11 karar boyutu, uygunluk sonucu, çakışma ve reviewer kararı |
| EVD-007 | Kanıt yeniden kullanım görünümü | Kanıtın karşıladığı kontrol, talep, denetim ve dönemler |
| EVD-008 | Redaksiyon ve paylaşım | Maskeleme, watermark, indirme izni, dış denetçi görünümü |
| EVD-009 | Bütünlük ve saklama | Hash doğrulama, Object Lock, legal hold, retention ve expiry |
| EVD-010 | Assurance özeti | Kanıt güveni, test bağımsızlığı, kapsam ve sonuç güven seviyesi |

### 5.8 Denetim

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| AUD-001 | Audit universe | Denetlenebilir birimler, risk, son denetim ve coverage |
| AUD-002 | Yıllık/çok yıllı plan | Risk bazlı öncelik, kapasite, bağımsızlık ve komite onayı |
| AUD-003 | Denetim listesi | Tür, kapsam, dönem, ekip, durum ve risk |
| AUD-004 | Denetim 360 | Amaç, kapsam, ekip, takvim, talepler, workpaper, bulgu ve rapor |
| AUD-005 | Planlama ve program | Metodoloji, kontrol evreni, test planı ve örneklem |
| AUD-006 | PBC/kanıt talep yönetimi | Talep listesi, duplicate önleme, iletişim ve escalation |
| AUD-007 | Workpaper editörü | Test adımları, referans, reviewer note, sign-off ve lock |
| AUD-008 | Örneklem yöneticisi | Popülasyon, yöntem, seed, örnekler ve sapmalar |
| AUD-009 | Denetçi review/sign-off | Hazırlayan–inceleyen ayrımı, review note ve kapanış |
| AUD-010 | Bulgu taslağı | Kriter, koşul, neden, etki, risk, öneri ve yönetim cevabı |
| AUD-011 | Rapor oluşturucu | Taslak, kalite kontrol, yönetim cevabı, yayın ve dağıtım |
| AUD-012 | Denetim takip | Aksiyon doğrulama, tekrar bulgu, kapanış ve komite raporu |
| AUD-013 | Dış denetçi portalı | İzole kapsam, kontrollü görüntüleme, soru ve watermark |
| AUD-014 | Kanıt paketi oluşturucu | İndeks, hash, kapsam, kontroller, testler, bulgular ve aksiyonlar |

### 5.9 Bulgular, CAPA, İstisna ve Aksiyon

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| FND-001 | Birleşik bulgu kayıtları | Denetim, zafiyet, olay, kontrol, vendor ve privacy kaynakları |
| FND-002 | Bulgu 360 | Kriter, durum, neden, etki, risk, kanıt, aksiyon ve tarihçe |
| FND-003 | Kök neden analizi | 5 Why/balık kılçığı, ortak neden ve tekrar bulgu bağlantısı |
| FND-004 | CAPA planı | Düzeltme, düzeltici/önleyici aksiyon, sahip, SLA ve etkinlik |
| FND-005 | Kapanış doğrulama | Kapanış kanıtı, bağımsız doğrulama, sonuç ve yeniden açma |
| FND-006 | İstisna yönetimi | Politika/kontrol istisnası, risk, telafi edici kontrol ve expiry |
| FND-007 | Aksiyon merkezi | Tüm modüllerden aksiyonlar, bağımlılık, SLA ve toplu takip |
| FND-008 | Gecikme ve escalation | Yaşlandırma, hatırlatma, escalation ve yönetim görünümü |

### 5.10 Privacy ve Veri Yönetişimi

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| PRV-001 | ROPA | İşleme faaliyeti, amaç, hukuki sebep, veri, taraflar ve saklama |
| PRV-002 | ROPA 360 | Sistem, süreç, tedarikçi, aktarım, kontrol, risk ve kayıtlar |
| PRV-003 | DPIA/PIA | Screening, risk, tedbir, DPO görüşü ve onay |
| PRV-004 | DSAR vaka yönetimi | Kimlik doğrulama, keşif, istisna, yanıt ve süre |
| PRV-005 | Veri aktarımı/TIA | Ülke, mekanizma, alıcı, risk, ek tedbir ve review |
| PRV-006 | Saklama ve imha | Kural, veri kategorisi, sistem, legal hold ve imha kanıtı |
| PRV-007 | Consent/preference | Rıza metni/sürüm, kaynak, withdrawal ve kanıt |
| PRV-008 | Privacy incident | İhlal değerlendirmesi, etkilenen kişi, bildirim ve karar |
| PRV-009 | VERBİS/KVKK görünümü | Envanter karşılaştırma, yükümlülük, gap ve çıktı |

### 5.11 Tedarikçi ve Dördüncü Taraf Riski

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| TPR-001 | Tedarikçi envanteri | Tier, hizmet, veri, ülke, sahip, sözleşme ve risk |
| TPR-002 | Tedarikçi 360 | Due diligence, bulgu, olay, sözleşme, dördüncü taraf ve exit |
| TPR-003 | Onboarding/tiering | Kritiklik, veri/erişim, bağımlılık ve review seviyesi |
| TPR-004 | Anket ve portal | Şablon, cevap, kanıt, yorum, scoring ve remediation |
| TPR-005 | Due diligence | Finansal, siber, privacy, dayanıklılık, yaptırım ve assurance |
| TPR-006 | Sözleşme gap | Clause library, zorunlu madde, istisna ve hukuk onayı |
| TPR-007 | Sürekli izleme | Sertifika, olay, rating, SLA, kanıt expiry ve değişiklik |
| TPR-008 | Konsantrasyon/fourth-party | Coğrafya, teknoloji, ortak alt yüklenici ve kritik bağımlılık |
| TPR-009 | Exit stratejisi | Veri dönüş/silme, geçiş, continuity, test ve onay |

### 5.12 BCM, Kriz ve Operasyonel Dayanıklılık

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| BCM-001 | BIA kataloğu | Süreç/hizmet, etkiler, MTPD, RTO, RPO ve bağımlılıklar |
| BCM-002 | BIA çalışma alanı | Zaman dilimli etki, minimum kaynak, onay ve tarihçe |
| BCM-003 | Süreklilik planları | Strateji, prosedür, rol, iletişim, bağımlılık ve sürüm |
| BCM-004 | DR planı ve test | Sistem, RTO/RPO, senaryo, sonuç, sapma ve aksiyon |
| BCM-005 | Kriz yönetimi | Olay odası, rol, karar günlüğü, iletişim ve aksiyon |
| BCM-006 | Tatbikat yöneticisi | Senaryo, inject, katılımcı, gözlem, sonuç ve lessons learned |
| BCM-007 | Dayanıklılık görünümü | Impact tolerance, hizmet haritası, test coverage ve breach |
| BCM-008 | DORA register/TLPT | ICT hizmet/sözleşme kayıtları, test kapsamı ve bulgular |

### 5.13 Güvenlik Operasyonları ve Teknik Güvence

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| SEC-001 | Zafiyet görünümü | Scanner kaynakları, varlık, severity, exploitability, SLA ve risk |
| SEC-002 | Zafiyet/teknik bulgu 360 | Kaynak, kanıt, risk, exception, remediation ve doğrulama |
| SEC-003 | Pentest/red team | Kapsam, rules of engagement, bulgu, retest ve rapor |
| SEC-004 | Olay kayıtları | Severity, hizmet/varlık, kök neden, kayıp ve kontrol etkisi |
| SEC-005 | Regülatör bildirimleri | Eşik, süre, karar, taslak, onay ve gönderim kanıtı |
| SEC-006 | IAM/access review | Kapsam, reviewer, karar, revocation, exception ve kanıt |
| SEC-007 | SoD/PAM görünümü | Çakışma, ayrıcalıklı hesap, kasa kapsamı ve review |
| SEC-008 | AppSec/SDLC assurance | Uygulama, pipeline, SAST/DAST/SCA, threat model ve release gate |
| SEC-009 | Cloud/container posture | Hesap/abonelik, benchmark, misconfiguration ve exception |
| SEC-010 | Güvenlik kontrol coverage | EDR/SIEM/DLP/WAF/backup/log coverage, veri gecikmesi ve boşluk |

### 5.14 Politika, Farkındalık, HR ve Fiziksel Güvenlik

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| POL-001 | Doküman kütüphanesi | Politika/prosedür/standart, sahip, sürüm, review ve sınıf |
| POL-002 | Doküman editörü | Şablon, değişiklik karşılaştırma, yorum, onay ve yayın |
| POL-003 | Attestation kampanyası | Hedef kitle, sürüm, okuma/onay, hatırlatma ve kanıt |
| POL-004 | Eğitim kataloğu | Eğitim, hedef kitle, geçerlilik, sınav ve kontrol bağlantısı |
| POL-005 | Farkındalık kampanyası | Atama, tamamlanma, phishing sonucu, istisna ve trend |
| POL-006 | HR güvenlik kontrolleri | Joiner/mover/leaver, screening, görev ayrılığı ve kanıt |
| POL-007 | Fiziksel/çevresel değerlendirme | Tesis, erişim, CCTV, enerji, yangın, test ve bulgular |

### 5.15 AI Governance

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| AIG-001 | AI sistem/model envanteri | Amaç, sahibi, sağlayıcı, kullanıcı, veri, ülke ve yaşam döngüsü |
| AIG-002 | AI use-case intake | Yasak/yüksek/sınırlı risk screening, etki ve onay |
| AIG-003 | AI risk assessment | Güvenlik, privacy, bias, insan gözetimi, açıklanabilirlik |
| AIG-004 | Model/data lineage | Model sürümü, eğitim/veri kaynağı, evaluation ve değişiklik |
| AIG-005 | AI kontrol ve testleri | Red team, benchmark, guardrail, monitoring ve kanıt |
| AIG-006 | AI olayları | Harm, leakage, drift, abuse, karar ve bildirim |
| AIG-007 | AI Act/42001 görünümü | Sınıflandırma, yükümlülük, teknik dosya, gap ve assurance |

### 5.16 Strateji, Program, Bütçe ve Raporlama

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| STR-001 | Güvenlik stratejisi | Hedef, capability, risk, girişim, sahip ve dönem |
| STR-002 | Yol haritası/program | İş paketleri, bağımlılık, milestone, risk azaltımı ve durum |
| STR-003 | Bütçe ve yatırım | CapEx/OpEx, senaryo, fayda, risk azaltımı ve karar |
| STR-004 | Kontrol/ürün coverage | Güvenlik ürünü–kontrol–varlık–maliyet bağlantısı |
| RPT-001 | Rapor merkezi | Rol ve yetkiye göre rapor kataloğu, zamanlama ve geçmiş |
| RPT-002 | Dashboard oluşturucu | Onaylı veri seti, widget, filtre, paylaşım ve sürüm |
| RPT-003 | Yönetim kurulu paketi | Dönem, yorum, karar talebi, appendix ve yayın |
| RPT-004 | Denetim/kanıt paketi | Paket ağacı, indeks, hash, watermark ve erişim |
| RPT-005 | Export iş merkezi | Asenkron üretim, approval, expiry, indirme ve audit |

### 5.17 Entegrasyonlar ve Yönetim

| ID | Ekran | Ana içerik/işlem |
|---|---|---|
| INT-001 | Connector kataloğu | Entra, Intune, Defender, Sentinel, Nessus, Cortex, Wazuh, Fortinet, PAM ve diğerleri |
| INT-002 | Connector kurulum sihirbazı | Yetki, secret referansı, kapsam, sıklık ve least-privilege kontrolü |
| INT-003 | Collector sağlık görünümü | Son çalışma, gecikme, hata, retry, veri hacmi ve uyarı |
| INT-004 | Veri eşleme stüdyosu | Kaynak alan, hedef nesne, dönüşüm, dry-run ve reconciliation |
| INT-005 | CCM kural oluşturucu | Sorgu/policy, kapsam, eşik, kontrol, bulgu ve zamanlama |
| INT-006 | API/webhook yönetimi | Client, scope, anahtar rotasyonu, rate limit ve log |
| ADM-001 | Tenant ayarları | Yerelleştirme, dönem, veri lokasyonu, özellik ve retention |
| ADM-002 | Kullanıcı ve grup yönetimi | SCIM durumu, atama, askıya alma, vekâlet ve oturum |
| ADM-003 | Rol ve erişim politikaları | RBAC, ABAC, scope, hassasiyet, SoD ve test modu |
| ADM-004 | Workflow tasarımcısı | Durum, görev, onay, SLA, escalation ve versiyon |
| ADM-005 | Taksonomi ve referans veri | Risk, varlık, etki, sınıf, durum ve kontrollü sözlük |
| ADM-006 | Numaralandırma ve şablonlar | Risk/kanıt/denetim ID, doküman, e-posta ve rapor şablonları |
| ADM-007 | Audit log viewer | Append-only olay, korelasyon, SIEM export ve yetkili inceleme |
| ADM-008 | Veri yaşam döngüsü | Retention, legal hold, silme/anonimleştirme ve onay |
| ADM-009 | İçe aktarma ve göç | Excel mapping, dry-run, validation, rollback ve mutabakat |
| ADM-010 | Sistem sağlık ve özellik bayrakları | Versiyon, job, kapasite, feature flag ve bakım |

## 6. Standart Kayıt Sayfası Şablonu

Her ana nesne için tutarlı sekmeler kullanılır:

1. Özet
2. Kapsam ve sahiplik
3. Değerlendirme/sonuç
4. İlişkiler ve izlenebilirlik grafiği
5. Kanıt ve ekler
6. Görevler/aksiyonlar
7. Yorumlar ve kararlar
8. Sürümler/değişiklikler
9. Audit izi

Eylem menüsü, kullanıcının izin ve kayıt durumuna göre sunucu tarafından üretilir. Hassas sekmeler görünürlükten kaldırılmakla kalmaz; API düzeyinde engellenir.

## 7. Kritik Uçtan Uca Kullanıcı Akışları

### UF-001 Riskten kontrole ve aksiyona

1. Risk sahibi kritik hizmet/varlık bağlamında risk taslağı oluşturur.
2. İkinci hat metodoloji ve skoru challenge eder.
3. Yetkili approver riski onaylar.
4. Kontrol sahibi mevcut uygulamaları bağlar veya yeni uygulama tanımlar.
5. Kontrol testi yetersiz sonuç verirse bulgu ve CAPA açılır.
6. Aksiyon sahibi kapanış kanıtı sağlar.
7. Bağımsız doğrulayıcı kapanışı onaylar; risk yeniden hesaplanır fakat otomatik düşürülmez.

### UF-002 Kanıtın bir kez toplanıp yeniden kullanılması

1. Denetçi veya kontrol testi bir kanıt talebi oluşturur.
2. Eligibility Engine mevcut kanıtları kapsam, dönem, popülasyon, örneklem, güven ve izinle karşılaştırır.
3. Uygun kanıt önerilirse requester gerekçeli kabul/reddetme kararı verir.
4. Yeni kanıt gerekirse sağlayıcı metadata ile yükler veya collector toplar.
5. Güvenlik taraması ve reviewer onayı tamamlanır.
6. Onaylı kanıt, uygun olduğu kontrol/denetim/framework taleplerinde tekrar kullanılır.
7. Kapsam veya süre değişirse bağlı sonuçlar “inceleme gerekli” durumuna düşer.

### UF-003 İç denetim yaşam döngüsü

1. Audit universe ve risk değerlendirmesinden plan önerisi üretilir.
2. Denetim yöneticisi kapsam, ekip ve bağımsızlığı doğrular.
3. Program, test ve PBC listesi hazırlanır.
4. Workpaper'lar preparer/reviewer sign-off ile kilitlenir.
5. Bulgular yönetim cevabı ve CAPA ile rapora alınır.
6. Rapor yetkili onaydan sonra yayımlanır.
7. Takip testinde kapanış kanıtı bağımsız doğrulanır.

### UF-004 Framework onboarding ve gap assessment

1. Framework sürümü ve lisans modeli tanımlanır.
2. Applicability şirket/ülke/sektör/kapsam bazında değerlendirilir.
3. Yükümlülükler ortak kontrol hedeflerine eşleştirilir ve uzman onayından geçer.
4. Kuruma özel kontrol uygulamaları, testler ve kanıtlar bağlanır.
5. Sistem doğrulanmış, kanıtsız, eksik ve uygulanamaz sonuçları ayrı gösterir.
6. Gap'ler aksiyon planına dönüşür; SoA/uyum raporu onayla yayımlanır.

### UF-005 Tedarikçi onboarding ve sürekli izleme

1. İş sahibi hizmet, veri, erişim ve kritikliği girer.
2. Sistem tier ve gerekli due-diligence paketini önerir.
3. Tedarikçi izole portalda anket ve kanıt sağlar.
4. Risk/Privacy/BCM/Hukuk incelemeleri paralel yürür.
5. Sözleşme gap ve telafi edici önlemler onaylanır.
6. Onboarding kararı maker-checker ile verilir.
7. Sertifika, olay, rating, kanıt ve sözleşme süreleri sürekli izlenir.

### UF-006 BIA'dan dayanıklılık testine

1. Süreç sahibi zaman dilimli etki ve minimum kaynakları tanımlar.
2. BCM yöneticisi RTO/RPO/MTPD tutarlılığını challenge eder.
3. Hizmet–uygulama–altyapı–tedarikçi bağımlılıkları bağlanır.
4. Süreklilik/DR planı ve test senaryosu oluşturulur.
5. Tatbikat sonucu sapma ve bulgu üretir.
6. Kapanış sonrası hedefler yeniden doğrulanır ve yönetim raporuna yansır.

### UF-007 Privacy işleme faaliyeti ve DPIA

1. Süreç sahibi ROPA kaydı açar.
2. Veri kategorisi, ilgili kişi, amaç, hukuki sebep, sistem, taraf ve aktarım bağlanır.
3. Screening yüksek risk gösterirse DPIA zorunlu olur.
4. Privacy riskleri ve tedbirler kontrol uygulamalarına bağlanır.
5. DPO görüşü ve yetkili onay kaydedilir.
6. Değişiklik, olay veya review tarihi yeniden değerlendirme tetikler.

### UF-008 Teknik kaynaktan otomatik kontrol testi

1. Entegrasyon yöneticisi least-privilege connector kurar.
2. CCM kuralı kaynak sorgu, kapsam, kontrol ve eşikle ilişkilendirilir.
3. Çalışma ham kanıt, normalize sonuç ve etkilenen varlıkları üretir.
4. Başarısız kayıtlar exception kontrolünden geçer.
5. Eşiğe göre kontrol sonucu ve bulgu önerilir.
6. İnsan reviewer sonucu onaylar; otomatik veri tek başına uygunluk ilan etmez.

## 8. Tasarım ve Prototip Önceliği

İlk çalışan prototip aşağıdaki ekran zincirini gerçek veriye hazır biçimde kapsar:

`HOME-002 → AST-003/AST-002 → RSK-002/RSK-003 → CTL-002/CTL-003 → EVD-004/EVD-006 → CTL-007 → FND-002/FND-005 → AUD-014`

Paralel platform temeli: `ADM-002`, `ADM-003`, `ADM-004`, `ADM-007`, `INT-003`.

## 9. Kabul Kriterleri

- Tüm PRD ürün alanlarının en az bir yönetim ve bir detay/işlem ekranı vardır.
- Her kritik ekranın persona, veri kapsamı, izin ve audit gereksinimi IAM-001 ile eşleşir.
- Uyum yüzdesi kanıt ve assurance durumundan bağımsız, yanıltıcı tek sayı olarak gösterilmez.
- Kullanıcı bir yönetim metriğinden kaynak kayda ve kanıta kadar drill-down yapabilir.
- Dış denetçi ve tedarikçi portalları tenant içi standart kullanıcılardan izole edilir.
- Kritik export, onay, kapanış ve kapsam dışı kararları maker-checker uygular.
