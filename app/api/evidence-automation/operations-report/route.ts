import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { loadContinuousAssuranceOperationsHealth } from "../../../evidence/operations-health";
import { buildContinuousAssuranceOperationsInsights } from "../../../evidence/operations-insights";
import {
  buildContinuousAssuranceOperationsCsv,
  buildContinuousAssuranceOperationsHtml,
  buildContinuousAssuranceOperationsReport,
} from "../../../evidence/operations-report";

type Env = Record<string, unknown> & { DB: D1Database };
type Format = "html" | "csv" | "json";

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const headers = (contentType: string, filename: string) => ({
  "content-type": contentType,
  "cache-control": "no-store",
  "content-disposition": `attachment; filename="${filename}"`,
  "x-content-type-options": "nosniff",
});

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;

  const requested = (req.nextUrl.searchParams.get("format") || "html").toLowerCase();
  if (!["html", "csv", "json"].includes(requested)) {
    return NextResponse.json({ error: "Unsupported report format" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const format = requested as Format;
  const tr = req.nextUrl.searchParams.get("lang") !== "en";
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Env;
  const now = new Date();

  try {
    const health = await loadContinuousAssuranceOperationsHealth(runtime.DB, now);
    const insights = buildContinuousAssuranceOperationsInsights(health);
    const snapshotId = `SHA256:${await digest(insights)}`;
    const report = buildContinuousAssuranceOperationsReport(insights, snapshotId);
    const date = report.generatedAt.slice(0, 10);

    if (format === "json") {
      return new NextResponse(JSON.stringify(report, null, 2), {
        headers: headers("application/json; charset=utf-8", `fornost-continuous-assurance-${date}.json`),
      });
    }
    if (format === "csv") {
      return new NextResponse(`\uFEFF${buildContinuousAssuranceOperationsCsv(report)}`, {
        headers: headers("text/csv; charset=utf-8", `fornost-continuous-assurance-${date}.csv`),
      });
    }
    return new NextResponse(buildContinuousAssuranceOperationsHtml(report, tr), {
      headers: headers("text/html; charset=utf-8", `fornost-continuous-assurance-${date}.html`),
    });
  } catch {
    return NextResponse.json({
      available: false,
      error: "Continuous Assurance operations report is unavailable",
      generatedAt: now.toISOString(),
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
