export type ExecutiveDashboardWidgetId =
  | "riskHeatmap"
  | "actionCenter"
  | "recentChanges"
  | "frameworkReadiness"
  | "assuranceHealth"
  | "auditRemediation";

export type ExecutiveDashboardPresetId = "executive" | "risk" | "assurance";

export type ExecutiveDashboardPreferences = {
  preset: ExecutiveDashboardPresetId;
  visible: Record<ExecutiveDashboardWidgetId, boolean>;
  order: ExecutiveDashboardWidgetId[];
  compact: boolean;
};

export const EXECUTIVE_DASHBOARD_STORAGE_KEY = "fornost:executive-dashboard:v4";
export const EXECUTIVE_DASHBOARD_PREFERENCES_SCHEMA_VERSION = 1;

export const EXECUTIVE_DASHBOARD_WIDGETS: ExecutiveDashboardWidgetId[] = [
  "riskHeatmap",
  "actionCenter",
  "recentChanges",
  "frameworkReadiness",
  "assuranceHealth",
  "auditRemediation",
];

export const EXECUTIVE_DASHBOARD_DEFAULT_ORDER: ExecutiveDashboardWidgetId[] = [
  "riskHeatmap",
  "actionCenter",
  "recentChanges",
  "frameworkReadiness",
  "assuranceHealth",
  "auditRemediation",
];

export const EXECUTIVE_DASHBOARD_PRESETS: Record<ExecutiveDashboardPresetId, ExecutiveDashboardPreferences> = {
  executive: {
    preset: "executive",
    compact: false,
    order: EXECUTIVE_DASHBOARD_DEFAULT_ORDER,
    visible: {
      riskHeatmap: true,
      actionCenter: true,
      recentChanges: true,
      frameworkReadiness: true,
      assuranceHealth: true,
      auditRemediation: true,
    },
  },
  risk: {
    preset: "risk",
    compact: false,
    order: ["riskHeatmap", "actionCenter", "recentChanges", "frameworkReadiness", "assuranceHealth", "auditRemediation"],
    visible: {
      riskHeatmap: true,
      actionCenter: true,
      recentChanges: true,
      frameworkReadiness: true,
      assuranceHealth: false,
      auditRemediation: false,
    },
  },
  assurance: {
    preset: "assurance",
    compact: false,
    order: ["actionCenter", "frameworkReadiness", "assuranceHealth", "auditRemediation", "recentChanges", "riskHeatmap"],
    visible: {
      riskHeatmap: false,
      actionCenter: true,
      recentChanges: true,
      frameworkReadiness: true,
      assuranceHealth: true,
      auditRemediation: true,
    },
  },
};

export function cloneExecutiveDashboardPreferences(source: ExecutiveDashboardPreferences): ExecutiveDashboardPreferences {
  return { ...source, order: [...source.order], visible: { ...source.visible } };
}

export function isExecutiveDashboardPresetId(value: unknown): value is ExecutiveDashboardPresetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EXECUTIVE_DASHBOARD_PRESETS, value);
}

export function isExecutiveDashboardWidgetId(value: unknown): value is ExecutiveDashboardWidgetId {
  return typeof value === "string" && EXECUTIVE_DASHBOARD_WIDGETS.includes(value as ExecutiveDashboardWidgetId);
}

export function normalizeExecutiveDashboardPreferences(input: unknown): ExecutiveDashboardPreferences {
  const candidate = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const preset = isExecutiveDashboardPresetId(candidate.preset) ? candidate.preset : "executive";
  const baseline = cloneExecutiveDashboardPreferences(EXECUTIVE_DASHBOARD_PRESETS[preset]);

  const seen = new Set<ExecutiveDashboardWidgetId>();
  const order = (Array.isArray(candidate.order) ? candidate.order : []).reduce<ExecutiveDashboardWidgetId[]>((result, item) => {
    if (!isExecutiveDashboardWidgetId(item) || seen.has(item)) return result;
    seen.add(item);
    result.push(item);
    return result;
  }, []);
  for (const widget of EXECUTIVE_DASHBOARD_DEFAULT_ORDER) if (!seen.has(widget)) order.push(widget);

  const visible = { ...baseline.visible };
  if (candidate.visible && typeof candidate.visible === "object" && !Array.isArray(candidate.visible)) {
    const rawVisible = candidate.visible as Record<string, unknown>;
    for (const widget of EXECUTIVE_DASHBOARD_WIDGETS) {
      if (typeof rawVisible[widget] === "boolean") visible[widget] = rawVisible[widget] as boolean;
    }
  }

  return {
    preset,
    order,
    visible,
    compact: typeof candidate.compact === "boolean" ? candidate.compact : baseline.compact,
  };
}

export function executiveDashboardPreferencesFingerprint(preferences: ExecutiveDashboardPreferences) {
  return JSON.stringify(normalizeExecutiveDashboardPreferences(preferences));
}
