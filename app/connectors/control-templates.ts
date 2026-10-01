import type { LocalText } from './catalog';

export type ControlTemplate = {
  id: string; version: number; providerId: string; dataset: string;
  name: LocalText; description: LocalText; remediation: LocalText; suggestedRefs: string;
};
const t = (tr: string, en: string): LocalText => ({ tr, en });
export const controlTemplates: ControlTemplate[] = [
  { id: 'intune-compliance', version: 1, providerId: 'intune', dataset: 'managed-devices',
    name: t('Intune cihaz uyumluluğu', 'Intune device compliance'),
    description: t('Görünen tüm cihazlar uyumlu olmalı ve son 7 günde eşitlenmiş olmalı. Ek süre içindeki cihazlar da başarısız sayılır.', 'All visible devices must be compliant and synced within 7 days. Devices in a grace period also fail.'),
    remediation: t('Etkilenen cihazın Intune uyumluluk politikasını ve son eşitlemesini inceleyin; düzeltmeden sonra testi tekrar çalıştırın.', 'Review the affected device compliance policy and last sync in Intune; rerun after remediation.'), suggestedRefs: 'A.8.1' },
  { id: 'intune-encryption', version: 1, providerId: 'intune', dataset: 'managed-devices',
    name: t('Intune cihaz şifreleme', 'Intune device encryption'),
    description: t('Görünen tüm cihazlar şifrelenmiş bildirilmiş ve son 7 günde eşitlenmiş olmalı. Bu test kurtarma anahtarlarını doğrulamaz.', 'All visible devices must report encryption and have synced within 7 days. This does not verify recovery keys.'),
    remediation: t('Cihazın disk şifreleme politikasını ve eşitlemesini doğrulayın; kurtarma anahtarı güvencesini ayrıca değerlendirin.', 'Verify device encryption policy and sync; assess recovery-key assurance separately.'), suggestedRefs: 'A.8.24' },
  { id: 'mde-sensor-health', version: 1, providerId: 'defender-endpoint', dataset: 'machines',
    name: t('Defender sensör sağlığı', 'Defender sensor health'),
    description: t('Görünen tüm cihazların sensörü Active olmalı ve son 7 günde görülmüş olmalı. Tam EDR kapsamını kanıtlamaz.', 'All visible devices must report Active sensor health and have been seen within 7 days. This does not prove complete EDR coverage.'),
    remediation: t('Defender sensörünü, servis durumunu ve ağ erişimini kontrol edin; sorun giderildikten sonra yeniden test edin.', 'Check the Defender sensor, services and network connectivity; retest after remediation.'), suggestedRefs: 'A.8.7, A.8.16' },
  { id: 'sonarqube-quality-gate', version: 1, providerId: 'sonarqube', dataset: 'quality-gate',
    name: t('SonarQube kalite kapısı', 'SonarQube quality gate'),
    description: t('Seçili projenin bildirilen kalite kapısı OK olmalı. Analiz zamanı ve tüm branch kapsamı bu yanıttan doğrulanmaz.', 'The selected project must report an OK quality gate. Analysis recency and all-branch coverage are not established by this response.'),
    remediation: t('SonarQube üzerinde başarısız kalite koşullarını inceleyin, yeni analiz çalıştırın ve tekrar test edin.', 'Review failing quality conditions in SonarQube, run a new analysis and retest.'), suggestedRefs: 'A.8.28, A.8.29' },
];
export function controlTemplate(id: string) { return controlTemplates.find(item => item.id === id); }
export function templatesForSource(source: { driver: string; config: Record<string, string> }) {
  return source.driver === 'provider-v1' ? controlTemplates.filter(item => item.providerId === source.config.providerId && item.dataset === source.config.dataset) : [];
}

