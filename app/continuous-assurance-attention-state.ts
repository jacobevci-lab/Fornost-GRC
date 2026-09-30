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

const clean = (value: unknown) => String(value ?? "").trim();
const timestamp = (value: unknown) => {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function selectCapaWorkItem(items: CapaWorkItem[], findingId: string) {
  const ref = clean(findingId);
  if (!ref) return undefined;
  return items
    .filter((item) => item.action === "capa-promotion" && clean(item.findingId) === ref)
    .sort((a, b) => timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt))[0];
}

export function capaGovernanceState(
  hasFinding: boolean,
  governanceAvailable: boolean,
  item?: CapaWorkItem,
): CapaGovernanceState {
  if (!hasFinding) return "not-applicable";
  if (!governanceAvailable) return "unavailable";
  if (!item) return "ready";
  if (item.status === "pending-review") return "pending-review";
  if (item.status === "completed") return "completed";
  if (item.status === "rejected") return "rejected";
  return "other";
}
