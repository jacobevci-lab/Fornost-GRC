export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INCIDENT_CATEGORIES = ["malware", "phishing", "account-compromise", "data-breach", "availability", "vulnerability-exploitation", "third-party", "policy-violation", "physical", "other"] as const;
export const INCIDENT_STATUSES = ["declared", "triage", "contained", "eradicated", "recovered", "review", "closed"] as const;

const clean = (value: unknown, max: number) => String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max);
const email = (value: unknown, label: string) => { const result = clean(value, 200).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error(`${label} için geçerli e-posta zorunludur.`); return result; };
const date = (value: unknown, label: string) => { const result = clean(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error(`${label} için geçerli tarih zorunludur.`); return result; };
const sha = (value: unknown) => { const result = clean(value, 64).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(result)) throw new Error("64 karakter SHA-256 kanıt özeti zorunludur."); return result; };

export function incidentResponseHours(severity: string) { return ({ critical: 1, high: 4, medium: 12, low: 24 } as Record<string, number>)[severity] || 0; }
export function incidentRecoveryHours(severity: string) { return ({ critical: 24, high: 72, medium: 120, low: 240 } as Record<string, number>)[severity] || 0; }

export function validateIncident(input: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const title = clean(input.title, 240), category = clean(input.category, 50), severity = clean(input.severity, 20), detectedDate = date(input.detectedDate, "Tespit tarihi"), description = clean(input.description, 4000), businessImpact = clean(input.businessImpact, 3000), owner = email(input.owner, "Olay sahibi"), commander = email(input.commander, "Incident commander"), reviewer = email(input.reviewer, "Bağımsız reviewer"), assetRefs = clean(input.assetRefs, 1000), riskRef = clean(input.riskRef, 120), biaRef = clean(input.biaRef, 120), dataClassification = clean(input.dataClassification, 40), personalData = Boolean(input.personalData);
  if (!INCIDENT_CATEGORIES.includes(category as typeof INCIDENT_CATEGORIES[number]) || !INCIDENT_SEVERITIES.includes(severity as typeof INCIDENT_SEVERITIES[number])) throw new Error("Olay kategorisi veya önem seviyesi geçersiz.");
  if (title.length < 5 || description.length < 20 || businessImpact.length < 15 || assetRefs.length < 2) throw new Error("Başlık, açıklama, iş etkisi ve etkilenen varlıklar eksiksiz girilmelidir.");
  if (detectedDate > today) throw new Error("Tespit tarihi gelecekte olamaz.");
  if (new Set([owner, commander, reviewer]).size !== 3) throw new Error("Olay sahibi, incident commander ve bağımsız reviewer farklı olmalıdır.");
  if (!['Public','Internal','Restricted','Top Secret'].includes(dataClassification)) throw new Error("Veri sınıflandırması geçersiz.");
  return { title, category, severity, detectedDate, description, businessImpact, owner, commander, reviewer, assetRefs, riskRef, biaRef, dataClassification, personalData };
}

export function validateIncidentAction(input: Record<string, unknown>) {
  const operation = clean(input.operation, 30), note = clean(input.note, 3000), confirmation = clean(input.confirmation, 100), evidenceReference = clean(input.evidenceReference, 500), evidenceSha256 = clean(input.evidenceSha256, 64), rootCause = clean(input.rootCause, 3000), lessonsLearned = clean(input.lessonsLearned, 3000), notificationDecision = clean(input.notificationDecision, 30), notificationRationale = clean(input.notificationRationale, 2000);
  const phrases: Record<string, string> = { triage: "OLAY TRİAJINI BAŞLAT", contain: "OLAYI KONTROL ALTINA AL", eradicate: "TEHDİDİ ORTADAN KALDIR", recover: "HİZMETİ GERİ YÜKLE", review: "OLAYI İNCELEMEYE GÖNDER", close: "OLAYI KAPAT", reopen: "OLAYI YENİDEN AÇ" };
  if (!phrases[operation] || confirmation !== phrases[operation] || note.length < 5) throw new Error(`${phrases[operation] || "Geçerli işlem"} onayı ve açıklama zorunludur.`);
  const evidenceRequired = ["contain", "eradicate", "recover", "review", "close"].includes(operation);
  const digest = evidenceRequired ? sha(evidenceSha256) : "";
  if (evidenceRequired && !evidenceReference) throw new Error("Kanıt referansı zorunludur.");
  if (operation === "review" && (rootCause.length < 20 || lessonsLearned.length < 20)) throw new Error("Kök neden ve çıkarılan dersler eksiksiz olmalıdır.");
  if (["review", "close"].includes(operation) && !["required", "not-required"].includes(notificationDecision)) throw new Error("KVKK/GDPR bildirim kararı zorunludur.");
  if (["review", "close"].includes(operation) && notificationRationale.length < 20) throw new Error("Bildirim kararı gerekçesi zorunludur.");
  return { operation, note, evidenceReference, evidenceSha256: digest, rootCause, lessonsLearned, notificationDecision, notificationRationale };
}

export function incidentAttention(status: string, severity: string, detectedDate: string, now = new Date()) {
  if (status === "closed") return "closed";
  const ageHours = Math.max(0, (now.getTime() - new Date(`${detectedDate}T00:00:00Z`).getTime()) / 3_600_000);
  if (["declared", "triage"].includes(status) && ageHours > incidentResponseHours(severity)) return "response-breach";
  if (!["recovered", "review"].includes(status) && ageHours > incidentRecoveryHours(severity)) return "recovery-breach";
  if (severity === "critical" || severity === "high") return "priority";
  return status;
}
