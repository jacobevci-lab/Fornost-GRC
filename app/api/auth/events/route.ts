import { type NextRequest } from "next/server";
import { requireRole } from "../security";
import {
  authenticationRuntime,
  authJson,
} from "../../../authentication/runtime";
export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  const { db } = await authenticationRuntime(),
    offset = Math.min(
      100_000,
      Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0),
    );
  const rows = await db
    .prepare(
      "SELECT id,method,outcome,actor,reason,created_at FROM authentication_events ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ?",
    )
    .bind(Math.floor(offset))
    .all();
  return authJson({
    rows: rows.results.slice(0, 100),
    more: rows.results.length > 100,
  });
}
