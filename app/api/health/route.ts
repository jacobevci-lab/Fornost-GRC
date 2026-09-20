import { env } from "cloudflare:workers";

export async function GET() {
  const startedAt = Date.now();

  const checks = {
    database: { ok: false, detail: "not checked" },
    bucket: { ok: false, detail: "not checked" },
  };

  try {
    const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    checks.database = {
      ok: result?.ok === 1,
      detail: result?.ok === 1 ? "D1 query succeeded" : "Unexpected D1 response",
    };
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error instanceof Error ? error.message : "D1 query failed",
    };
  }

  try {
    await env.BUCKET.list({ limit: 1 });
    checks.bucket = { ok: true, detail: "R2 list succeeded" };
  } catch (error) {
    checks.bucket = {
      ok: false,
      detail: error instanceof Error ? error.message : "R2 check failed",
    };
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
