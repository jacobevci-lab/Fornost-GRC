import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../auth/security";
import { isAiDraftKind } from "@/app/ai/drafts";
import { aiRuntime } from "@/app/ai/storage";
import { publicationModule } from "@/app/ai/publication";

function parseTitle(module: string, dataJson: string, id: string) {
  try {
    const data = JSON.parse(dataJson) as Record<string, unknown>;
    if (module === "Risk Assessment") return String(data.title || id).slice(0, 180);
    return `${String(data.auditName || "Denetim")} · ${String(data.requirementRef || id)} · ${String(data.requirementTitle || "")}`.slice(0, 240);
  } catch { return id; }
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const kind = req.nextUrl.searchParams.get("kind");
  if (!isAiDraftKind(kind)) return NextResponse.json({ error: "Geçersiz taslak türü." }, { status: 400 });
  const targetModule = publicationModule(kind);
  if (!targetModule) return NextResponse.json({ targets: [], publishable: false }, { headers: { "cache-control": "no-store" } });
  const env = await aiRuntime();
  const result = await env.DB.prepare("SELECT id,module,data_json FROM simple_grc_records WHERE module=? ORDER BY updated_at DESC LIMIT 500").bind(targetModule).all<{id:string;module:string;data_json:string}>();
  return NextResponse.json({ publishable: true, module: targetModule, targets: (result.results || []).map((row) => ({ id: row.id, module: row.module, title: parseTitle(row.module, row.data_json, row.id) })) }, { headers: { "cache-control": "no-store" } });
}
