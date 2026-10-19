# Production Readiness

[Yönetici rehberi](ADMIN-GUIDE.md) · [Test stratejisi](TEST-STRATEGY.md)

Bu belge teknik sürüm doğrulamasını müşteri kurulum kabulünden ayırır. Eski bir başarılı test, sonraki bütün commit'ler veya farklı bir kurulum için otomatik onay değildir.

## Son doğrulanmış uygulama referansı

19 Ekim 2026, `c87540a75e36148c88e7ec44babac5b5943437d6` / [PR #320](https://github.com/jacobevci-lab/Fornost-GRC/pull/320):

| Kanıt | Sonuç / kapsam |
| --- | --- |
| [PR browser QA](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/39313725035) | 324 görünüm, TR/EN, mevcut iki tema, masaüstü/tablet/mobil; sıfır bulgu |
| [Main CI](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/39317262854) | Kalite/build/regresyon, dependency gate ve container/OS kontrolleri başarılı |
| [Canlı smoke](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/39317262828) | Beklenen revision, giriş, sentetik CRUD ve temizlik başarılı |
| [Canlı ürün QA](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/39317262824) | TR 27/27, EN 27/27; 6/6 responsive kontrol; sıfır erişilebilirlik, sayfa, konsol ve HTTP hatası; revision önce/sonra doğrulandı |
| [On-prem paket](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/39317776473) | Aynı pakette Docker/Podman kurulum, veri kalıcılığı ve ayrı volume'a gerçek geri dönüş testi başarılı |

Bunlar otomasyonun tanımlı kapsamındaki sonuçlardır; bütün işlevlerin hatasızlığı, müşteri ölçeği performansı, dış servis kabulü veya zafiyetsizlik garantisi değildir. Artifact saklama süresi nedeniyle eski run ekleri zamanla erişilemeyebilir.

## Her sürümün teknik kapıları

- Lint, TypeScript, production build ve regression test sonuçlarını **aynı commit** üzerinde kontrol edin.
- Migration doğrulaması, canonical şema ve mevcut kurulum başlatma yollarını koruyun.
- Production dependency taramasını ve on-prem image yayınındaki high/critical zafiyet kapısını değerlendirin; tam geliştirme bağımlılık taramasını production-only sonuçla karıştırmayın.
- Değişen kullanıcı akışları için yetki, hata, eşzamanlılık, TR/EN ve responsive kontrolleri uygulayın.
- Dağıtımın revision'ını smoke/full QA öncesinde ve sonrasında doğrulayın.
- Yalnız repo kodu veya belge değişti diye müşteri sunucusunun güncellendiğini varsaymayın.

## Müşteri ortamı kabul listesi

| Alan | Kurulumda kanıtlanması gereken |
| --- | --- |
| Kimlik | Gerçek IdP/bridge, grup→rol eşlemesi, yerel hesap politikası ve yetki reddi; profili kaydetmek SSO kabulü değildir |
| E-posta | Gerçek servis hesabı/test alıcısı, uygulama adresi, görev bağlantısı ve çalışan scheduler; delivery/retry/frekans politikası |
| Ticket | En az ayrıcalıklı hesapla doğru proje/hedefte gerçek işlem |
| Kanıt kaynakları | İzinli dataset, credential kapsamı, test kuralı, tazelik ve başarısız/kısmi veri davranışı |
| AI | Sağlayıcı, veri çıkış politikası, model erişimi ve insan onaylı karar akışı; kullanılıyorsa gerçek ortam kabulü |
| Yedek/kurtarma | Şifreli off-host saklama, eşleşen anahtar/sürüm ve kurum verisiyle ayrı ortam/volume üzerinde geri dönüş |
| Ağ/işletim | DNS, güvenilir TLS, erişim sınırları, kapasite, izleme, alarm ve log saklama/aktarım politikası |
| Veri yönetişimi | Sahiplik, saklama/silme, KVKK/GDPR süreçleri ve dışa aktarılan dosyaların korunması |
| Kullanıcı kabulü | Temsilî risk→kontrol→kanıt→denetim→CAPA akışı; iş sahibi ve güvenlik ekibi onayı |

Yetkili DAST ve kapasite/ölçek testleri kurulumun risk ve yük profiline göre ayrıca yürütülür. CI sonuçları müşteri SMTP/Graph, SSO veya restore UAT sonucunu temsil etmez.

## Geri dönüş

On-prem için [Yedekleme ve Kurtarma](onprem/backup-recovery.md) esas alınır: yedekle eşleşen image, yeni volume, eşleşen anahtar/config, bilinen kayıt ve kanıt indirmesiyle doğrulama. Salt image downgrade şema/veri geri dönüşü değildir. Eski volume ve anahtarları doğrulama bitene kadar koruyun.

Hosted ortamda son sağlıklı uygulama revision'ına dönüş ile D1/R2 kurtarması ayrı planlanır. Şema değişikliği varsa veri uyumluluğunu doğrulamadan eski uygulamayı başlatmayın. Olay zamanı/kapsamını kaydedin; tekrar smoke ve veri bütünlüğü kontrolü yapın.

## Tarihli güvenlik notları

Eski taramalar tarihsel kanıttır; mevcut bağımlılık durumunu güncel lockfile ve aynı commit'in taraması belirler. [3 Ekim Snyk kaydı](security/snyk-20261003.md) bir geçmiş raporudur. CI production-only npm audit kapısı tam geliştirme bağımlılık envanteri için temiz sonucu ifade etmez.

Mammoth için `argparse: 2.0.1` override ve `tests/mammoth-security.test.mjs` dönüşüm/CLI regresyonları bulunur. Bağımlılık yükseltmelerinde override ihtiyacı ve uyumluluk yeniden değerlendirilmelidir.
