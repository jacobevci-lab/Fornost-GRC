# CISO GRC & Assurance Platform

**Proje Durumu:** Başlatıldı  
**Belge Sürümü:** 1.0  
**Tarih:** 5 Ağustos 2026  
**Ürün Sahibi / Alan Uzmanı:** Yakup Evci  
**Ürün Tasarımı ve Geliştirme:** Yakup Evci + Codex

## 1. Proje Vizyonu

Global ölçekte kullanılabilecek; CISO, CIO, CRO, iç denetim, uyum, privacy, teknik güvenlik ekipleri, kontrol sahipleri, tedarikçiler ve dış denetçileri ortak bir veri modeli üzerinde buluşturan bütünleşik Governance, Risk, Compliance, Audit ve Assurance platformu geliştirmek.

Platformun temel ilkesi:

> Bir varlık, risk, kontrol veya kanıt sisteme bir kez girilir; uygun kapsam ve geçerlilik koşulları sağlandığında bütün frameworklerde, denetimlerde ve raporlarda tekrar kullanılır.

Ürün yalnızca framework maddelerine durum işaretlenen bir compliance uygulaması olmayacaktır. Bilgi güvenliği yönetim sistemi, siber güvenlik programı, kurumsal risk, kontrol etkinliği, kanıt, denetim, privacy, üçüncü taraf riski, operasyonel dayanıklılık ve AI governance süreçlerini uçtan uca yönetecektir.

## 2. Değişmez Ürün İlkeleri

1. Bütün hedef ürün baştan tasarlanacak; modüller sonradan yamalanmayacaktır.
2. Geliştirme sırası teknik bağımlılıklara göre yapılacak, fakat veri modeli bütün kapsamı ilk günden destekleyecektir.
3. Framework merkezli değil, ortak kontrol ve yükümlülük grafiği merkezli mimari kullanılacaktır.
4. Kontrolün mevcut olması, tasarım etkinliği, işletim etkinliği, kanıt yeterliliği, uygunluk ve olgunluk ayrı değerlendirilecektir.
5. Kanıtsız veya onaysız hiçbir uygunluk sonucu kesin sonuç olarak gösterilmeyecektir.
6. Manuel skor değişiklikleri gerekçe, yetki ve onay gerektirecektir.
7. Her kritik işlem değiştirilemez denetim izine yazılacaktır.
8. Yapay zekâ karar verici değil, gerekçeli öneri sağlayan yardımcı olacaktır.
9. Türkçe ve İngilizce ilk sürümden itibaren desteklenecektir.
10. SaaS, dedicated tenant, private cloud ve on-prem dağıtım modelleri hedef mimaride desteklenecektir.

## 3. Ürün Alanları

1. Kurumsal yönetişim ve organizasyon hiyerarşisi
2. Enterprise Risk Management
3. Cyber ve IT Risk Management
4. Bilgi Güvenliği Yönetim Sistemi
5. Ortak kontrol kütüphanesi
6. Framework, regülasyon ve yükümlülük yönetimi
7. Denetim ve assurance yönetimi
8. Kanıt kasası ve otomatik kanıt toplama
9. Varlık, veri, hizmet, süreç ve bağımlılık yönetimi
10. Privacy ve veri yönetişimi
11. Üçüncü ve dördüncü taraf risk yönetimi
12. İş sürekliliği, BIA, kriz ve operasyonel dayanıklılık
13. Olay, zafiyet, pentest ve teknik bulgu yönetimi
14. Politika, prosedür, standart ve doküman yönetimi
15. Bulgu, istisna, CAPA, aksiyon ve risk kabul yönetimi
16. Identity Governance, PAM ve erişim gözden geçirme
17. Secure SDLC, AppSec, DevSecOps, cloud ve container güvenliği
18. Güvenlik farkındalığı ve insan kaynakları güvenliği
19. Fiziksel ve çevresel güvenlik
20. AI governance ve AI risk management
21. Regülasyon değişiklik yönetimi
22. Strateji, bütçe, program ve güvenlik yol haritası
23. Yönetim kurulu, CISO ve düzenleyici raporlaması
24. Entegrasyon, workflow, continuous controls monitoring ve compliance-as-code

