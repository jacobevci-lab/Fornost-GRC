import {event} from "../../enterprise/http";
import type { NextRequest } from "next/server";
import { requireRole } from "../auth/security";
import { readBoundedJsonObject } from "../request-body";
import { canManage } from "../../enterprise/scope";
import { isScoped } from "../../module-access";
import { failure, reply } from "../../enterprise/http";
import { check, init, text, type Env } from "../../exchange/store";
import {
  configure,
  simulate,
  connectorView,
  openTicket,
  sync,
} from "../../exchange/connectors";
import { recoverTicket } from "../../exchange/ticket-recovery";
import { invite,invitationView,revokeInvitation } from "../../exchange/vendor";
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
      (!area||area==="vendor") &&
      user.role === "Editor" &&
      !isScoped(user) &&
      !user.orgScope?.restricted &&
      ((b.action === "invite"||b.action === "revoke-invite"||!write&&area==="vendor")
        ? await db
            .prepare(
              "SELECT 1 FROM third_party_profiles WHERE vendor_id=? AND lower(?) IN (lower(risk_owner),lower(business_owner))",
            )
            .bind(id, user.email)
            .first()
        : b.action === "ticket" || b.action === "recover-ticket"
          ? await db
              .prepare(
                "SELECT 1 FROM enterprise_findings WHERE id=? AND lower(owner)=lower(?)",
              )
              .bind(id, user.email)
              .first()
          : false);
    check(
      canManage(user)&&!isScoped(user) ||
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
      if(area==="vendor")return reply(await invitationView(db,id));
      if (area === "trust") return reply(await trustView(db, true));
      if (area === "connectors") return reply(await connectorView(db));
    } else {
      switch (b.action) {
        case "invite":
          return reply(await invite(env, req, id, user.email,{days:b.days,scope:b.scope}));
        case "revoke-invite":
          return reply(await revokeInvitation(db,id,text(b.invitation,64),user.email));
        case "publish":
          return reply(await publish(db, b, user.email));
        case "approve":
        case "revoke":
        case "reject":
          return reply(await decide(env, req, id, b.action, user.email));
        case "configure":
          return reply(await configure(env, b, user.email));
        case "simulate":
          return reply(await simulate(env,text(b.kind,20),b,user.email));
        case "sync":
        case "test":
          {
          const kind=text(b.kind,20);
          try{const result=await sync(env,kind,b.action==="test");await event(db,user.email,"connector-"+b.action,JSON.stringify({kind,status:"success"})).run();return reply(result);}
          catch(error){await event(db,user.email,"connector-"+b.action,JSON.stringify({kind,status:"error"})).run();throw error;}
          }
        case "recover-ticket":
          return reply(await recoverTicket(env, id, text(b.reference, 80)));
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
