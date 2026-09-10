import { cleanAiText,redactSensitiveText } from "./security";

export const AI_FEEDBACK_KINDS=["helpful","incorrect","incomplete","unsafe"] as const;
export const AI_FEEDBACK_SEVERITIES=["low","medium","high","critical"] as const;
export const AI_FEEDBACK_STATUSES=["open","in_review","resolved","dismissed"] as const;
export type AiFeedbackKind=typeof AI_FEEDBACK_KINDS[number];
export type AiFeedbackSeverity=typeof AI_FEEDBACK_SEVERITIES[number];
export type AiFeedbackStatus=typeof AI_FEEDBACK_STATUSES[number];

export function validateAiFeedback(input:Record<string,unknown>){
  const activityId=cleanAiText(input.activityId,100),kind=cleanAiText(input.kind,20) as AiFeedbackKind;
  if(!activityId||!AI_FEEDBACK_KINDS.includes(kind))throw new Error("Geçerli AI yanıtı ve geri bildirim türü gereklidir.");
  let severity=cleanAiText(input.severity,20).toLowerCase() as AiFeedbackSeverity;
  if(!AI_FEEDBACK_SEVERITIES.includes(severity))severity=kind==="unsafe"?"high":kind==="helpful"?"low":"medium";
  if(kind==="helpful")severity="low";else if(kind==="unsafe"&&["low","medium"].includes(severity))severity="high";
  const comment=redactSensitiveText(input.comment,1200);
  if(kind!=="helpful"&&comment.length<5)throw new Error("Sorunu açıklayan en az 5 karakterlik not gereklidir.");
  return {activityId,kind,severity,comment};
}

export function validateAiFeedbackDecision(input:Record<string,unknown>,defaultAssignee:string){
  const id=cleanAiText(input.id,100),status=cleanAiText(input.status,20) as AiFeedbackStatus;
  if(!id||!AI_FEEDBACK_STATUSES.includes(status))throw new Error("Geçerli kayıt ve durum gereklidir.");
  const assignedTo=cleanAiText(input.assignedTo,320)||cleanAiText(defaultAssignee,320),resolutionNote=redactSensitiveText(input.resolutionNote,1200);
  if(status==="in_review"&&!assignedTo)throw new Error("İnceleme sorumlusu gereklidir.");
  if(["resolved","dismissed"].includes(status)&&resolutionNote.length<5)throw new Error("Kapatma için en az 5 karakterlik çözüm notu gereklidir.");
  return {id,status,assignedTo,resolutionNote};
}