## 4. Başlangıç Framework ve Regülasyon Kataloğu

### Bilgi ve Siber Güvenlik

- ISO/IEC 27001, 27002, 27005, 27017, 27018 ve 27701
- NIST CSF 2.0
- NIST RMF, SP 800-53, SP 800-30 ve SSDF
- CIS Controls v8.1 ve CIS Benchmarks
- COBIT 2019
- CSA CCM ve CAIQ
- OWASP ASVS, SAMM ve Top 10 aileleri
- MITRE ATT&CK referans eşleştirmeleri
- SLSA ve yazılım tedarik zinciri gereksinimleri

### Finans ve Ödeme Sistemleri

- PCI DSS 4.x, PCI 3DS, PCI SSF ve ilgili PCI programları
- SOC 1 Type I/II
- SOC 2 Type I/II
- SOC 3 ve SOC for Cybersecurity
- SWIFT CSCF
- SOX
- DORA ve bağlı RTS/ITS gereksinimleri
- EBA ICT ve outsourcing gereksinimleri
- FFIEC, NYDFS 23 NYCRR 500, MAS TRM ve APRA CPS 234
- BDDK, TCMB, ödeme ve elektronik para kuruluşu düzenlemeleri

### Privacy ve Veri Koruma

- KVKK ve VERBİS
- GDPR ve UK GDPR
- ISO/IEC 27701
- NIST Privacy Framework
- CCPA/CPRA, LGPD ve HIPAA gereksinimleri
- ROPA, DPIA/PIA, DSAR, saklama-imha ve veri aktarım süreçleri

### Dayanıklılık ve Süreklilik

- ISO 22301 ve ISO 27031
- DORA
- NIS2
- BIA, BCM, Disaster Recovery, Crisis Management ve Operational Resilience
- TLPT, tabletop ve teknik dayanıklılık testleri

### Yapay Zekâ

- EU AI Act
- ISO/IEC 42001 ve ISO/IEC 23894
- NIST AI RMF ve GenAI Profile
- OWASP Top 10 for LLM
- AI sistem/model envanteri, veri kökeni, insan gözetimi, adalet, açıklanabilirlik ve model güvenliği

Framework içerikleri telif ve lisans koşullarına göre açık içerik, lisanslı ürün içeriği veya müşterinin lisanslı içe aktarımı olarak yönetilecektir.

## 5. Çekirdek Alan Modeli

Ana nesneler:

- Organizasyon, şirket, iş birimi ve lokasyon
- İş hedefi, süreç, kritik hizmet ve bağımlılık
- Varlık, veri varlığı, AI sistemi ve tedarikçi
- Yasal/yasal olmayan yükümlülük ve framework maddesi
- Ortak kontrol hedefi ve kuruma özel kontrol uygulaması
- Risk, tehdit, zayıflık ve kayıp olayı
- Kontrol testi, ölçüm, KCI, KRI ve KPI
- Kanıt, kanıt sürümü ve kanıt uygunluk sonucu
- Denetim, denetim planı, çalışma kâğıdı ve örneklem
- Bulgu, istisna, aksiyon, CAPA ve risk kabulü
- Politika, prosedür, standart, sözleşme ve onay
- Olay, zafiyet, test, BIA ve süreklilik planı

Bu nesneler many-to-many ilişkilerle çalışacaktır. Böylece tek kontrol birden fazla riski ve yükümlülüğü; tek kanıt birden fazla kontrolü, dönemi ve denetimi karşılayabilecektir.

## 6. Kanıt ve Denetim Modeli

Her kanıt benzersiz bir kimlik alacaktır: `EVD-YYYY-NNNNNN`.

Kanıt kaydı en az şu bilgileri taşıyacaktır:

