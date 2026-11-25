export type VendorTier=1|2|3;
export const reviewDays={1:180,2:365,3:730} as const;
const normal=(value:unknown)=>String(value??"").trim().replaceAll("İ","i").toLowerCase();
export function vendorTier(criticality:unknown,dataClass:unknown):VendorTier|null {
  const c=normal(criticality),d=normal(dataClass);
  if(["critical","kritik","tier-1","tier 1"].includes(c)||["restricted","çok gizli","kısıtlı","strictly confidential"].includes(d))return 1;
  if(!["low","düşük","medium","orta","high","yüksek"].includes(c)||!["public","herkese açık","internal","kurum içi","confidential","gizli"].includes(d))return null;
  return c==="high"||c==="yüksek"||d==="confidential"||d==="gizli"?2:3;
}
export function suggestedReview(tier:VendorTier|null,contractEnd:string,today=new Date().toISOString().slice(0,10)){
  if(!tier)return "";
  const suggested=new Date(Date.parse(today)+reviewDays[tier]*86400000).toISOString().slice(0,10);
  return contractEnd&&contractEnd<suggested?contractEnd:suggested;
}
export function tierLabel(tier:VendorTier|null,tr:boolean){
  return tier?"Tier "+tier+" · "+(tr?["Kritik","Orta","Düşük"]:["Critical","Medium","Low"])[tier-1]:"—";
}
