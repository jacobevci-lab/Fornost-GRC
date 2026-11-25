import {ensureContinuitySettings} from "../../../continuity/settings-store";
import {NextRequest,NextResponse} from "next/server";
import {requireRole,identityDb} from "../../auth/security";
import {canReadModule,canOpenModule} from "../../../module-access";

export async function GET(req:NextRequest){
  const auth=await requireRole(req,["Admin","Editor","Viewer"]);
  if(auth.response)return auth.response;
  if(!canReadModule(auth.actor,"BIA"))return new NextResponse(null,{status:403});
  const after=req.nextUrl.searchParams.get("after")||"";
  if(after.length>120)return new NextResponse(null,{status:400});
  const db=await identityDb();
  const settings=await db.prepare("SELECT json_extract(config_json,'$.dateFormat') AS format FROM platform_settings WHERE id='default'").first<{format:string}>();
  const allowed=canOpenModule(auth.actor,"İş Sürekliliği");
  // On a fresh installation the continuity workspace initializes its tables on first use.
  // A catalog read lets BIA offer the first plan without forcing that initialization.
  const initialized=allowed && await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='enterprise_continuity_plans'").first();
  if(initialized)await ensureContinuitySettings(db);
  const code="COALESCE((SELECT printf('BCP-%03d',sequence) FROM enterprise_continuity_plan_settings WHERE plan_id=p.id),p.code)";
  const plans=initialized?(await db.prepare(`SELECT p.id,${code} AS code,p.bia_ref AS biaRef FROM enterprise_continuity_plans p WHERE p.id>? ORDER BY p.id LIMIT 501`).bind(after).all<{id:string;code:string;biaRef:string}>()).results:[];
  const page=plans.slice(0,500);
  return NextResponse.json({dateFormat:settings?.format||"DD.MM.YYYY",plans:page,allowed,next:plans.length>500?page[page.length-1].id:null},{headers:{"cache-control":"private, no-store"}});
}
