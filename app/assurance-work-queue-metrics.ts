import {assuranceSourceReady,type AssuranceSourceState} from "./assurance-queue-context";
export type AssuranceQueueItem = {
  sourceState?: AssuranceSourceState;
  action: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string;
  completedAt?: string;
  severity?: string;
};

export type AssuranceQueueHealth = {
  active: number;
  breached: number;
  dueSoon: number;
  unknown: number;
  oldestPendingHours: number | null;
  averageReviewHours: number | null;
  withinSlaPercent: number | null;
};

const ACTIVE = new Set(["pending-review", "approved-awaiting-retest", "failed-retest", "retest-error"]);
const SLA_HOURS: Record<string, number> = {
  "capa-promotion": 24,
  "control-retest": 12,
};

// Work timestamps are instants, never locale-dependent dates. Reject normalized
// impossible dates (e.g. February 30) and values without an explicit timezone.
const validDate = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:[0-5]\d)$/.test(value)) return null;
  const day = new Date(`${value.slice(0,10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value.slice(0,10)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export function assuranceWorkSlaHours(item: AssuranceQueueItem) {
  const base = SLA_HOURS[item.action] || 24;
  const severity = String(item.severity || "").toLowerCase();
  if (severity === "critical") return Math.min(base, 4);
  if (severity === "high") return Math.min(base, 8);
  return base;
}

export function assuranceWorkAgeHours(item: AssuranceQueueItem, now = new Date()) {
  const start = validDate(item.createdAt);
  if (!start || !Number.isFinite(now.getTime()) || start > now) return null;
  return (now.getTime() - start.getTime()) / 3_600_000;
}

export function assuranceWorkSlaState(item: AssuranceQueueItem, now = new Date()) {
  if (!ACTIVE.has(item.status)) return "closed" as const;
  if (!assuranceSourceReady(item)) return "unknown" as const;
  const age = assuranceWorkAgeHours(item, now);
  if (age === null) return "unknown" as const;
  const sla = assuranceWorkSlaHours(item);
  if (age >= sla) return "breached" as const;
  if (age >= sla * .75) return "due-soon" as const;
  return "within-sla" as const;
}

export function summarizeAssuranceQueue(items: AssuranceQueueItem[], now = new Date()): AssuranceQueueHealth {
  const activeItems = items.filter((item) => ACTIVE.has(item.status));
  const states = activeItems.map((item) => assuranceWorkSlaState(item, now));
  const pendingAges = items.filter((item) => item.status === "pending-review").map((item) => assuranceWorkAgeHours(item, now));
  const reviewDurations = items.flatMap((item) => {
    const created = validDate(item.createdAt);
    const reviewed = validDate(item.reviewedAt);
    if (!created || !reviewed || reviewed < created || reviewed > now || !Number.isFinite(now.getTime())) return [];
    return [(reviewed.getTime() - created.getTime()) / 3_600_000];
  });
  const unknown = states.filter(state => state === "unknown").length;
  const knownPendingAges = pendingAges.filter((age): age is number => age !== null);
  const breached = states.filter((state) => state === "breached").length;
  const dueSoon = states.filter((state) => state === "due-soon").length;
  return {
    active: activeItems.length,
    unknown,
    breached,
    dueSoon,
    oldestPendingHours: knownPendingAges.length && knownPendingAges.length === pendingAges.length ? Math.round(Math.max(...knownPendingAges)) : null,
    averageReviewHours: reviewDurations.length ? Math.round((reviewDurations.reduce((sum, value) => sum + value, 0) / reviewDurations.length) * 10) / 10 : null,
    withinSlaPercent: activeItems.length && !unknown ? Math.round(((activeItems.length - breached) / activeItems.length) * 100) : null,
  };
}
