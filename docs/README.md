# Fornost GRC Dokümantasyon Dizini

Güncelleme: 19 Ekim 2026. Başlangıç belgeleri Türkçedir; ayrıntılı teknik iş akışı belgelerinin bir bölümü İngilizcedir. Arayüzdeki TR/EN seçimi belgelerin dilinden bağımsızdır.

## Başlangıç ve işletim

- [Ana README](../README.md): ürün özeti ve kurulum başlangıcı.
- [Ürün Tanıtımı](PRODUCT-OVERVIEW.md): kime hitap eder, modüller, örnek iş akışı ve kapsam sınırları.
- [Kullanıcı Rehberi](USER-GUIDE.md): kayıt, kanıt, denetim, görev ve rapor işlemleri.
- [Yönetici Rehberi](ADMIN-GUIDE.md): hesaplar, izinler, ayarlar, entegrasyonlar ve işletim.
- [Linux Kurulumu](LINUX-INSTALLATION.md), [Yedekleme/Kurtarma](onprem/backup-recovery.md), [Şema Başlatma](onprem/schema-initialization.md).
- [Modül Erişimi](onprem/module-access.md), [Oturum Politikası](onprem/session-policy.md), [Production Readiness](PRODUCTION-READINESS.md).

## Günlük çalışma ve denetim

- [Kayıt arama](record-search.md) ve [paylaşılabilir kayıt/görev bağlantıları](record-links.md).
- [Tarihli denetim görevleri](audit-milestones.md): sahip, hedef tarih, bağımsız inceleme/onay, My Work ve kapanış kontrolü.
- [Denetim planlama](audit-engagement-planning.md), [talepler ve inceleme](audit-request-workflow.md), [takvim/hatırlatma/eskalasyon](audit-reminder-profiles.md).
- [Çalışma kâğıtları, örnekleme ve CAPA aktarımı](audit-workpapers.md), [durum raporları](audit-status-reports.md), [bütün-denetim kapanışı](audit-closure.md).
- [Kanıt dosya biçimleri](EVIDENCE-DOCUMENT-FORMATS.md), [kanıt geçmişi](evidence-history-overview.md), [çalışma alanları](research-workspaces.md).
- [Benim İşlerim: kurumsal yaşam döngüleri](integrations/my-work-enterprise-lifecycles.md), [güvence işleri](integrations/my-work-assurance.md).

## GRC modülleri

- [Bağlantılı GRC](CONNECTED-GRC.md), [kontrol güvence çalışma alanı](integrations/control-assurance-workspace.md).
- [Risk İştahı ve KRI](ENTERPRISE-RISK-APPETITE-KRI.md), [risk inceleme kararları](integrations/risk-review-decisions.md).
- [Bulgular ve CAPA](ENTERPRISE-FINDINGS-CAPA.md), [CAPA kontrol bağlamı](integrations/capa-control-context.md).
- [Tedarikçi Risk Yönetimi](THIRD-PARTY-RISK-MANAGEMENT.md) · [Bağlı karar kanıtları](tprm-connected-evidence.md).
- [Politika Yaşam Döngüsü](POLICY-LIFECYCLE-MANAGEMENT.md), [Regülasyon Değişiklikleri](REGULATORY-CHANGE-INTELLIGENCE.md).
- [İş Sürekliliği](ENTERPRISE-BUSINESS-CONTINUITY.md), [Güvenlik Olayları](ENTERPRISE-INCIDENT-CRISIS-MANAGEMENT.md).
- [Sürekli Kontrol İzleme](CONTINUOUS-CONTROL-MONITORING.md), [native kaynaklar ve adaptör sınırları](integrations/product-connectors.md), [hazır kontrol testleri](integrations/ready-control-tests.md).
- [Framework katalog güncelliği](framework-catalog-currency.md), [yönetim denetim hazırlığı](executive-audit-readiness.md).

## AI ve teknik belgeler

- [AI mimarisi ve güven sınırları](AI-ARCHITECTURE.md), [model kararları](integrations/ai-model-decisions.md), [model bağlantılı işler](ai-model-linked-work.md).
- [Uygulama mimarisi](ARCHITECTURE.md), [güvenlik](../SECURITY.md), [test stratejisi](TEST-STRATEGY.md), [canlı smoke testi](production-smoke-tests.md), [QA dizini](qa/README.md).

## Planlar ve tarihsel kanıtlar nasıl okunmalı?

[2027 Ürün Vizyonu](FORNOST_PRODUCT_VISION_2027.md) hedefleri anlatır; mevcut özellik listesi değildir. [Araştırma ve Teslim Durumu](research-delivery-status.md), tamamlanan kapsamı kalan işlerden ayırır. `roadmap/` altındaki tasarımlar, tarihli QA raporları ve güvenlik taramaları kendi tarih/sürüm kapsamlarına aittir; son sürüm için otomatik başarı veya zafiyetsizlik iddiası oluşturmaz.

Yeni bir özelliğin API, izin, durum geçişi veya limitleri değiştiğinde ilgili ayrıntılı belge ile bu başlangıç rehberleri birlikte güncellenmelidir.

- [Saved register views](saved-register-views.md): personal search/filter/column presets, limits and browser storage boundaries.
- [Account and team views](account-team-views.md): server-backed personal preferences, Admin-published shared criteria, cross-device reuse, immutable team history, reasoned version restore and current access enforcement across seven registers and My Work.

- [Shared audit template library](audit-template-library.md) — centrally managed plan/task/task-pack definitions, version history, archive/reactivation and explicit reuse.

- [Shared organization calendars](audit-reminder-profiles.md#shared-organization-calendars): Admin-managed versions, per-audit source tracking, explicit change previews and guarded adoption.

- [Working-day deadline planning](audit-deadline-planning.md): explicit milestone/workpaper/request date proposals and independent return deadlines, calendar conflict recovery and retained adjustment reasons.

- [Reproducible random workpaper selection](audit-workpapers.md#reproducible-random-selection): complete-population CSV, explicit draw preview, server recalculation and retained selection provenance.