- Sahip, sağlayıcı ve onaylayan
- Kaynak sistem ve toplama yöntemi
- Organizasyon, varlık, kontrol ve dönem kapsamı
- Popülasyon ve örneklem kapsamı
- Toplanma ve geçerlilik tarihleri
- Sürüm, SHA-256 hash ve değişmez audit trail
- Gizlilik sınıfı ve kişisel veri durumu
- Saklama süresi, legal hold ve denetçi erişim izni
- Kanıt güven seviyesi ve yeterlilik sonucu

Evidence Eligibility Engine; mevcut kanıtın yeni talebin kontrol hedefini, kapsamını, dönemini, örneklemini, güncelliğini ve güven seviyesini karşılayıp karşılamadığını değerlendirecektir. Geçerli kanıt bulunduğunda tekrar talep açılması engellenecek veya gerekçe gerektirecektir.

Denetim alanı; audit universe, yıllık planlama, bağımsızlık, kapsam, test prosedürü, örneklem, çalışma kâğıdı, kanıt talebi, bulgu, yönetim cevabı, CAPA, doğrulama ve kapanışı destekleyecektir.

## 7. Risk ve Kontrol Değerlendirmesi

Risk modeli yapılandırılabilir olacaktır:

- Doğal, artık ve hedef risk
- Olasılık ve çok boyutlu iş etkisi
- Finansal risk nicelendirme ve FAIR desteği
- Risk iştahı ve tolerans eşikleri
- Risk agregasyonu ve senaryo analizi
- Risk kabul, azaltma, kaçınma, transfer ve izleme kararları
- Maker-checker ve süreli risk kabulü

Kontrol değerlendirmesi:

- Uygulanma durumu
- Tasarım etkinliği
- İşletim etkinliği
- Kapsam yeterliliği
- Otomasyon seviyesi
- Kanıt yeterliliği ve güveni
- İstisna oranı
- Son test sonucu

Basit uygunluk yüzdesi yerine uygulama, etkinlik, kanıt güvencesi, kapsam ve olgunluk ayrı raporlanacaktır.

## 8. Otomasyon ve Entegrasyonlar

API-first connector altyapısı; Microsoft Entra ID, Intune, Defender, Sentinel, Purview, Azure, AWS, GCP, Cortex XDR, Nessus/Tenable, Wazuh, Fortinet, PAM, Active Directory, Jira, ServiceNow, Snipe-IT, GitHub/GitLab, HR, ERP, SIEM ve backup platformlarını destekleyecektir.

Otomatik testler ham kanıtı, normalize edilmiş sonucu, başarısız varlıkları, kontrol sonucunu, zaman damgasını, collector sürümünü ve hash bilgisini birlikte saklayacaktır.

NIST OSCAL uyumlu JSON/YAML/XML içe ve dışa aktarma hedeflenecektir. Policy-as-code, infrastructure-as-code ve CI/CD kontrolleri bağlanabilecektir.

## 9. Güvenlik ve Yetkilendirme

- SSO, MFA ve SCIM
- RBAC ve kapsam/veri sınıfı tabanlı ABAC
- Şirket, iş birimi, lokasyon ve tenant izolasyonu
- Görevler ayrılığı ve maker-checker
- Müşteri bazlı şifreleme ve BYOK/HYOK seçenekleri
- Aktarımda ve saklamada şifreleme
- Append-only audit log
- WORM/Object Lock ve legal hold
- SIEM entegrasyonu
- IP allowlist, oturum ve indirme politikaları
- Veri yerleşimi, saklama, silme ve yedekleme politikaları
- Secure SDLC, SAST, DAST, SCA, secret scanning ve pentest

## 10. Kullanıcı Rolleri

- Platform ve tenant yöneticisi
- CISO, CIO, CRO ve yönetim kurulu görüntüleyicisi
- Risk, compliance, privacy ve BCM yöneticisi
- İç ve dış denetçi
- Kontrol, risk, varlık, süreç ve kanıt sahibi
- İş birimi yöneticisi ve aksiyon sahibi
- Teknik entegrasyon/collector yöneticisi
- Tedarikçi kullanıcısı
- Salt okunur kullanıcı

Yetkiler rolün yanında organizasyon kapsamı, veri sınıfı, kayıt sahipliği ve işlem türüne göre sınırlandırılacaktır.

