export type PolicyDecisionKind = 'version' | 'exception' | 'retire';
export type PolicyDecisionContext = {
  kind: PolicyDecisionKind; revision: string;
  record: Record<string, string | number | null>;
  policy: Record<string, string | number | null>;
  version: Record<string, string | number | null>;
};
export const policyEvidenceOperations = ['submit', 'approve', 'publish', 'retire', 'approve-exception', 'close-exception'];
export const policyDecisionPhrases: Record<string, string> = {submit:'İNCELEMEYE GÖNDER',approve:'POLİTİKAYI ONAYLA',reject:'POLİTİKAYI REDDET',publish:'POLİTİKAYI YAYINLA',retire:'POLİTİKAYI YÜRÜRLÜKTEN KALDIR','submit-exception':'İSTİSNAYI GÖNDER','approve-exception':'İSTİSNAYI ONAYLA','reject-exception':'İSTİSNAYI REDDET','close-exception':'İSTİSNAYI KAPAT'};
export const policyDecisionNames: Record<string, [string,string]> = {submit:['İncelemeye gönder','Submit for review'],approve:['Politikayı onayla','Approve policy'],reject:['Politikayı reddet','Reject policy'],publish:['Politikayı yayınla','Publish policy'],retire:['Politikayı yürürlükten kaldır','Retire policy'],'submit-exception':['İstisnayı gönder','Submit exception'],'approve-exception':['İstisnayı onayla','Approve exception'],'reject-exception':['İstisnayı reddet','Reject exception'],'close-exception':['İstisnayı kapat','Close exception']};
export function policyDecisionAvailable(c:PolicyDecisionContext,operation:string,actor:{email:string;role:string}) {
  const r=c.record,p=c.policy,admin=actor.role==='Admin',email=actor.email;
  if(actor.role==='Viewer')return false;
  if(c.kind==='retire')return operation==='retire'&&admin&&p.status==='published'&&p.reviewer===email;
  if(c.kind==='version') {
    if(p.status==='retired')return false;
    if(operation==='submit')return r.status==='draft';
    if(operation==='publish')return admin&&r.status==='approved'&&p.reviewer===email;
    return ['approve','reject'].includes(operation)&&admin&&r.status==='review'&&p.reviewer===email&&![r.created_by,r.submitted_by].includes(email);
  }
  if(operation==='submit-exception')return r.status==='draft'&&(admin||[r.owner,r.created_by].includes(email));
  if(operation==='close-exception')return admin&&r.status==='approved';
  return ['approve-exception','reject-exception'].includes(operation)&&admin&&r.status==='submitted'&&r.reviewer===email&&![r.owner,r.created_by,r.submitted_by].includes(email);
}
