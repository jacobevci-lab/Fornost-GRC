import { cleanAiText, redactSensitiveText } from "./security";
const date = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export function validateModelArtifact(input: Record<string, unknown>) {
  const value = {
    modelId: cleanAiText(input.modelId, 100),
    version: redactSensitiveText(input.version, 100),
    artifactType: cleanAiText(input.artifactType, 30),
    source: redactSensitiveText(input.source, 1000),
    supplier: redactSensitiveText(input.supplier, 320),
    sha256: cleanAiText(input.sha256, 64).toLowerCase(),
    signatureVerified: input.signatureVerified === true,
    signatureIssuer: redactSensitiveText(input.signatureIssuer, 320),
    license: redactSensitiveText(input.license, 300),
    sbomReference: redactSensitiveText(input.sbomReference, 1000),
    scanner: redactSensitiveText(input.scanner, 200),
    scanDate: cleanAiText(input.scanDate, 10),
    malwareClean: input.malwareClean === true,
    criticalVulnerabilities: Number(input.criticalVulnerabilities),
    highVulnerabilities: Number(input.highVulnerabilities),
    unsafeFormats: input.unsafeFormats === true,
    reproducible: input.reproducible === true,
    provenance: redactSensitiveText(input.provenance, 1800),
    validUntil: cleanAiText(input.validUntil, 10),
  };
  if (
    !value.modelId ||
    !value.version ||
    !["model", "adapter", "tokenizer", "container", "bundle"].includes(
      value.artifactType,
    ) ||
    value.source.length < 5 ||
    value.supplier.length < 2 ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    value.license.length < 2 ||
    value.sbomReference.length < 5 ||
    value.scanner.length < 2 ||
    !date(value.scanDate) ||
    !date(value.validUntil) ||
    value.validUntil < value.scanDate ||
    value.provenance.length < 10
  )
    throw new Error(
      "Model artifact kimliği, kaynak, SHA-256, lisans, SBOM, tarama ve provenance zorunludur.",
    );
  for (const n of [value.criticalVulnerabilities, value.highVulnerabilities])
    if (!Number.isInteger(n) || n < 0 || n > 10000)
      throw new Error("Açık sayıları 0–10000 arasında olmalıdır.");
  const blockers: string[] = [];
  if (!value.signatureVerified) blockers.push("İmza doğrulanmadı");
  if (value.signatureVerified && value.signatureIssuer.length < 3)
    blockers.push("İmza sağlayıcısı eksik");
  if (!value.malwareClean) blockers.push("Zararlı içerik taraması temiz değil");
  if (value.criticalVulnerabilities > 0) blockers.push("Kritik açık mevcut");
  if (value.highVulnerabilities > 0) blockers.push("Yüksek açık mevcut");
  if (value.unsafeFormats) blockers.push("Güvensiz artifact formatı");
  if (!value.reproducible)
    blockers.push("Build/tedarik yeniden üretilebilir değil");
  return { ...value, blockers };
}
export function artifactAttention(
  status: string,
  validUntil: string,
  today = new Date().toISOString().slice(0, 10),
) {
  if (status === "retired") return "retired";
  if (validUntil < today) return "expired";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return validUntil <= d.toISOString().slice(0, 10)
    ? "expires-soon"
    : "current";
}
