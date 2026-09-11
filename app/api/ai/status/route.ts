import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime, getAiSettings } from "@/app/ai/storage";
import {evaluateAiAccess,getAiOperatingPolicy} from "@/app/ai/operating-policy";

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const env = await aiRuntime(), row = await getAiSettings(env.DB),policy=await getAiOperatingPolicy(env.DB),chatAccess=evaluateAiAccess(policy,access.actor.role,"chat");
  return NextResponse.json({
    configured: !!row,
    enabled: !!row?.enabled,
    provider: row?.provider || null,
    model: row?.model || null,
    mode: "read-only-copilot",
    operational:!policy.emergencyStop,
    operatingState:policy.emergencyStop?"emergency-stop":chatAccess.allowed?"ready":"restricted",
    operatingMessage:chatAccess.message,
    capabilities:{chat:chatAccess.allowed,drafts:evaluateAiAccess(policy,access.actor.role,"drafts").allowed,agents:evaluateAiAccess(policy,access.actor.role,"agents").allowed,retrieval:evaluateAiAccess(policy,access.actor.role,"retrieval").allowed,evaluations:access.actor.role==="Admin"&&evaluateAiAccess(policy,access.actor.role,"evaluations").allowed},
  }, { headers: { "cache-control": "no-store" } });
}
