# Enterprise Security Incident & Crisis Management

Fornost Güvenlik Olayları ve Kriz Merkezi, kurumsal güvenlik olaylarını ilan aşamasından bağımsız kapanışa kadar tek kanıtlı komuta zincirinde yönetir.

## Yaşam döngüsü

1. Olay `declared` durumunda kaydedilir; olay sahibi, incident commander ve bağımsız reviewer birbirinden farklı olmalıdır.
2. Akış `triage → contained → eradicated → recovered → review → closed` sırasını izler. Aşamalar atlanamaz.
3. Containment sonrasındaki operasyonel geçişler kanıt referansı ve SHA-256 özeti gerektirir.
4. Post-incident review; kök neden, çıkarılan dersler ve KVKK/GDPR bildirim kararını zorunlu kılar.
5. Kapanış yalnız atanmış bağımsız Admin reviewer tarafından yapılabilir. Olayı ilan eden, olay sahibi veya incident commander aynı kaydı kapatamaz.
6. Kapalı olay yalnız Admin tarafından yeniden açılabilir ve tekrar sayacı artırılır.

## SLA ve önceliklendirme

| Önem | Müdahale hedefi | Recovery hedefi |
|---|---:|---:|
| Critical | 1 saat | 24 saat |
| High | 4 saat | 72 saat |
| Medium | 12 saat | 120 saat |
| Low | 24 saat | 240 saat |

Sistem response ve recovery ihlallerini canlı olarak sınıflandırır; kritik ve yüksek olayları öncelik kuyruğunda tutar.

## Bağlantılar ve çıktı

- Etkilenen varlık referansları zorunludur.
- Risk ve BIA referansları olay kaydına bağlanabilir.
- Veri sınıfı ve kişisel veri etkisi kaydedilir.
- Admin CSV çıktısı spreadsheet formula injection saldırılarına karşı güvenlidir.
- Tüm geçişler aktör, zaman, önceki/yeni durum, açıklama ve kanıt özetiyle değişmez olay geçmişine yazılır.
