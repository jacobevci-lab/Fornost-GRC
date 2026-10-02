import { evaluateEvidenceEligibility } from "./evidence/eligibility";

export type AssuranceRecord = {
  id: string;
  data: Record<string, unknown>;
};

export type AuditEvidenceRequirementState = {
  reference: string;
  title: string;
  owner: string;
  dueDate: string;
  status: "current" | "stale" | "missing";
  linkedEvidence: number;
  currentEvidence: number;
  staleEvidence: number;
};

const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
const clean = (value: unknown) => String(value ?? "").trim();
const references = (row: AssuranceRecord) => [...new Map([row.data.controlRef, row.data.requirementRef]
  .flatMap((value) => String(value ?? "").split(/[;,|\n]+/))
  .map((value) => value.trim())
  .filter(Boolean).map(value => [normalized(value), value])).values()];

export function buildAuditEvidenceAssurance(
  requirements: AssuranceRecord[],
  evidence: AssuranceRecord[],
  now = new Date(),
) {
  const evidenceByReference = new Map<string, AssuranceRecord[]>();
  for (const item of evidence) {
    for (const reference of references(item)) {
      const key = normalized(reference);
      evidenceByReference.set(key, [...(evidenceByReference.get(key) || []), item]);
    }
  }

  const requirementByReference = new Map<string, { reference: string; rows: AssuranceRecord[] }>();
  for (const row of requirements) {
    for (const reference of references(row)) {
      const key = normalized(reference);
      const existing = requirementByReference.get(key);
      if (existing) existing.rows.push(row);
      else requirementByReference.set(key, { reference, rows: [row] });
    }
  }

  const isExpired = (row: AssuranceRecord) => evaluateEvidenceEligibility(row.data, now).invalid;
  const isApproved = (row: AssuranceRecord) => evaluateEvidenceEligibility(row.data, now).current;

  const requirementStates: AuditEvidenceRequirementState[] = Array.from(requirementByReference.values()).map(({ reference, rows }) => {
    const linked = evidenceByReference.get(normalized(reference)) || [];
    const current = linked.filter(isApproved);
    const stale = linked.filter(isExpired);
    const source = rows[0];
    const status: AuditEvidenceRequirementState["status"] = !linked.length ? "missing" : current.length ? "current" : "stale";
    return {
      reference,
      title: clean(source?.data.requirementTitle || source?.data.controlTitle || source?.data.title),
      owner: clean(source?.data.owner || source?.data.auditOwner),
      dueDate: clean(source?.data.dueDate || source?.data.endDate),
      status,
      linkedEvidence: linked.length,
      currentEvidence: current.length,
      staleEvidence: stale.length,
    };
  }).sort((a, b) => {
    const weight = (status: AuditEvidenceRequirementState["status"]) => status === "missing" ? 0 : status === "stale" ? 1 : 2;
    return weight(a.status) - weight(b.status) || a.reference.localeCompare(b.reference, "tr");
  });

  const currentStates = requirementStates.filter((item) => item.status === "current");
  const staleStates = requirementStates.filter((item) => item.status === "stale");
  const missingStates = requirementStates.filter((item) => item.status === "missing");
  const linkedStates = requirementStates.filter((item) => item.linkedEvidence > 0);
  const total = requirementStates.length;
  const readiness = total ? Math.round((currentStates.length / total) * 100) : 100;
  const coverage = total ? Math.round((linkedStates.length / total) * 100) : 100;
  const gate = total === 0 ? "empty" : readiness === 100 ? "ready" : readiness >= 80 && missingStates.length === 0 ? "attention" : "not-ready";

  return {
    total,
    linked: linkedStates.length,
    current: currentStates.length,
    stale: staleStates.length,
    missing: missingStates.map((item) => item.reference),
    staleReferences: staleStates.map((item) => item.reference),
    coverage,
    readiness,
    gate,
    requirements: requirementStates,
    gaps: requirementStates.filter((item) => item.status !== "current"),
  };
}
