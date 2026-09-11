import { cleanAiText } from "./security";

export type AiOperation="chat"|"drafts"|"agents"|"retrieval"|"evaluations";
export type AiActorRole="Admin"|"Editor"|"Viewer";
export type AiOperatingPolicy={emergencyStop:boolean;chatEnabled:boolean;draftsEnabled:boolean;agentsEnabled:boolean;retrievalEnabled:boolean;evaluationsEnabled:boolean;viewerChat:boolean;editorChat:boolean;maintenanceMessage:string;updatedBy:string|null;updatedAt:string|null};

export const DEFAULT_AI_OPERATING_POLICY:AiOperatingPolicy={emergencyStop:false,chatEnabled:true,draftsEnabled:true,agentsEnabled:true,retrievalEnabled:true,evaluationsEnabled:true,viewerChat:true,editorChat:true,maintenanceMessage:"",updatedBy:null,updatedAt:null};

export function mapAiOperatingPolicy(row:Record<string,unknown>|null):AiOperatingPolicy{
  if(!row)return DEFAULT_AI_OPERATING_POLICY;
  return {emergencyStop:!!row.emergency_stop,chatEnabled:!!row.chat_enabled,draftsEnabled:!!row.drafts_enabled,agentsEnabled:!!row.agents_enabled,retrievalEnabled:!!row.retrieval_enabled,evaluationsEnabled:!!row.evaluations_enabled,viewerChat:!!row.viewer_chat,editorChat:!!row.editor_chat,maintenanceMessage:cleanAiText(row.maintenance_message,300),updatedBy:cleanAiText(row.updated_by,320)||null,updatedAt:cleanAiText(row.updated_at,40)||null};
}

export async function getAiOperatingPolicy(db:D1Database){return mapAiOperatingPolicy(await db.prepare("SELECT * FROM ai_operating_policy WHERE id='default'").first<Record<string,unknown>>());}

export function evaluateAiAccess(policy:AiOperatingPolicy,role:AiActorRole,operation:AiOperation){
  if(policy.emergencyStop)return {allowed:false,code:"emergency-stop",message:policy.maintenanceMessage||"Fornost AI yönetici tarafından geçici olarak durduruldu."};
  const enabled={chat:policy.chatEnabled,drafts:policy.draftsEnabled,agents:policy.agentsEnabled,retrieval:policy.retrievalEnabled,evaluations:policy.evaluationsEnabled}[operation];
  if(!enabled)return {allowed:false,code:"operation-disabled",message:`${operation} işlemi AI operasyon politikasında devre dışı.`};
  if(operation==="chat"&&role==="Viewer"&&!policy.viewerChat)return {allowed:false,code:"role-denied",message:"Viewer rolü için AI sohbet erişimi kapalı."};
  if(operation==="chat"&&role==="Editor"&&!policy.editorChat)return {allowed:false,code:"role-denied",message:"Editor rolü için AI sohbet erişimi kapalı."};
  return {allowed:true,code:"allowed",message:""};
}

export async function checkAiAccess(db:D1Database,role:AiActorRole,operation:AiOperation){const policy=await getAiOperatingPolicy(db);return {...evaluateAiAccess(policy,role,operation),policy};}