export type AssessmentItem = { id: string; name: string; status: 'fail' | 'unknown'; reason: string };
export type ControlAssessment = {
  templateId: string; templateVersion: number; status: 'pass' | 'fail' | 'error';
  total: number; passed: number; failed: number; unknown: number; score: number;
  evaluatedAt: string; scope: 'credential-visible'; issues: AssessmentItem[]; issuesTruncated: boolean;
};
export const assessmentReasons: Record<string, LocalText> = {
  'no-data': t('Kaynak görünür kayıt döndürmedi; kapsamı ve izinleri doğrulayın.', 'No visible records returned; verify scope and permissions.'),
  'invalid-record': t('Kayıt veya benzersiz kimliği geçersiz.', 'Invalid record or unique identifier.'),
  'duplicate-id': t('Aynı kimlik birden fazla kez döndü; sonuç doğrulanamadı.', 'Duplicate identity returned; result cannot be verified.'),
  'missing-state': t('Durum eksik veya tanınmıyor.', 'Status is missing or unrecognised.'),
  'not-compliant': t('Cihaz uyumlu değil veya ek süre içinde.', 'Device is noncompliant or in a grace period.'),
  'not-encrypted': t('Cihaz şifrelenmiş bildirilmedi.', 'Device does not report encryption.'),
  'unhealthy-sensor': t('Sensör etkin değil veya iletişim sorunu bildiriyor.', 'Sensor is inactive or reports communication problems.'),
  'missing-time': t('Son cihaz rapor zamanı eksik veya geçersiz.', 'Last device report timestamp is missing or invalid.'),
  'stale-device': t('Cihaz 7 günden uzun süredir rapor vermiyor.', 'Device has not reported for more than 7 days.'),
  'gate-failed': t('Proje kalite kapısını geçemedi.', 'Project did not pass its quality gate.'),
  'gate-unknown': t('Kalite kapısı hesaplanmamış, tanınmıyor veya koşullar atlanmış.', 'Quality gate is uncomputed, unrecognised or has ignored conditions.'),
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').slice(0, max) : '';

/** All rows are counted. Only a bounded, non-secret projection of affected rows is persisted. */
export function assessControl(templateId: string, version: number, config: Record<string, string>, payload: unknown, now = new Date()): ControlAssessment {
  const template = controlTemplate(templateId);
  if (!template || template.version !== version || template.providerId !== config.providerId || template.dataset !== config.dataset) throw new Error('Control template does not match the source or saved version.');
  const data = object(payload), collection = object(data.fornostCollection);
  if (collection.complete !== true || collection.providerId !== template.providerId || collection.dataset !== template.dataset || collection.scope !== 'credential-visible') throw new Error('Complete, matching provider collection required.');
  const rows = template.providerId === 'sonarqube' ? [data.projectStatus] : data.value;
  if (!Array.isArray(rows) || collection.recordCount !== rows.length) throw new Error('Provider record count or dataset is invalid.');
  const result: ControlAssessment = { templateId, templateVersion: version, status: 'error', total: rows.length, passed: 0, failed: 0, unknown: 0, score: 0, evaluatedAt: now.toISOString(), scope: 'credential-visible', issues: [], issuesTruncated: false };
  const identities = new Map<string, number>();
  for (const row of rows) { const id = text(object(row).id); if (id) identities.set(id, (identities.get(id) || 0) + 1); }
  const issue = (id: string, name: string, status: AssessmentItem['status'], reason: string) => {
    if (status === 'fail') result.failed++; else result.unknown++;
    if (result.issues.length < 100) result.issues.push({ id, name, status, reason }); else result.issuesTruncated = true;
  };
  if (!rows.length) result.issues.push({ id: '', name: '', status: 'unknown', reason: 'no-data' });
  for (const [index, raw] of rows.entries()) {
    const row = object(raw), sonar = template.providerId === 'sonarqube';
    const id = sonar ? text(config.projectKey) : text(row.id);
    const name = text(row.deviceName || row.computerDnsName) || id || `#${index + 1}`;
    if (!Object.keys(row).length || !id) { issue(id, name, 'unknown', 'invalid-record'); continue; }
    if (!sonar && identities.get(id)! > 1) { issue(id, name, 'unknown', 'duplicate-id'); continue; }
    if (sonar) {
      if (row.status === 'ERROR' || row.status === 'WARN') issue(id, name, 'fail', 'gate-failed');
      else if (row.status !== 'OK' || row.ignoredConditions === true) issue(id, name, 'unknown', 'gate-unknown');
      else result.passed++;
      continue;
    }
    let reason = '', status: AssessmentItem['status'] = 'unknown';
    if (templateId === 'intune-compliance') {
      if (['noncompliant', 'inGracePeriod'].includes(String(row.complianceState))) { status = 'fail'; reason = 'not-compliant'; }
      else if (row.complianceState !== 'compliant') reason = 'missing-state';
    } else if (templateId === 'intune-encryption') {
      if (row.isEncrypted === false) { status = 'fail'; reason = 'not-encrypted'; }
      else if (row.isEncrypted !== true) reason = 'missing-state';
    } else {
      if (['Inactive', 'ImpairedCommunication', 'NoSensorData', 'NoSensorDataImpairedCommunication'].includes(String(row.healthStatus))) { status = 'fail'; reason = 'unhealthy-sensor'; }
      else if (row.healthStatus !== 'Active') reason = 'missing-state';
    }
    const timestamp = row[template.providerId === 'intune' ? 'lastSyncDateTime' : 'lastSeen'];
    const age = typeof timestamp === 'string' ? now.getTime() - Date.parse(timestamp) : NaN;
    if (!reason && (!Number.isFinite(age) || age < -300_000)) reason = 'missing-time';
    if (!reason && age > 7 * 86_400_000) { status = 'fail'; reason = 'stale-device'; }
    if (reason) issue(id, name, status, reason); else result.passed++;
  }
  result.status = result.failed ? 'fail' : result.total && !result.unknown ? 'pass' : 'error';
  result.score = result.total ? Math.floor(100 * result.passed / result.total) : 0;
  return result;
}

export function assessmentSummary(result: ControlAssessment) {
  return `${result.passed}/${result.total} passed; ${result.failed} failed; ${result.unknown} unknown; credential-visible scope${!result.total ? '; no data' : ''}`;
}
