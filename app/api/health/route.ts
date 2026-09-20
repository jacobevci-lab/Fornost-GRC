export async function GET() {
  const startedAt = Date.now();
  const { env } = await import("cloudflare:workers");

  const checks = {
    database: { ok: false, detail: "not checked" },
    bucket: { ok: false, detail: "not checked" },
  };

  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    checks.database = {
      ok: result?.ok === 1,
      detail: result?.ok === 1 ? "D1 query succeeded" : "D1 check failed",
    };
  } catch {
    checks.database = { ok: false, detail: "D1 check failed" };
  }

  try {
    if (!env.BUCKET) throw new Error("R2 binding missing");
    await env.BUCKET.get("__fornost_health_probe__");
    checks.bucket = { ok: true, detail: "R2 read probe succeeded" };
  } catch {
    checks.bucket = { ok: false, detail: "R2 check failed" };
  }

  const ok = checks.database.ok && checks.bucket.ok;

  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      checks,
      elapsedMs: Date.now() - startedAt,
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
