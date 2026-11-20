import { NextRequest, NextResponse } from "next/server";
import { requireRole, identityDb } from "../auth/security";
import { JsonBodyError, readBoundedJsonObject } from "../request-body";
import { activateLicense, LicenseError, publisherKey, readLicense } from "../../licensing/store";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  return json(publisherKey ? await readLicense(await identityDb()) : { status: "internal" });
}
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  if (!publisherKey) return json({ code: "internal" }, 409);
  try {
    const body = await readBoundedJsonObject(req, 10000);
    if (typeof body.license !== "string") return json({ code: "invalid" }, 400);
    return json(await activateLicense(await identityDb(), body.license.trim(), auth.actor.email));
  } catch (err) {
    if (err instanceof JsonBodyError) return json({ code: "invalid" }, err.status);
    if (err instanceof LicenseError) return json({ code: err.code }, err.code === "revision" ? 409 : 422);
    throw err;
  }
}