## 11. Teknik Hedef Mimari

- Responsive web uygulaması
- Türkçe ve İngilizce yerelleştirme
- Modüler monolith başlangıcı ve ayrılabilir domain sınırları
- React/Next.js tabanlı kullanıcı arayüzü
- .NET veya NestJS tabanlı API katmanı
- PostgreSQL ana veri tabanı
- S3 uyumlu kanıt deposu
- OpenSearch arama ve analiz
- Workflow ve event altyapısı
- PDF, Excel, Word ve makine tarafından okunabilir raporlar
- SaaS, dedicated tenant, private cloud ve on-prem dağıtım
- Public API, webhook ve connector SDK

Kesin teknoloji seçimi, Master PRD ve mimari karar kayıtları sırasında performans, güvenlik, geliştirilebilirlik ve dağıtım gereksinimleriyle doğrulanacaktır.

## 12. Codex ile Çalışma Modeli

Codex aşağıdaki görevleri üstlenecektir:

- Global araştırma ve kaynak doğrulama
- Master PRD ve iş kurallarının hazırlanması
- Domain modeli, veri sözlüğü ve veritabanı şeması
- Kullanıcı akışları ve ürün arayüzü tasarımı
- Frontend, backend, API ve entegrasyon kodlaması
- Test, güvenlik kontrolleri ve teknik dokümantasyon
- Çalışan önizlemeler ve sürüm bazlı iyileştirmeler

Yakup Evci aşağıdaki katkıları sağlayacaktır:

- Ürün vizyonu ve öncelikler
- CISO/CIO ve saha gereksinimleri
- Bankacılık, e-ticaret ve kurumsal güvenlik kullanım senaryoları
- Denetim, risk, kanıt ve operasyon örnekleri
- Kullanıcı deneyimi ve iş kuralı doğrulaması
- Ürün kabul kararları

## 13. Teslimat Omurgası

1. Proje Charter
2. Master Product Requirements Document
3. Modül ve özellik kataloğu
4. Persona, rol ve yetki matrisi
5. Domain modeli ve veri sözlüğü
6. İş kuralları ve durum makineleri
7. Risk ve kontrol skorlama spesifikasyonu
8. Kanıt uygunluk motoru spesifikasyonu
9. Denetim ve assurance metodolojisi
10. Framework lisans ve içerik stratejisi
11. Bilgi mimarisi, ekran kataloğu ve kullanıcı akışları
12. Tasarım sistemi ve çalışan arayüz prototipi
13. Teknik mimari ve Architecture Decision Records
14. API sözleşmeleri ve entegrasyon modeli
15. Veritabanı ve güvenlik mimarisi
16. Uygulama kod tabanı
17. Otomatik test ve güvenlik doğrulaması
18. Kurulum, işletim ve ürün dokümantasyonu

## 14. Başarı Kriterleri

- Bir kanıtın uygun olduğu bütün kontrol ve denetimlerde tekrar kullanılabilmesi
- Riskten varlığa, kontrolden kanıta ve bulgudan aksiyona uçtan uca izlenebilirlik
- Kontrol etkinliği ile yalnızca doküman varlığının ayrıştırılması
- Teknik ve insan odaklı kontrollerin ortak modelde yönetilebilmesi
- Çoklu framework çalışmalarında tekrar iş yükünün anlamlı biçimde azaltılması
- Denetim paketi ve kanıt indeksinin otomatik üretilebilmesi
- CISO ve yönetim kuruluna gerekçesi izlenebilir karar desteği verilmesi
- Kurumsal güvenlik, privacy, denetim ve dayanıklılık ekiplerinin aynı platformda çalışabilmesi

## 15. Sıradaki Çalışma

Bir sonraki ana teslimat, bu charter'a bağlı **Master PRD** olacaktır. PRD; bütün modüllerin fonksiyonel gereksinimlerini, kullanıcı hikâyelerini, iş kurallarını, ekranları, durumları, onay akışlarını, raporları, entegrasyonları, güvenlik gereksinimlerini ve kabul kriterlerini tanımlayacaktır.