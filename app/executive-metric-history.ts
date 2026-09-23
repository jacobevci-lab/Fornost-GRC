export type ExecutiveMetricKey =
  | "grc_health"
  | "high_critical_risks"
  | "control_effectiveness"
  | "compliance_readiness"
  | "evidence_freshness"
  | "overdue_actions"
  | "bia_resilience"
  | "ownership_coverage"
  | "kri_breaches"
  | "remediation_sla";

export type ExecutiveMetricUnit = "score" | "percent" | "count";
export type ExecutiveMetricDirection = "higher" | "lower";
export type ExecutiveMetricDefinition = {
  key: ExecutiveMetricKey;
  unit: ExecutiveMetricUnit;
  direction: ExecutiveMetricDirection;
  min: number;
  max: number;
};

export type ExecutiveMetricSnapshot = {
  metricKey: ExecutiveMetricKey;
  snapshotDay: string;
  value: number;
  unit: ExecutiveMetricUnit;
  capturedAt?: string;
};

export type ExecutiveMetricTrend = {
  metricKey: ExecutiveMetricKey;
  current: number | null;
  currentDay: string | null;
  baseline: number | null;
  baselineDay: string | null;
  delta: number | null;
  direction: ExecutiveMetricDirection;
  improved: boolean | null;
  historyAvailable: boolean;
};

export const EXECUTIVE_METRIC_DEFINITIONS: Record<ExecutiveMetricKey, ExecutiveMetricDefinition> = {
  grc_health: { key: "grc_health", unit: "score", direction: "higher", min: 0, max: 100 },
  high_critical_risks: { key: "high_critical_risks", unit: "count", direction: "lower", min: 0, max: 1_000_000 },
  control_effectiveness: { key: "control_effectiveness", unit: "percent", direction: "higher", min: 0, max: 100 },
  compliance_readiness: { key: "compliance_readiness", unit: "percent", direction: "higher", min: 0, max: 100 },
  evidence_freshness: { key: "evidence_freshness", unit: "percent", direction: "higher", min: 0, max: 100 },
  overdue_actions: { key: "overdue_actions", unit: "count", direction: "lower", min: 0, max: 1_000_000 },
  bia_resilience: { key: "bia_resilience", unit: "percent", direction: "higher", min: 0, max: 100 },
  ownership_coverage: { key: "ownership_coverage", unit: "percent", direction: "higher", min: 0, max: 100 },
  kri_breaches: { key: "kri_breaches", unit: "count", direction: "lower", min: 0, max: 1_000_000 },
  remediation_sla: { key: "remediation_sla", unit: "percent", direction: "higher", min: 0, max: 100 },
};

export const EXECUTIVE_METRIC_KEYS = Object.keys(EXECUTIVE_METRIC_DEFINITIONS) as ExecutiveMetricKey[];

export function isExecutiveMetricKey(value: unknown): value is ExecutiveMetricKey {
  return typeof value === "string" && value in EXECUTIVE_METRIC_DEFINITIONS;
}

export function normalizeMetricPeriod(value: unknown): 30 | 90 | 365 {
  const parsed = Number(value);
  if (parsed === 90 || parsed === 365) return parsed;
  return 30;
}

export function metricSnapshotDay(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid metric snapshot date");
  return date.toISOString().slice(0, 10);
}

export function validateExecutiveMetricValue(key: ExecutiveMetricKey, value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const definition = EXECUTIVE_METRIC_DEFINITIONS[key];
  if (parsed < definition.min || parsed > definition.max) return null;
  return Math.round(parsed * 100) / 100;
}

function dayNumber(day: string): number {
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86_400_000) : Number.NaN;
}

function baselineTolerance(periodDays: number): number {
  if (periodDays >= 365) return 15;
  if (periodDays >= 90) return 10;
  return 7;
}

export function buildExecutiveMetricTrends(
  snapshots: ExecutiveMetricSnapshot[],
  periodDays: 30 | 90 | 365,
  asOf: Date | string | number = new Date(),
): Record<ExecutiveMetricKey, ExecutiveMetricTrend> {
  const currentDay = metricSnapshotDay(asOf);
  const currentNumber = dayNumber(currentDay);
  const target = currentNumber - periodDays;
  const tolerance = baselineTolerance(periodDays);
  const output = {} as Record<ExecutiveMetricKey, ExecutiveMetricTrend>;

  for (const key of EXECUTIVE_METRIC_KEYS) {
    const definition = EXECUTIVE_METRIC_DEFINITIONS[key];
    const rows = snapshots
      .filter((item) => item.metricKey === key && Number.isFinite(dayNumber(item.snapshotDay)))
      .sort((a, b) => dayNumber(b.snapshotDay) - dayNumber(a.snapshotDay));
    const current = rows[0] ?? null;
    let baseline: ExecutiveMetricSnapshot | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      if (current && row.snapshotDay === current.snapshotDay) continue;
      const candidateDistance = Math.abs(dayNumber(row.snapshotDay) - target);
      if (candidateDistance <= tolerance && candidateDistance < distance) {
        baseline = row;
        distance = candidateDistance;
      }
    }
    const delta = current && baseline ? Math.round((current.value - baseline.value) * 100) / 100 : null;
    output[key] = {
      metricKey: key,
      current: current?.value ?? null,
      currentDay: current?.snapshotDay ?? null,
      baseline: baseline?.value ?? null,
      baselineDay: baseline?.snapshotDay ?? null,
      delta,
      direction: definition.direction,
      improved: delta === null ? null : delta === 0 ? null : definition.direction === "higher" ? delta > 0 : delta < 0,
      historyAvailable: Boolean(current && baseline),
    };
  }
  return output;
}
