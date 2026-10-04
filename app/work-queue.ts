import { dueTimestamp } from "./due-date";
const clean = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const nameKey = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const emailKey = (value: unknown) => clean(value).toLowerCase();

/** Names must match completely. Email-bearing values must match the email, not the display name. */
export function matchesWorkIdentity(values: string[], user: { name?: string; email?: string }): boolean {
  return values.some(value => value.split(/[;,|\n]+/).some(part => {
    const candidate = clean(part);
    if (!candidate) return false;
    const address = candidate.match(/<([^<>]+@[^<>]+)>$/)?.[1] || (candidate.includes("@") ? candidate : "");
    return address ? Boolean(user.email && emailKey(address) === emailKey(user.email))
      : Boolean(user.name && nameKey(candidate) === nameKey(user.name));
  }));
}
export function isDueToday(value: unknown, now: number): boolean {
  const due = dueTimestamp(value);
  return Number.isFinite(due) && new Date(due).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
}
export function paginateWork<T>(items: T[], requestedPage: number, size = 20) {
  const pageSize = Math.max(1, Math.floor(size) || 20);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pages - 1, Math.max(0, Math.floor(requestedPage) || 0));
  return { items: items.slice(page * pageSize, (page + 1) * pageSize), page, pages, start: items.length ? page * pageSize + 1 : 0, end: Math.min((page + 1) * pageSize, items.length), total: items.length };
}

/** Project authoritative CAPA records into the inbox without creating a second write path. */
export function findingWorkRows(payload: unknown) {
  const values = payload && typeof payload === "object" ? (payload as { findings?: unknown }).findings : null;
  if (!Array.isArray(values)) return [];
  return values.flatMap(value => {
    if (!value || typeof value !== "object" || !clean(value.id)) return [];
    return [{ id: `finding:${clean(value.id)}`, code: clean(value.code) || clean(value.id), module: "Bulgular ve CAPA", data: {
      title: clean(value.title), owner: clean(value.owner), reviewer: clean(value.reviewer),
      dueDate: clean(value.dueDate), acceptUntil: clean(value.acceptUntil), status: clean(value.status), severity: clean(value.severity),
    }, createdAt: clean(value.detectedAt || value.createdAt), updatedAt: clean(value.updatedAt) }];
  });
}

/** Acceptance pauses work; it is neither completion nor a permanent exemption. */
export function findingWorkDisposition(data: Record<string, unknown>, now: number): 'open' | 'closed' | 'accepted' | 'acceptance-expired' | 'acceptance-review' {
  const status = clean(data.status).toLowerCase();
  if (status === 'closed') return 'closed';
  if (status !== 'accepted') return 'open';
  const expiry = dueTimestamp(data.acceptUntil);
  if (!Number.isFinite(expiry)) return 'acceptance-review';
  return expiry < now ? 'acceptance-expired' : 'accepted';
}

/** Existing APIs are bounded. Reaching a bound or malformed data cannot establish a complete inbox. */
export function workSourcesComplete(grc: unknown, findings: unknown): boolean {
  const rows = (grc as {rows?: unknown})?.rows, items = (findings as {findings?: unknown})?.findings;
  if (!Array.isArray(rows) || rows.length >= 5000 || !Array.isArray(items) || items.length >= 3000) return false;
  return rows.every(row => {
    if (!row || typeof row.id !== 'string' || !row.id || typeof row.module !== 'string' || !row.module) return false;
    try { const data = row.data ?? JSON.parse(row.data_json); return data && typeof data === 'object' && !Array.isArray(data); } catch { return false; }
  }) && items.every(item => item && typeof item.id === 'string' && !!item.id && typeof item.status === 'string');
}
