/** Absolute lifetime of application-issued sessions; upstream SSO is governed separately. */
export const DEFAULT_SESSION_MINUTES = 30;
export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = 720;
export function sessionTimeoutMinutes(configJson: string | null | undefined): number {
  if (configJson == null) return DEFAULT_SESSION_MINUTES;
  try {
    const config: unknown = JSON.parse(configJson);
    if (!config || typeof config !== "object" || Array.isArray(config)) return MIN_SESSION_MINUTES;
    const value = (config as Record<string, unknown>).sessionTimeoutMinutes;
    if (value === undefined) return DEFAULT_SESSION_MINUTES;
    if (typeof value !== "number" && typeof value !== "string") return MIN_SESSION_MINUTES;
    const minutes = Number(value);
    return Number.isInteger(minutes) && minutes >= MIN_SESSION_MINUTES && minutes <= MAX_SESSION_MINUTES ? minutes : MIN_SESSION_MINUTES;
  } catch { return MIN_SESSION_MINUTES; }
}
export function sessionExpired(createdAt: string, expiresAt: string, minutes: number, now = Date.now()): boolean {
  const created = Date.parse(createdAt), expires = Date.parse(expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(created) || !Number.isFinite(expires) || created > now || expires <= created) return true;
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES) return true;
  // A relaxed policy never extends a previously issued session.
  return now >= Math.min(expires, created + minutes * 60_000);
}
