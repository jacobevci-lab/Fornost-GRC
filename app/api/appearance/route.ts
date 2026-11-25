import {NextRequest, NextResponse} from "next/server";
import {identityDb, requireRole} from "../auth/security";
import {JsonBodyError, readBoundedJsonObject} from "../request-body";
import {isPalette} from "../../appearance-palettes";

function reply(body: object, status = 200) {
  return NextResponse.json(body, {status, headers: {"cache-control":"no-store"}});
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin","Editor","Viewer"]);
  if (access.response) return access.response;
  const db = await identityDb();
  const row = await db.prepare("SELECT palette FROM user_appearance WHERE user_id=?")
    .bind(access.actor.id).first<{palette:string}>();
  return reply({palette:isPalette(row?.palette) ? row.palette : "default"});
}

export async function PUT(req: NextRequest) {
  const access = await requireRole(req, ["Admin","Editor","Viewer"]);
  if (access.response) return access.response;
  let body;
  try {
    body = await readBoundedJsonObject(req, 512);
  } catch (error) {
    if (error instanceof JsonBodyError) return reply({error:error.message},error.status);
    throw error;
  }
  if (!isPalette(body.palette) || Object.keys(body).length !== 1) {
    return reply({error:"Invalid palette"},400);
  }
  const db = await identityDb();
  await db.prepare("INSERT INTO user_appearance(user_id,palette) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET palette=excluded.palette")
    .bind(access.actor.id, body.palette).run();
  return reply({palette:body.palette});
}
