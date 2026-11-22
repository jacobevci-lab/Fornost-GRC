import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { canWriteModule } from "../../../module-access";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor"]);
  if (auth.response) return auth.response;
  const scope=req.nextUrl.searchParams.get("module");
  const sourceModule = scope==="control" ? "Kontroller" : scope==="bia" ? "BIA" : scope === "asset" ? "Varlık Envanteri" : "Risk Assessment";
  if (!canWriteModule(auth.actor, sourceModule)) return new NextResponse(null, { status: 403 });
  const { env } = await import("cloudflare:workers");
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 254);
  const result = await env.DB.prepare(`SELECT name,email FROM local_users WHERE status='Active'
    AND (instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0) ORDER BY name COLLATE NOCASE,email LIMIT 51`)
    .bind(q, q).all<{ name: string; email: string }>();
  return NextResponse.json({ people: result.results.slice(0,50), complete: result.results.length <= 50 },
    { headers: { "cache-control": "private, no-store" } });
}
