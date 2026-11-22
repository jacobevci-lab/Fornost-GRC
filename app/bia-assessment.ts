import {hasRecoveryTarget} from "./bia-recovery";

export const impactFields = ["financial","operational","legal","reputation","customer","dataImpact"];
export const biaRecoveryFields = ["rto","rpo","mtpd"];
export const biaCoreFields = ["process","processCategory","description","businessUnit","owner","criticality","asset","status",...biaRecoveryFields];
export const biaSections = [
  {tr:"İş Etkisi & Zaman Toleransı",en:"Business impact & time tolerance",fields:[...impactFields,"regulatoryDeadline","minimumService"]},
  {tr:"Bağımlılıklar",en:"Dependencies",fields:["dependencies","technologyDependency","supplierDependency","facilityDependency","peopleDependency","peakPeriod"]},
  {tr:"Kurtarma Stratejisi & Dayanıklılık",en:"Recovery strategy & resilience",fields:["recoveryStrategy","manualWorkaround","singlePointOfFailure","drStatus"]},
  {tr:"Tatbikat, Test & BIA Onayı",en:"Exercises, testing & BIA approval",fields:["lastTestDate","testResult","nextTestDate","lastReview","nextReview","approver","approvalDate"]},
];
export const mtpdWarning = {tr:"RTO süresi maksimum tolere edilebilir kesinti süresini (MTPD) aşamaz",en:"RTO cannot exceed the maximum tolerable period of disruption (MTPD)."};
export const sodWarning = {tr:"BIA sahibi ve onaylayan farklı kişiler olmalıdır.",en:"The BIA owner and approver must be different people."};
export const exceedsMtpd = (data:Record<string,unknown>) => hasRecoveryTarget(data.rto) && hasRecoveryTarget(data.mtpd) && Number(data.rto)>Number(data.mtpd);
export function biaImpact(data:Record<string,unknown>) {
  const ratings=impactFields.map(key=>data[key]).filter(value=>/^[1-5]$/.test(String(value))).map(Number);
  return {count:ratings.length,highest:ratings.length?Math.max(...ratings):null,average:ratings.length?ratings.reduce((sum,value)=>sum+value,0)/ratings.length:null};
}
const identity=(value:unknown)=>String(value??"").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
export function sameBiaPerson(data:Record<string,unknown>) {
  const owner=identity(data.ownerEmail),approver=identity(data.approverEmail);
  if(owner&&approver)return owner===approver;
  const owners=[owner,identity(data.owner)].filter(Boolean);
  return [approver,identity(data.approver)].some(v=>v!==""&&owners.includes(v));
}
export function biaDate(value:unknown,format="DD.MM.YYYY") {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
  if(!match)return "—";
  const [,y,m,d]=match;
  return format==="YYYY-MM-DD"?match[0]:format==="MM/DD/YYYY"?m+"/"+d+"/"+y:d+"."+m+"."+y;
}
