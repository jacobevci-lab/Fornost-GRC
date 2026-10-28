export type IncidentDecisionContext = {record: Record<string, string | number | null>; revision: string};
export const incidentEvidenceOperations = ['contain', 'eradicate', 'recover', 'review', 'close'];
export const incidentDecisionPhrases: Record<string, string> = {
  triage: 'OLAY TRİAJINI BAŞLAT', contain: 'OLAYI KONTROL ALTINA AL', eradicate: 'TEHDİDİ ORTADAN KALDIR',
  recover: 'HİZMETİ GERİ YÜKLE', review: 'OLAYI İNCELEMEYE GÖNDER', close: 'OLAYI KAPAT', reopen: 'OLAYI YENİDEN AÇ',
};
export const incidentNextAction: Record<string, string> = {declared:'triage',triage:'contain',contained:'eradicate',eradicated:'recover',recovered:'review',review:'close',closed:'reopen'};
export function incidentDecisionAvailable(context: IncidentDecisionContext, operation: string, actor: {role:string; email:string}) {
  const r = context.record;
  if (incidentNextAction[String(r.status)] !== operation || !['Admin','Editor'].includes(actor.role)) return false;
  if (operation === 'close') return actor.role === 'Admin' && r.reviewer === actor.email && ![r.declared_by,r.owner,r.commander].includes(actor.email);
  if (operation === 'reopen') return actor.role === 'Admin';
  return actor.role === 'Admin' || [r.owner,r.commander].includes(actor.email);
}
export type IncidentDecisionDetail = {format:'fornost-incident-decision-v1';note:string;reviewedSource:IncidentDecisionContext['record'];decision:{rootCause:string;lessonsLearned:string;notificationDecision:string;notificationRationale:string}};
export function incidentDecisionDetail(detail: string): IncidentDecisionDetail | null {
  try {const value=JSON.parse(detail);return value?.format==='fornost-incident-decision-v1' && typeof value.note==='string' && value.reviewedSource && typeof value.reviewedSource==='object' && value.decision && typeof value.decision==='object' ? value : null;} catch {return null;}
}

export const incidentEvidencePurposeLabels = {'incident-contain':['Olayı kontrol altına alma','Incident containment'],'incident-eradicate':['Tehdidi giderme','Threat eradication'],'incident-recover':['Hizmeti geri yükleme','Service recovery'],'incident-review':['Olay inceleme gönderimi','Incident review submission'],'incident-close':['Bağımsız olay kapanışı','Independent incident closure']} as const;
