export type AssuranceRecord = {
  id: string;
  data: Record<string, unknown>;
};

const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
const references = (row: AssuranceRecord) => [row.data.controlRef, row.data.requirementRef]
  .flatMap((value) => String(value ?? "").split(/[;,|\n]+/))
  .map((value) => value.trim())
  .filter(Boolean);

export function buildAuditEvidenceAssurance(
  requirements: AssuranceRecord[],
  evidence: AssuranceRecord[],
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const evidenceByReference = new Map<string, AssuranceRecord[]>();
  for (const item of evidence) {
    for (const reference of references(item)) {
      const key = normalized(reference);
      evidenceByReference.set(key, [...(evidenceByReference.get(key) || []), item]);
    }
  }
  const uniqueRequirements = Array.from(new Map(requirements.flatMap((row) => references(row).map((reference) => [normalized(reference), reference] as const))).values());
  const isExpired = (row: AssuranceRecord) => {
    const status = normalized(row.data.status);
    const expiry = String(row.data.expiresAt || row.data.freshUntil || "").slice(0, 10);
    return ["süresi doldu", "expired", "stale"].includes(status) || (!!expiry && expiry < today);
  };
  const isApproved = (row: AssuranceRecord) =>
    !isExpired(row) && ["onaylandı", "approved", "güncel", "current", "kabul edildi", "accepted"].includes(normalized(row.data.status));
  const linked = uniqueRequirements.filter((reference) => (evidenceByReference.get(normalized(reference)) || []).length > 0);
  const current = uniqueRequirements.filter((reference) => (evidenceByReference.get(normalized(reference)) || []).some(isApproved));
  const stale = uniqueRequirements.filter((reference) => (evidenceByReference.get(normalized(reference)) || []).some(isExpired));
  const missing = uniqueRequirements.filter((reference) => !(evidenceByReference.get(normalized(reference)) || []).length);
  return {
    total: uniqueRequirements.length,
    linked: linked.length,
    current: current.length,
    stale: stale.length,
    missing,
    coverage: uniqueRequirements.length ? Math.round((linked.length / uniqueRequirements.length) * 100) : 100,
  };
}
