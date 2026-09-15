import { cleanAiText, redactSensitiveText } from "./security";
export type GateInput = {
  modelApproved: boolean;
  controlsTotal: number;
  controlsOpen: number;
  blockingFindings: number;
  highRisks: number;
  expiredAcceptances: number;
  criticalIncidents: number;
  vendorCurrent: boolean;
  evidenceCurrent: number;
  accessFindings: number;
  impactCurrent: boolean;
  resilienceCurrent: boolean;
  datasetCurrent: boolean;
  regulatoryCurrent: boolean;
  literacyCurrent: boolean;
  artifactCurrent: boolean;
  redTeamCurrent: boolean;
  transparencyCurrent: boolean;
  oversightClear: boolean;
  continuousAssuranceCurrent: boolean;
  blockingAssuranceAlerts: number;
  unresolvedExceptions: number;
  changeApproved: boolean;
  retirementClear: boolean;
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
        passed: input.controlsTotal > 0 && input.controlsOpen === 0 && input.blockingFindings === 0,
        detail: `${input.controlsTotal} kapsam / ${input.controlsOpen} açık / ${input.blockingFindings} bloke CAPA`,
      },
      {
        key: "risks",
        label: "AI riskleri",
        passed: input.highRisks === 0 && input.expiredAcceptances === 0 && input.unresolvedExceptions === 0,
        detail: `${input.highRisks} yüksek-kritik / ${input.expiredAcceptances} süresi biten kabul / ${input.unresolvedExceptions} açık-gecikmiş istisna`,
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
        passed: input.changeApproved && input.retirementClear,
        detail: !input.retirementClear ? "Etkin emeklilik planı var" : input.changeApproved ? "Onaylı" : "Onaylı değişiklik yok",
      },
      {
        key: "resilience",
        label: "Dayanıklılık tatbikatı",
        passed: input.resilienceCurrent,
        detail: input.resilienceCurrent
          ? "Son 180 günde başarılı kritik tatbikat"
          : "Güncel başarılı dayanıklılık tatbikatı yok",
      },
      {
        key: "dataset",
        label: "Veri seti yönetişimi",
        passed: input.datasetCurrent,
        detail: input.datasetCurrent
          ? "Güncel onaylı veri seti"
          : "Güncel onaylı veri seti yok",
      },
      {
        key: "regulatory",
        label: "Regülasyon sınıflandırması",
        passed: input.regulatoryCurrent,
        detail: input.regulatoryCurrent
          ? "Güncel onaylı hukuki sınıflandırma"
          : "Güncel onaylı hukuki sınıflandırma yok",
      },
      {
        key: "literacy",
        label: "AI yetkinlik ve gözetim",
        passed: input.literacyCurrent,
        detail: input.literacyCurrent
          ? "Güncel yetkin insan gözetimi"
          : "Güncel onaylı operatör yetkinliği yok",
      },
      {
        key: "artifact",
        label: "Model tedarik zinciri",
        passed: input.artifactCurrent,
        detail: input.artifactCurrent
          ? "İmzalı ve temiz artifact"
          : "Güncel onaylı artifact güvencesi yok",
      },
      {
        key: "red-team",
        label: "AI red-team doğrulaması",
        passed: input.redTeamCurrent,
        detail: input.redTeamCurrent
          ? "Güncel başarılı adversarial test"
          : "Güncel başarılı red-team kampanyası yok",
      },
      {
        key: "transparency",
        label: "AI şeffaflık ve açıklanabilirlik",
        passed: input.transparencyCurrent,
        detail: input.transparencyCurrent
          ? "Güncel onaylı sistem kartı"
          : "Güncel boşluksuz sistem kartı yok",
      },
      {
        key: "human-oversight",
        label: "İnsan gözetimi bulguları",
        passed: input.oversightClear,
        detail: input.oversightClear
          ? "Açık yüksek/kritik insan gözetimi bulgusu yok"
          : "Açık yüksek/kritik insan gözetimi bulgusu var",
      },
      {
        key: "continuous-assurance",
        label: "Sürekli model güvencesi",
        passed: input.continuousAssuranceCurrent && input.blockingAssuranceAlerts === 0,
        detail: input.blockingAssuranceAlerts
          ? `${input.blockingAssuranceAlerts} açık yüksek/kritik güvence alarmı`
          : input.continuousAssuranceCurrent ? "Güncel ölçüm onaylı baseline içinde" : "Güncel ve sağlıklı baseline ölçümü yok",
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
