import { readBoundedJsonObject } from "../../request-body";
import { failure, reply } from "../../../enterprise/http";
import { check, init, throttle, type Env } from "../../../exchange/store";
import { submitVendor, vendorContext } from "../../../exchange/vendor";
import { trustView, requestAccess, download } from "../../../exchange/trust";
import { inbound } from "../../../exchange/connectors";
type Context = { params: Promise<{ area: string }> };
async function handle(req: Request, ctx: Context, write: boolean) {
  try {
    const { area } = await ctx.params,
      { env: binding } = await import("cloudflare:workers"),
      env = binding as unknown as Env;
    await init(env.DB);
    const key = (req.headers.get("authorization") || "").replace(
      /^Bearer /,
      "",
    );
    if (area === "vendor") {
      if (write) {
        await throttle(env.DB, req, "vendor", 30);
        return reply(await submitVendor(env, req, key));
      }
      return reply({ name: (await vendorContext(env.DB, key)).name });
    }
    if (area === "trust")
      return reply(
        write
          ? await requestAccess(
              env.DB,
              req,
              await readBoundedJsonObject(req, 5000),
            )
          : await trustView(env.DB),
      );
    if (area === "download" && !write) return await download(env, key);
    if (write && area.startsWith("hook-"))
      return reply(
        await inbound(env, req, area.slice(5), () =>
          readBoundedJsonObject(req, 50000),
        ),
      );
    check(false, 404);
  } catch (e) {
    return failure(e);
  }
}
export const GET = (req: Request, ctx: Context) => handle(req, ctx, false);
export const POST = (req: Request, ctx: Context) => handle(req, ctx, true);
