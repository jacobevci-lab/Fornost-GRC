import { NextRequest, NextResponse } from "next/server";
import { identityDb, requireRole } from "../../auth/security";
import { JsonBodyError, readBoundedJsonObject } from "../../request-body";
import { sessionRevocationTarget } from "../../../user-session-actions";

export async function DELETE(req: NextRequest) {
  const access = await requireRole(req, ["Admin"]);
  if (access.response) return access.response;
  let body: Record<string, unknown>;
  try { body = await readBoundedJsonObject(req, 4096); }
  catch (error) {
    if (error instanceof JsonBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const userId = sessionRevocationTarget(body);
  if (!userId) return NextResponse.json({ error: "Geçerli bir kullanıcı kimliği gerekli." }, { status: 400 });
  const db = await identityDb();
  const user = await db.prepare("SELECT id FROM local_users WHERE id=?").bind(userId).first<{id:string}>();
  if (!user) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  const eventId = crypto.randomUUID(), now = new Date().toISOString();
  const result = await db.batch([
    db.prepare("DELETE FROM local_sessions WHERE user_id=?").bind(userId),
    db.prepare("INSERT INTO user_access_events(id,user_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)")
      .bind(eventId,userId,access.actor.email,"null",JSON.stringify({operation:"revoke-local-sessions"}),now),
  ]);
  return NextResponse.json({ ok:true, revokedSessions:result[0]?.meta?.changes ?? null, currentSessionRevoked:access.actor.source === "local" && access.actor.id === userId }, {headers:{"cache-control":"no-store"}});
}
