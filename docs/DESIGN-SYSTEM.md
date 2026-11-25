# Fornost GRC — güncel arayüz sözleşmesi

25 Kasım 2026. Bu belge canlı ürünün kompakt tasarımını tanımlar. Önceki teslim/araştırma belgelerindeki ölçekler tarihsel kayıttır; yeni ekranlar bu sözleşmeyi kullanır.

## Tipografi ve yoğunluk

Tek font ailesi `var(--font-sans)`; kod/hash için `var(--font-mono)`. Font dış bir CDN'e bağımlı değildir. `html` %100 kalır; boyutlar `rem` ile kullanıcı yazı ölçeğini izler. Aşağıdaki piksel karşılıkları varsayılan 16px kök içindir.

| Rol | Boyut / ağırlık | Satır yüksekliği |
| --- | --- | --- |
| Gövde, tablo hücresi, alan, sekme, buton | 12px / 400–500 | 1.35 |
| Ana sayfa / modal başlığı | 15px / 600 | 1.3 |
| Kart / bölüm başlığı | 13px / 600 | 1.35 |
| KPI değeri | 17px / 600, tabular numerals | 1.2 |
| Yardım / alt açıklama | 11px | 1.35 |
| Tablo alt kodu / navigasyon grubu | 10.5px; grup 700 | 1.35 |
| Breadcrumb / tablo başlığı / rozet | 10px | 1.35 |

- Tek satırlı input/select 32px; sıradan aksiyon en az 28px. Uzun aksiyon metni satıra geçer ve yüksekliği büyür.
- Tablo hücreleri 6px × 10px, KPI iç boşluğu 12px, navigasyon öğeleri dikey 6px.
- Çok satırlı alanlar, dosya seçiciler, checkbox/radio/range ve resize tutamaçları ve diyagram kartları kendi geometrisini korur; bağlantı çizgileri kartın hesaplanan sınırlarıyla hizalanır.
- Ekranlar, portallar, modallar ve çekmeceler aynı sözleşmeye tabidir. PDF/HTML rapor çıktısı kendi sayfa geometrisini ve gömülü Unicode fontunu kullanır.

## Kaynak sahipliği

| Kaynak | Sorumluluk |
| --- | --- |
| `app/globals.css` | Font stack, temel reset ve ortak yapısal stiller |
| `app/compact-typography.css` | Semantik font boyutu, ağırlık ve satır yüksekliği |
| `app/compact-density.css` | Ortak kontrol, tablo, form, navigasyon ve KPI boşlukları |
| `app/workspace-system.css` | Shell, açık/koyu ana palet ve `--ws-*` token'ları |
| `app/personal-appearance.css` | Kullanıcı paleti seçenekleri |
| Modül CSS dosyaları | Modüle özel yerleşim, durum ve responsive davranış |

`globals.css`, tipografi/yoğunluğu ilk cascade layer olarak yükler. Ortak `!important` sözleşmesi native kontrolleri ve portalled içerikleri de kapsar. Modüllere yerel `font`, `font-family`, `font-size`, `font-weight`, `line-height` veya inline karşılıkları eklemeyin; semantik HTML ve mevcut rol seçicilerini kullanın. Pseudo öğelerdeki ikon boyutu ayrı bir görsel ölçüdür. Yeni rol gerekiyorsa tek sözleşmeyi ve tarayıcı ölçümünü birlikte değiştirin.

Tema renkleri için `--ws-bg`, `--ws-surface`, `--ws-surface-2`, `--ws-ink`, `--ws-muted`, `--ws-line`, `--ws-brand` ve semantik durum token'ları kullanılır. Yeni bir ekran için alternatif shell veya ayrı font yığını eklenmez.

## Form ve erişilebilirlik

Görünür etiket, yerelleştirilmiş erişilebilir ad, klavye odağı, Escape ile kapanma ve hatada taslağın korunması gereklidir. Kayıt seçimi mevcut `EntityCombobox` / kanıt sürümü seçicileriyle yapılır. Başarı, boş sonuç, yükleniyor, hata, kısmi veri ve yetki reddi birbirinden ayrılır. Renk tek başına anlam taşımaz.

Tablo yatay kayabilir; sayfanın tamamı taşmamalıdır. Uzun TR/EN başlık ve kayıt adları için container daraltılmalı veya metin kaydırılmalıdır; global yazı boyutu küçültülerek gizlenmemelidir. Bağımsız doğrulama, kaynak kodları ve yetkiler tasarımla değiştirilemez.

## Doğrulama

`npm run check:design` kaynakta ortak tipografi sözleşmesini korur. `scripts/compact-typography-qa.mjs`, 30 navigasyon hedefini TR/EN, açık/koyu, 1440×900 ve 390×844 görünümlerde ölçer; gerçek form/çekmece, dış portal sunum fixture'ları ve %125 kullanıcı metin ölçeğini kapsar. Portal yetkilendirmesi ayrı iş akışı testlerindedir. `scripts/sidebar-theme-qa.mjs` navigasyon hiyerarşisini doğrular. Sonuçlar commit'e bağlı CI artifact'larıdır; bu belge kendi başına test geçtiği iddiası değildir.

Eski ekran/tema denemeleri Git geçmişinde tutulur. Veritabanı migration'ları, kayıt kodu uyumluluğu ve tarihli karar/QA belgeleri tasarım temizliğinde silinmez.
