import { cleanAiText, redactSensitiveText } from "./security";
export type GateInput = {
  modelApproved: boolean;
  controlsTotal: number;
  controlsOpen: number;
  highRisks: number;
  expiredAcceptances: number;
  criticalIncidents: number;
  vendorCurrent: boolean;
  evidenceCurrent: number;
  accessFindings: number;
  impactCurrent: boolean;
  resilienceCurrent: boolean;
  changeApproved: boolean;
};
export function evaluateReleaseGate(input: GateInput) {
  const checks = [
      {
        key: "model",
        label: "Model onayı",
        passed: input.modelApproved,
        detail: input.modelApproved ? "Onaylı" : "Model onaylı değil",
      },
      {
        key: "controls",
        label: "Uyum kontrolleri",
        passed: input.controlsTotal > 0 && input.controlsOpen === 0,
        detail: `${input.controlsTotal} kapsam / ${input.controlsOpen} açık`,
      },
      {
        key: "risks",
        label: "AI riskleri",
        passed: input.highRisks === 0 && input.expiredAcceptances === 0,
        detail: `${input.highRisks} yüksek-kritik / ${input.expiredAcceptances} süresi biten kabul`,
      },
      {
        key: "incidents",
        label: "AI olayları",
        passed: input.criticalIncidents === 0,
        detail: `${input.criticalIncidents} açık yüksek-kritik olay`,
      },
      {
        key: "vendor",
        label: "Tedarikçi güvencesi",
        passed: input.vendorCurrent,
        detail: input.vendorCurrent ? "Güncel onay" : "Güncel onay yok",
      },
      {
        key: "evidence",
        label: "Kanıt bütünlüğü",
        passed: input.evidenceCurrent > 0,
        detail: `${input.evidenceCurrent} geçerli doğrulanmış kanıt`,
      },
      {
        key: "access",
        label: "Erişim yönetişimi",
        passed: input.accessFindings === 0,
        detail: `${input.accessFindings} kritik erişim bulgusu`,
      },
      {
        key: "impact",
        label: "Etki değerlendirmesi",
        passed: input.impactCurrent,
        detail: input.impactCurrent
          ? "Güncel onay"
          : "Güncel DPIA/FRIA onayı yok",
      },
      {
        key: "change",
        label: "Değişiklik onayı",
        passed: input.changeApproved,
        detail: input.changeApproved ? "Onaylı" : "Onaylı değişiklik yok",
      },
      {
        key: "resilience",
        label: "Dayanıklılık tatbikatı",
        passed: input.resilienceCurrent,
        detail: input.resilienceCurrent
          ? "Son 180 günde başarılı kritik tatbikat"
          : "Güncel başarılı dayanıklılık tatbikatı yok",
      },
    ],
    passed = checks.filter((c) => c.passed).length,
    score = Math.round((passed / checks.length) * 100),
    blockers = checks.filter((c) => !c.passed).map((c) => c.label);
  return { checks, score, blockers, ready: blockers.length === 0 };
}
const realDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
};
export function validateReleaseRequest(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    changeId: cleanAiText(input.changeId, 100),
    version: redactSensitiveText(input.version, 120),
    environment: cleanAiText(input.environment, 30),
    releaseOwner: redactSensitiveText(input.releaseOwner, 320),
    rollbackOwner: redactSensitiveText(input.rollbackOwner, 320),
    rollbackPlan: redactSensitiveText(input.rollbackPlan, 1600),
    plannedAt: cleanAiText(input.plannedAt, 10),
  };
  if (
    !value.modelId ||
    !value.changeId ||
    value.version.length < 1 ||
    !["production", "restricted-production"].includes(value.environment) ||
    value.releaseOwner.length < 3 ||
    value.rollbackOwner.length < 3 ||
    value.rollbackPlan.length < 10 ||
    !realDate(value.plannedAt)
  )
    throw new Error(
      "Model, değişiklik, sürüm, ortam, sorumlular, geri dönüş planı ve geçerli tarih zorunludur.",
    );
  return value;
}
export function validateReleaseDecision(
  input: Record<string, unknown>,
  today = new Date().toISOString().slice(0, 10),
) {
  const status = cleanAiText(input.status, 20),
    note = redactSensitiveText(input.note, 1000),
    validUntil = cleanAiText(input.validUntil, 10),
    confirmation = cleanAiText(input.confirmation, 40);
  if (!["approved", "rejected", "revoked"].includes(status) || note.length < 5)
    throw new Error("Geçerli karar ve gerekçe zorunludur.");
  const expected =
    status === "approved"
      ? "YAYINA ALMAYI ONAYLA"
      : status === "rejected"
        ? "YAYINI REDDET"
        : "ONAYI GERİ ÇEK";
  if (confirmation !== expected) throw new Error(`Onay metni: ${expected}`);
  if (status === "approved") {
    if (!realDate(validUntil) || validUntil <= today)
      throw new Error("İleri tarihli onay süresi zorunludur.");
    const max = new Date(`${today}T00:00:00Z`);
    max.setUTCDate(max.getUTCDate() + 90);
    if (validUntil > max.toISOString().slice(0, 10))
      throw new Error("Yayın onayı 90 günü aşamaz.");
  }
  return { status, note, validUntil: status === "approved" ? validUntil : "" };
}
