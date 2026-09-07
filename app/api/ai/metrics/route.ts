import { NextRequest,NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { aiRuntime } from "@/app/ai/storage";

const number=(value:unknown)=>Number(value||0);
export async function GET(req:NextRequest){
  const access=await requireRole(req,["Admin"]);if(access.response)return access.response;
  const {DB}=await aiRuntime(),since=new Date(Date.now()-7*86400000).toISOString();
  const [activity,drafts,published,tickets,daily,models,errors,governance,evaluations,failover,agents,agentDrafts]=await Promise.all([
    DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) success,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors,SUM(CASE WHEN status='denied' THEN 1 ELSE 0 END) denied,ROUND(AVG(CASE WHEN latency_ms>0 THEN latency_ms END)) average_latency FROM ai_activity_logs WHERE created_at>=?`).bind(since).first<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) rejected FROM ai_action_drafts`).first<Record<string,unknown>>(),
    DB.prepare("SELECT COUNT(*) total FROM ai_draft_publications").first<Record<string,unknown>>(),
    DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='created' THEN 1 ELSE 0 END) created,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM ai_draft_tickets").first<Record<string,unknown>>(),
    DB.prepare(`SELECT substr(created_at,1,10) day,COUNT(*) total,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) success,SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors FROM ai_activity_logs WHERE created_at>=? GROUP BY substr(created_at,1,10) ORDER BY day`).bind(since).all<Record<string,unknown>>(),
    DB.prepare(`SELECT provider,model,COUNT(*) requests,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) success FROM ai_activity_logs WHERE created_at>=? GROUP BY provider,model ORDER BY requests DESC LIMIT 10`).bind(since).all<Record<string,unknown>>(),
    DB.prepare(`SELECT action,provider,model,detail,created_at FROM ai_activity_logs WHERE status='error' ORDER BY created_at DESC LIMIT 8`).all<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN review_date<date('now') THEN 1 ELSE 0 END) overdue FROM ai_use_cases`).first<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) passed FROM ai_eval_runs WHERE created_at>=?`).bind(since).first<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total FROM ai_provider_health WHERE profile='fallback' AND status='success' AND created_at>=?`).bind(since).first<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM ai_agent_runs WHERE created_at>=?`).bind(since).first<Record<string,unknown>>(),
    DB.prepare(`SELECT COUNT(*) total FROM ai_agent_draft_links WHERE created_at>=?`).bind(since).first<Record<string,unknown>>(),
  ]);
  const total=number(activity?.total),success=number(activity?.success),reviewed=number(drafts?.approved)+number(drafts?.rejected);
  const evalTotal=number(evaluations?.total),evalPassed=number(evaluations?.passed);
  return NextResponse.json({windowDays:7,activity:{total,success,errors:number(activity?.errors),denied:number(activity?.denied),successRate:total?Math.round(success*1000/total)/10:0,averageLatencyMs:number(activity?.average_latency)},drafts:{total:number(drafts?.total),pending:number(drafts?.pending),approved:number(drafts?.approved),rejected:number(drafts?.rejected),approvalRate:reviewed?Math.round(number(drafts?.approved)*1000/reviewed)/10:0},outputs:{recordPublications:number(published?.total),ticketsCreated:number(tickets?.created),ticketFailures:number(tickets?.failed)},governance:{total:number(governance?.total),approved:number(governance?.approved),overdue:number(governance?.overdue),evaluationRuns:evalTotal,evaluationPassRate:evalTotal?Math.round(evalPassed*1000/evalTotal)/10:0,fallbackActivations:number(failover?.total)},agents:{runs:number(agents?.total),approved:number(agents?.approved),failed:number(agents?.failed),draftsCreated:number(agentDrafts?.total)},daily:daily.results||[],models:models.results||[],recentErrors:(errors.results||[]).map(row=>({action:row.action,provider:row.provider,model:row.model,detail:row.detail,createdAt:row.created_at}))},{headers:{"cache-control":"no-store"}});
}
