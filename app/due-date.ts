/** Date-only GRC deadlines include the whole UTC calendar day, as in the APIs. */
export function dueTimestamp(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return Number.POSITIVE_INFINITY;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const time = Date.parse(dateOnly ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  if (dateOnly && new Date(time).toISOString().slice(0, 10) !== text) return Number.POSITIVE_INFINITY;
  return dateOnly ? time + 86_400_000 - 1 : time;
}

export function isPastDue(value: unknown, now = Date.now()): boolean {
  return dueTimestamp(value) < now;
}
