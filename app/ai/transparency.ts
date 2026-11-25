import { cleanAiText, redactSensitiveText } from "./security";

const date = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateTransparencyProfile(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    intendedUse: redactSensitiveText(input.intendedUse, 1800),
    prohibitedUses: redactSensitiveText(input.prohibitedUses, 1800),
    capabilities: redactSensitiveText(input.capabilities, 1800),
    limitations: redactSensitiveText(input.limitations, 1800),
    explanationMethod: redactSensitiveText(input.explanationMethod, 1600),
    humanOversight: redactSensitiveText(input.humanOversight, 1600),
    noticeText: redactSensitiveText(input.noticeText, 1200),
    appealChannel: redactSensitiveText(input.appealChannel, 500),
    owner: redactSensitiveText(input.owner, 320),
    affectedGroups: redactSensitiveText(input.affectedGroups, 1200),
    languages: Array.isArray(input.languages)
      ? [
          ...new Set(
            input.languages.map((x) => cleanAiText(x, 12)).filter(Boolean),
          ),
        ].slice(0, 10)
      : [],
    reviewDate: cleanAiText(input.reviewDate, 10),
  };
  if (
    !value.modelId ||
    value.intendedUse.length < 20 ||
    value.prohibitedUses.length < 20 ||
    value.capabilities.length < 20 ||
    value.limitations.length < 20 ||
    value.explanationMethod.length < 20 ||
    value.humanOversight.length < 20 ||
    value.noticeText.length < 20 ||
    value.appealChannel.length < 5 ||
    value.owner.length < 3 ||
    value.affectedGroups.length < 5 ||
    !value.languages.length ||
    !date(value.reviewDate)
  )
    throw new Error(
      "Amaç, yasaklar, yetenekler, sınırlar, açıklama, insan gözetimi, bildirim, itiraz, kapsam ve review bilgileri zorunludur.",
    );
  const gaps: string[] = [];
  if (!/insan|human|manuel|review|onay/i.test(value.humanOversight))
    gaps.push("İnsan gözetimi açık tanımlanmadı");
  if (!/ai|yapay zek|model|otomatik/i.test(value.noticeText))
    gaps.push("Kullanıcı bildirimi AI kullanımını açıklamıyor");
  if (!/@|https?:\/\/|telefon|portal|form/i.test(value.appealChannel))
    gaps.push("İtiraz kanalı doğrulanabilir değil");
  return { ...value, gaps };
}

export function validateOversightEvent(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    decisionReference: redactSensitiveText(input.decisionReference, 300),
    action: cleanAiText(input.action, 30),
    severity: cleanAiText(input.severity, 20),
    reason: redactSensitiveText(input.reason, 1400),
    outcome: redactSensitiveText(input.outcome, 1400),
    controlOwner: redactSensitiveText(input.controlOwner, 320),
  };
  if (
    !value.modelId ||
    value.decisionReference.length < 5 ||
    !["confirmed", "overridden", "escalated", "stopped"].includes(
      value.action,
    ) ||
    !["low", "medium", "high", "critical"].includes(value.severity) ||
    value.reason.length < 10 ||
    value.outcome.length < 10 ||
    value.controlOwner.length < 3
  )
    throw new Error(
      "Model, karar referansı, insan aksiyonu, önem, gerekçe, sonuç ve kontrol sahibi zorunludur.",
    );
  return value;
}

export function transparencyAttention(
  status: string,
  reviewDate: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "retired") return "retired";
  if (reviewDate < today) return "overdue";
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  return reviewDate <= due.toISOString().slice(0, 10) ? "due-soon" : "current";
}
