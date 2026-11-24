import type { NextRequest } from "next/server";
import { requireRole } from "../auth/security";
import { readBoundedJsonObject } from "../request-body";
import { canManage } from "../../enterprise/scope";
import { isScoped } from "../../module-access";
import { failure, reply } from "../../enterprise/http";
import { check, init, text, type Env } from "../../exchange/store";
import {
  configure,
  connectorView,
  openTicket,
  sync,
} from "../../exchange/connectors";
import { invite } from "../../exchange/vendor";
import { decide, publish, trustView } from "../../exchange/trust";
import { createBoard, readBoard } from "../../exchange/board";
async function handle(req: NextRequest, write: boolean) {
  const a = await requireRole(req, ["Admin", "Viewer", "Editor"]);
  if (a.response) return a.response;
  try {
    const area = req.nextUrl.searchParams.get("area"),
      user = a.actor;
    const { env: binding } = await import("cloudflare:workers");
    const env = binding as unknown as Env,
      db = env.DB;
    await init(db);
    const b = write ? await readBoundedJsonObject(req, 90000) : {},
      id = text(b.id || req.nextUrl.searchParams.get("id"), 128);
    const ownedWrite =
      write &&
      !area &&
      user.role === "Editor" &&
      !isScoped(user) &&
      !user.orgScope?.restricted &&
      (b.action === "invite"
        ? await db
            .prepare(
              "SELECT 1 FROM third_party_profiles WHERE vendor_id=? AND lower(?) IN (lower(risk_owner),lower(business_owner))",
            )
            .bind(id, user.email)
            .first()
        : b.action === "ticket"
          ? await db
              .prepare(
                "SELECT 1 FROM enterprise_findings WHERE id=? AND lower(owner)=lower(?)",
              )
              .bind(id, user.email)
              .first()
          : false);
    check(
      canManage(user) ||
        ownedWrite ||
        (area === "board" &&
          user.orgScope?.role === "group-ciso" &&
          !user.orgScope.restricted &&
          !isScoped(user)),
      403,
      "scope",
    );
    if (area === "board")
      return reply(
        write
          ? await createBoard(db, b, user.email)
          : id
            ? await readBoard(db, id)
            : { available: true },
      );
    if (!write) {
      if (area === "trust") return reply(await trustView(db, true));
      if (area === "connectors") return reply(await connectorView(db));
    } else {
      switch (b.action) {
        case "invite":
          return reply(await invite(env, req, id, user.email));
        case "publish":
          return reply(await publish(db, b, user.email));
        case "approve":
        case "revoke":
          return reply(await decide(env, req, id, b.action, user.email));
        case "configure":
          return reply(await configure(env, b, user.email));
        case "sync":
        case "test":
          return reply(await sync(env, text(b.kind, 20), b.action === "test"));
        case "ticket":
          return reply(await openTicket(env, id));
      }
    }
    return reply({ code: "input" }, 400);
  } catch (e) {
    return failure(e);
  }
}
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
