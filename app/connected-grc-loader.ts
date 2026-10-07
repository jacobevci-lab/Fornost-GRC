import { withBasePath } from "./base-path";
import { connectedSourceValidity, connectedGrcEndpoints, type ConnectedGrcEnterprisePayloads } from "./connected-grc-sources";

export type ConnectedSourceIssue = {
  key: keyof ConnectedGrcEnterprisePayloads;
  reason: "timeout" | "access" | "unavailable" | "invalid" | "incomplete";
};

export const CONNECTED_GRC_SOURCE_TIMEOUT_MS = 15_000;

/** Bound both response headers and body parsing; cancellation never publishes late data. */
export async function loadConnectedGrcSources({ includeAi, signal, fetcher = fetch, timeoutMs = CONNECTED_GRC_SOURCE_TIMEOUT_MS }: {
  includeAi: boolean;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  const endpoints = connectedGrcEndpoints(includeAi);
  const payloads: ConnectedGrcEnterprisePayloads = {};
  let ready = 0;
  const issues: ConnectedSourceIssue[] = [];
  await Promise.all(endpoints.map(async endpoint => {
    if (signal.aborted) return;
    const controller = new AbortController();
    let reason: ConnectedSourceIssue["reason"] = "unavailable";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => { controller.abort(); reject(new Error("Source cancelled")); };
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => { reason = "timeout"; cancel(); }, timeoutMs);
      if (signal.aborted) cancel();
    });
    try {
      if (signal.aborted) return;
      const body = await Promise.race([interrupted, (async () => {
        const response = await fetcher(withBasePath(endpoint.path), {
          signal: controller.signal, headers: { accept: "application/json" }, cache: "no-store",
        });
        if (!response.ok) {
          reason = response.status === 401 || response.status === 403 ? "access" : "unavailable";
          throw new Error("Source unavailable");
        }
        reason = "invalid";
        return response.json();
      })()]);
      if (!signal.aborted && body && typeof body === "object" && !Array.isArray(body)) {
        const validity = connectedSourceValidity(endpoint.key, body);
        // Malformed identities must never become fabricated or deduplicated nodes.
        if (validity !== "invalid") payloads[endpoint.key] = body;
        if (validity === "ready") ready++;
        else issues.push({ key: endpoint.key, reason: validity });
      } else if (!signal.aborted) issues.push({ key: endpoint.key, reason: "invalid" });
    } catch {
      if (!signal.aborted) issues.push({ key: endpoint.key, reason });
      // A failed source must not discard successful sources or expose response details.
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      // Also releases an interrupted promise when the caller was already cancelled.
      interrupted.catch(() => {});
    }
  }));
  return { payloads, ready, total: endpoints.length, issues: issues.sort((a,b) => a.key.localeCompare(b.key)) };
}
