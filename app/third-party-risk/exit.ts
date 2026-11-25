export type ExitRecord={schema:"supplier-exit-v1";startedAt:string;accessRevoked:boolean;dataReturned:boolean;preparedBy:string|null;proof:{evidenceId:string;versionId:string;code:string;title:string;versionNo:number;sha256:string}|null;approvedBy:string|null;approvedAt:string|null;openFindings:number|null};
export const exitIdentity=(x:unknown)=>String(x||"").trim().toLowerCase();
export function canPrepareExit(actor:{email:string;role:string},v:{businessOwner?:string;riskOwner?:string;reviewer?:string}){
 return actor.role!=="Viewer"&&exitIdentity(actor.email)!==exitIdentity(v.reviewer)&&(actor.role==="Admin"||[v.businessOwner,v.riskOwner].some(x=>exitIdentity(x)===exitIdentity(actor.email)));
}
