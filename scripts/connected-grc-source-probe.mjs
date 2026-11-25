/** Preserve QA progress without copying request errors (which can contain cookies). */
export async function probeConnectedGrcSource(request, url, headers) {
  try {
    const response = await request.get(url, { headers, timeout: 30_000 });
    const status = response.status();
    if (!response.ok()) return { ok: false, status, reason: "http", payload: null };
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, status, reason: "invalid-response", payload: null };
      }
      return { ok: true, status, payload };
    } catch {
      return { ok: false, status, reason: "invalid-response", payload: null };
    }
  } catch {
    return { ok: false, status: null, reason: "request-failed", payload: null };
  }
}
