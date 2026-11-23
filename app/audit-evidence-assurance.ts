import { evaluateEvidenceEligibility } from "./evidence/eligibility";

import { approvedAuditEvidence, inAuditPeriod } from "./audit-engagement";

export type AuditInheritedEvidence = {
  period: string;
  excluded: boolean;
  pins: {id:string; version:number; hash:string}[];
};
export type AuditItemCoverage = { auditName: string; scoped: number; current: number };

export type AssuranceRecord = {
  inherited?: AuditInheritedEvidence;
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
  assessmentIssues: string[];
  eligibilityIssues: string[];
  requirementIds: string[];
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
  const evidenceById = new Map(evidence.map(row => [row.id, row]));
  const evidenceByReference = new Map<string, AssuranceRecord[]>();
  for (const item of evidence) {
    for (const reference of references(item)) {
      const key = normalized(reference);
      evidenceByReference.set(key, [...(evidenceByReference.get(key) || []), item]);
    }
  }

  const requirementByReference = new Map<string, { reference: string; rows: AssuranceRecord[] }>();
  for (const row of requirements) {
    if (row.inherited?.excluded) continue;
    for (const reference of references(row)) {
      const key = normalized(reference);
      const existing = requirementByReference.get(key);
      if (existing) existing.rows.push(row);
      else requirementByReference.set(key, { reference, rows: [row] });
    }
  }

  const isExpired = (row: AssuranceRecord) => evaluateEvidenceEligibility(row.data, now).invalid;
  const isApproved = (row: AssuranceRecord) => evaluateEvidenceEligibility(row.data, now).current;

  const scopedIds = new Set<string>(), currentIds = new Set<string>();
  function evidenceFor(row: AssuranceRecord, reference: string, direct: AssuranceRecord[]) {
    const scope = row.inherited;
    if (!scope) return direct;
    const matches = new Map(direct.filter(item =>
      approvedAuditEvidence(item.data.status) && inAuditPeriod(clean(item.data.period), clean(item.data.collectedAt), scope.period)
    ).map(item => [item.id, item]));
    if (normalized(reference) === normalized(row.data.requirementRef)) {
      for (const pin of scope.pins) {
        const item = evidenceById.get(pin.id);
        if (item && item.data.versionNo === pin.version && item.data.contentSha256 === pin.hash
          && approvedAuditEvidence(item.data.status) && item.data.evidenceIntegrity === 'verified'
          && inAuditPeriod(clean(item.data.period), clean(item.data.collectedAt), scope.period)) matches.set(item.id, item);
        else matches.delete(pin.id);
      }
    }
    return [...matches.values()];
  }

  const requirementStates: AuditEvidenceRequirementState[] = Array.from(requirementByReference.values()).map(({ reference, rows }) => {
    const direct = evidenceByReference.get(normalized(reference)) || [];
    const byId = new Map<string, AssuranceRecord>();
    for (const row of rows) {
      scopedIds.add(row.id);
      const matches = evidenceFor(row, reference, direct);
      for (const item of matches) byId.set(item.id, item);
      if (matches.some(isApproved)) currentIds.add(row.id);
    }
    const linked = [...byId.values()];
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
      requirementIds: [...new Set(rows.map(row => row.id))],
      eligibilityIssues: [...new Set(linked.flatMap(row => { const eligibility = evaluateEvidenceEligibility(row.data, now); return eligibility.current ? [] : eligibility.reasons; }))],
      linkedEvidence: linked.length,
      currentEvidence: current.length,
      staleEvidence: stale.length,
      assessmentIssues: [...new Set(linked.map(row=>String(row.data.automationAssessment||'')).filter(state=>state&&state!=='current'))],
    };
  }).sort((a, b) => {
    const weight = (status: AuditEvidenceRequirementState["status"]) => status === "missing" ? 0 : status === "stale" ? 1 : 2;
    return weight(a.status) - weight(b.status) || a.reference.localeCompare(b.reference, "tr");
  });

  const coverageByAudit = new Map<string, AuditItemCoverage>();
  for (const row of requirements) {
    if (!scopedIds.has(row.id)) continue;
    const auditName = clean(row.data.auditName);
    const key = normalized(auditName);
    const tally = coverageByAudit.get(key) ?? {auditName, scoped:0, current:0};
    tally.scoped++;
    if (currentIds.has(row.id)) tally.current++;
    coverageByAudit.set(key, tally);
  }
  const currentStates = requirementStates.filter((item) => item.status === "current");
  const staleStates = requirementStates.filter((item) => item.status === "stale");
  const missingStates = requirementStates.filter((item) => item.status === "missing");
  const linkedStates = requirementStates.filter((item) => item.linkedEvidence > 0);
  const total = requirementStates.length;
  const readiness = total ? Math.round((currentStates.length / total) * 100) : 100;
  const coverage = total ? Math.round((linkedStates.length / total) * 100) : 100;
  const gate = total === 0 ? "empty" : readiness === 100 ? "ready" : readiness >= 80 && missingStates.length === 0 ? "attention" : "not-ready";

  return {
    itemCoverage: [...coverageByAudit.values()],
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
