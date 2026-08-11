# Nexora GRC

Nexora GRC; risk, iş etki analizi, varlık, uyum, kontrol, kanıt, tedarikçi ve denetim süreçlerini tek çalışma alanında yöneten Türkçe/İngilizce bir GRC uygulamasıdır.

**Govern Risk. Prove Compliance.**

## Modüller

- Dashboard ve risk matrisi
- Risk Assessment
- Business Impact Analysis (BIA)
- Varlık Envanteri
- Uyum ve Kontrol Kütüphanesi
- Kanıt Yönetimi ve güvenli dosya yükleme
- Tedarikçi Yönetimi
- Denetim Yönetimi: ISO 27001, SOC 1/2 Type I/II çalışma alanları
- Admin / Editor / Viewer rol yönetimi
- Excel içe aktarma ve CSV/Excel dışa aktarma
- TR/EN arayüz

## Teknoloji

- Next.js 16, React 19, TypeScript
- Vinext/Vite üzerinde Cloudflare Worker uyumlu çalışma zamanı
- Cloudflare D1 (ilişkisel kayıtlar)
- Cloudflare R2 (kanıt dosyaları)
- Drizzle ORM ve sürümlenmiş SQL migration dosyaları

## Yerel geliştirme

Gereksinimler: Node.js `>=22.13.0`, npm ve Linux üzerinde GNU `timeout`.

```bash
npm ci
npm run dev
```

Kalite kapıları:

```bash
npm run lint
npm test
npm audit --omit=dev
npm run validate:artifact
```

## Yapılandırma ve veri

Hosting kimliği ve D1/R2 binding adları `.openai/hosting.json` içinde tutulur. Gizli değerler repoya yazılmaz. Canlı ortam değerleri hosting platformunun environment-variable yönetiminden verilmelidir.

Kanıt dosyaları yalnız PDF, JPEG, PNG veya WebP olabilir; MIME türü ve dosya imzası birlikte doğrulanır. Üst sınır 10 MB'dır. Excel import yalnız `.xlsx`, 5 MB ve 1.000 satırla sınırlıdır.

## Production readiness

Teknik kalite kapısı, güvenlik kontrolleri ve operasyonel önkoşullar [Production Readiness](docs/PRODUCTION-READINESS.md) belgesinde yer alır. Mimari için [Architecture](docs/ARCHITECTURE.md), güvenlik modeli için [Security](SECURITY.md), test kapsamı için [Test Strategy](docs/TEST-STRATEGY.md) okunmalıdır.

## Lisans ve gizlilik

Bu depo kuruma özel/proprietary kaynak kod içerir. Yetkisiz kopyalama, dağıtma veya üçüncü taraf ortamlarında çalıştırma izni verilmez.
