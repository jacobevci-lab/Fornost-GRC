import { withBasePath } from "./base-path";
import { connectedAiSourceComplete, connectedGrcEndpoints, type ConnectedGrcEnterprisePayloads } from "./connected-grc-sources";

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
  await Promise.all(endpoints.map(async endpoint => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => { controller.abort(); reject(new Error("Source cancelled")); };
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(cancel, timeoutMs);
      if (signal.aborted) cancel();
    });
    try {
      if (signal.aborted) return;
      const body = await Promise.race([interrupted, (async () => {
        const response = await fetcher(withBasePath(endpoint.path), {
          signal: controller.signal, headers: { accept: "application/json" }, cache: "no-store",
        });
        if (!response.ok) throw new Error("Source unavailable");
        return response.json();
      })()]);
      if (!signal.aborted && body && typeof body === "object" && !Array.isArray(body)) {
        payloads[endpoint.key] = body;
        if (connectedAiSourceComplete(endpoint.key, body)) ready++;
      }
    } catch {
      // A failed source must not discard successful sources or expose response details.
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      // Also releases an interrupted promise when the caller was already cancelled.
      interrupted.catch(() => {});
    }
  }));
  return { payloads, ready, total: endpoints.length };
}
