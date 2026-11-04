import { cleanAiText, isLoopbackHost, isPrivateHost } from "./security";

export const AI_DATA_CLASSIFICATIONS = ["Public", "Internal", "Confidential"] as const;
export const AI_PROVIDER_TRUST_ZONES = ["external", "private", "local"] as const;
export type AiDataClassification = typeof AI_DATA_CLASSIFICATIONS[number];
export type AiProviderTrustZone = typeof AI_PROVIDER_TRUST_ZONES[number];
export type AiDataPolicy = { trustZone: AiProviderTrustZone; maxDataClassification: AiDataClassification };

const rank: Record<AiDataClassification, number> = { Public: 0, Internal: 1, Confidential: 2 };

export function inferProviderTrustZone(baseUrl: string): AiProviderTrustZone {
  try {
    const host = new URL(baseUrl).hostname;
    return isLoopbackHost(host) ? "local" : isPrivateHost(host) ? "private" : "external";
  } catch {
    return "external";
  }
}

export function resolveProviderDataPolicy(baseUrl: string, config: Record<string, unknown>): AiDataPolicy {
  const inferred = inferProviderTrustZone(baseUrl);
  const trustZone = AI_PROVIDER_TRUST_ZONES.includes(config.trustZone as AiProviderTrustZone) ? config.trustZone as AiProviderTrustZone : inferred;
  const defaultMax: AiDataClassification = trustZone === "external" ? "Internal" : "Confidential";
  const maxDataClassification = AI_DATA_CLASSIFICATIONS.includes(config.maxDataClassification as AiDataClassification) ? config.maxDataClassification as AiDataClassification : defaultMax;
  if (trustZone !== inferred) throw new Error(`AI provider güven bölgesi endpoint ile uyuşmuyor; beklenen: ${inferred}.`);
  if (trustZone === "external" && maxDataClassification === "Confidential") throw new Error("Harici AI provider'a Confidential veri gönderilemez.");
  return { trustZone, maxDataClassification };
}

export function parseProviderDataPolicy(baseUrl: string, trustZoneValue: unknown, classificationValue: unknown) {
  const trustZone = cleanAiText(trustZoneValue, 20) as AiProviderTrustZone;
  const maxDataClassification = cleanAiText(classificationValue, 20) as AiDataClassification;
  if (!AI_PROVIDER_TRUST_ZONES.includes(trustZone)) throw new Error("AI provider güven bölgesi geçersiz.");
  if (!AI_DATA_CLASSIFICATIONS.includes(maxDataClassification)) throw new Error("AI veri paylaşım sınıfı geçersiz.");
  return resolveProviderDataPolicy(baseUrl, { trustZone, maxDataClassification });
}

export function strictestDataClassification(profiles: Array<{ maxDataClassification: AiDataClassification }>): AiDataClassification {
  return profiles.reduce<AiDataClassification>((strictest, item) => rank[item.maxDataClassification] < rank[strictest] ? item.maxDataClassification : strictest, "Confidential");
}

const classificationAliases = new Map<string, AiDataClassification | "Restricted">([
  ["public", "Public"], ["herkese acik", "Public"],
  ["internal", "Internal"], ["sirket ici", "Internal"],
  ["confidential", "Confidential"], ["gizli", "Confidential"],
  ["restricted", "Restricted"], ["cok gizli", "Restricted"],
]);

export function dataClassificationAllowed(value: unknown, maximum: AiDataClassification) {
  // Never truncate, coerce or strip control characters from a security label.
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const label = value.normalize("NFKC").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/\s+/g, " ");
  const classification = classificationAliases.get(label);
  return classification !== undefined && classification !== "Restricted" && rank[classification] <= rank[maximum];
}

export function recordDataClassificationAllowed(data: Record<string, unknown>, maximum: AiDataClassification) {
  const keys = ["dataClassification", "classification", "securityClassification"] as const;
  const present = keys.filter(key => Object.hasOwn(data, key));
  // Legacy records without any classification field are Internal. Explicitly
  // malformed/unknown values fail closed; a weaker alias cannot mask a higher one.
  return present.length
    ? present.every(key => dataClassificationAllowed(data[key], maximum))
    : dataClassificationAllowed("Internal", maximum);
}
