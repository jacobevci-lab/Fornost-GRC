export type CapaWorkItem = {
  id: string;
  findingId: string;
  ruleId?: string;
  action: string;
  status: string;
  resultRef?: string;
  resultCode?: string;
  targetControlRef?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type CapaGovernanceState =
  | "not-applicable"
  | "unavailable"
  | "ready"
  | "pending-review"
  | "completed"
  | "rejected"
  | "other";

export type EnterpriseFindingSnapshot = {
  id?: string;
  code?: string;
  status?: string;
  evidenceReference?: string;
  verificationEvidenceReference?: string;
  recurrenceCount?: number;
};

export type CapaTraceabilityState =
  | "not-promoted"
  | "remediation-open"
  | "remediation-active"
  | "verification"
  | "closed"
  | "accepted"
  | "unresolved";

const clean = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => clean(value).toLowerCase();
const timestamp = (value: unknown) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const workItemStatePriority = (item: CapaWorkItem) => {
  const status = normalized(item.status);
  if (status === "pending-review") return 4;
  if (status === "completed" && clean(item.resultRef)) return 3;
  if (status === "rejected") return 2;
  return 1;
};

export function selectCapaWorkItem(items: CapaWorkItem[], findingId: string) {
  const ref = clean(findingId);
  if (!ref) return undefined;
  return items
    .filter((item) => normalized(item.action) === "capa-promotion" && clean(item.findingId) === ref)
    .sort((a, b) => {
      const byTime = timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt);
      if (byTime !== 0) return byTime;
      return workItemStatePriority(b) - workItemStatePriority(a);
    })[0];
}

export function capaGovernanceState(
  hasFinding: boolean,
  governanceAvailable: boolean,
  item?: CapaWorkItem,
): CapaGovernanceState {
  if (!hasFinding) return "not-applicable";
  if (!governanceAvailable) return "unavailable";
  if (!item) return "ready";
  const status = normalized(item.status);
  if (status === "pending-review") return "pending-review";
  if (status === "completed") return clean(item.resultRef) ? "completed" : "other";
  if (status === "rejected") return "rejected";
  return "other";
}

export function capaTraceabilityState(
  item?: CapaWorkItem,
  finding?: EnterpriseFindingSnapshot,
): CapaTraceabilityState {
  if (!item || normalized(item.status) !== "completed" || !clean(item.resultRef)) return "not-promoted";
  if (!finding || clean(finding.id) !== clean(item.resultRef)) return "unresolved";

  const status = normalized(finding.status);
  if (status === "open") return "remediation-open";
  if (status === "in-progress") return "remediation-active";
  if (status === "verification") return "verification";
  if (status === "closed") return "closed";
  if (status === "accepted") return "accepted";
  return "unresolved";
}

export function capaTraceabilityIntegrity(
  item?: CapaWorkItem,
  finding?: EnterpriseFindingSnapshot,
) {
  const state = capaTraceabilityState(item, finding);
  return {
    state,
    promoted: state !== "not-promoted" && state !== "unresolved",
    remediationEvidencePresent: Boolean(clean(finding?.evidenceReference)),
    verificationEvidencePresent: Boolean(clean(finding?.verificationEvidenceReference)),
    recurrenceCount: Math.max(0, Number(finding?.recurrenceCount || 0)),
  };
}
