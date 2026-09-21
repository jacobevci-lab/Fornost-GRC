export type AssuranceQueueItem = {
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
  oldestPendingHours: number;
  averageReviewHours: number;
  withinSlaPercent: number;
};

const ACTIVE = new Set(["pending-review", "approved-awaiting-retest", "failed-retest", "retest-error"]);
const SLA_HOURS: Record<string, number> = {
  "capa-promotion": 24,
  "control-retest": 12,
};

const validDate = (value?: string) => {
  if (!value) return null;
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
  const start = validDate(item.createdAt) || validDate(item.updatedAt);
  if (!start) return 0;
  return Math.max(0, (now.getTime() - start.getTime()) / 3_600_000);
}

export function assuranceWorkSlaState(item: AssuranceQueueItem, now = new Date()) {
  if (!ACTIVE.has(item.status)) return "closed" as const;
  const age = assuranceWorkAgeHours(item, now);
  const sla = assuranceWorkSlaHours(item);
  if (age > sla) return "breached" as const;
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
    if (!created || !reviewed || reviewed < created) return [];
    return [(reviewed.getTime() - created.getTime()) / 3_600_000];
  });
  const breached = states.filter((state) => state === "breached").length;
  const dueSoon = states.filter((state) => state === "due-soon").length;
  return {
    active: activeItems.length,
    breached,
    dueSoon,
    oldestPendingHours: pendingAges.length ? Math.round(Math.max(...pendingAges)) : 0,
    averageReviewHours: reviewDurations.length ? Math.round((reviewDurations.reduce((sum, value) => sum + value, 0) / reviewDurations.length) * 10) / 10 : 0,
    withinSlaPercent: activeItems.length ? Math.round(((activeItems.length - breached) / activeItems.length) * 100) : 100,
  };
}
