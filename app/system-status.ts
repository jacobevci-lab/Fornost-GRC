/** Health snapshots are observations, never proof of backup or integration delivery. */
export type ProbeState = "ok" | "error" | "unknown";
export type SystemStatus = { database: ProbeState; bucket: ProbeState };
export type IntegrationStatus = { state: ProbeState; testedAt: string | null };
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function parseSystemStatus(value: unknown): SystemStatus {
  const checks = record(record(value)?.checks);
  const probe = (key: string): ProbeState => {
    const ok = record(checks?.[key])?.ok;
    return ok === true ? "ok" : ok === false ? "error" : "unknown";
  };
  return { database: probe("database"), bucket: probe("bucket") };
}
export function parseIntegrationStatus(value: unknown, kind: string): IntegrationStatus {
  const body = record(value);
  const row = body?.available === false ? null : record(record(body?.health)?.[kind]);
  const testedAt = typeof row?.testedAt === "string" && Number.isFinite(Date.parse(row.testedAt)) ? row.testedAt : null;
  return { state: testedAt && row?.status === "success" ? "ok" : testedAt && row?.status === "error" ? "error" : "unknown", testedAt };
}
