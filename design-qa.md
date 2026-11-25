# Güncel tasarım doğrulaması

Uygulama için kaynak sözleşmesi [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) dosyasındadır. Eski dashboard/tema denemeleri ve bunları doğrulayan kullanılmayan kaynak testleri emekliye ayrılmıştır.

| Kontrol | Komut / iş akışı | Kanıt |
| --- | --- | --- |
| Ortak font ve ölçek sahipliği | `npm run check:design` | CSS ve JSX kaynak taraması |
| Tipografi, yoğunluk ve taşma | Compact Typography QA | 30 modül, TR/EN, açık/koyu, masaüstü/mobil; form, drawer ve portal ölçümleri |
| Sidebar hiyerarşisi | `scripts/sidebar-theme-qa.mjs` | Geniş/dar grup ve aktif bağlantı kontrolü |
| Davranış ve güvence | CI + ilgili modül QA | Gerçek kayıt akışı, izin ve bağımsız onay testleri |
| Yayın | Production Smoke Test | Canlı exact revision, giriş ve sentetik kayıt temizliği |

Her sonuç kendi commit/CI artifact’ıyla okunmalıdır. Ekran görüntüsü iş akışı veya güvenlik testinin yerine geçmez. Temizlik kapsamı ve kabul ölçütleri: [teslim kaydı](docs/roadmap/current-design-cleanup.md).
