const labels: Record<string, [string, string]> = {
  'incident-declare': ['Olay ilanı', 'Incident declaration'],
  declared: ['İlan edildi', 'Declared'], triage: ['Ön inceleme', 'Triage'], contained: ['Kontrol altında', 'Contained'],
  eradicated: ['Tehdit giderildi', 'Eradicated'], recovered: ['Hizmet geri yüklendi', 'Recovered'], review: ['İncelemede', 'In review'], closed: ['Kapalı', 'Closed'],
  contain: ['Kontrol altına al', 'Contain'], eradicate: ['Tehdidi gider', 'Eradicate'], recover: ['Hizmeti geri yükle', 'Recover'], close: ['Kapat', 'Close'], reopen: ['Yeniden aç', 'Reopen'],
  low: ['Düşük', 'Low'], medium: ['Orta', 'Medium'], high: ['Yüksek', 'High'], critical: ['Kritik', 'Critical'],
  malware: ['Zararlı yazılım', 'Malware'], phishing: ['Oltalama', 'Phishing'], 'account-compromise': ['Hesap ele geçirme', 'Account compromise'],
  'data-breach': ['Veri ihlali', 'Data breach'], availability: ['Hizmet kesintisi', 'Availability'], 'vulnerability-exploitation': ['Zafiyet istismarı', 'Vulnerability exploitation'],
  'third-party': ['Üçüncü taraf', 'Third party'], 'policy-violation': ['Politika ihlali', 'Policy violation'], physical: ['Fiziksel güvenlik', 'Physical security'], other: ['Diğer', 'Other'],
  Public: ['Herkese Açık', 'Public'], Internal: ['Kurum İçi', 'Internal'], Restricted: ['Gizli', 'Restricted'], 'Top Secret': ['Çok Gizli', 'Top Secret'],
  'response-breach': ['Müdahale süresi aşıldı', 'Response SLA breached'], 'recovery-breach': ['Kurtarma süresi aşıldı', 'Recovery SLA breached'],
  pending: ['Karar bekliyor', 'Pending'], required: ['Bildirim gerekli', 'Required'], 'not-required': ['Bildirim gerekmiyor', 'Not required'],
  'on-track': ['Plan dahilinde', 'On track'], 'review-required': ['İnceleme gerekiyor', 'Review required'],
};
/** Display labels only: persisted status codes and confirmation phrases are unchanged. */
export function incidentLabel(value: string, lang: 'tr' | 'en') { return labels[value]?.[lang === 'tr' ? 0 : 1] ?? value; }
