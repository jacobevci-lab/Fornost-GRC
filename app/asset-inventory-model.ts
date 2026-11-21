import { buildConnectedGrcGraph, type ConnectedGrcRow } from "./connected-grc-model";

export const assetStatuses = ["Planlanan","Aktif","Bakımda","Emekli / EOL"];
const lifecycleAliases: Record<string,string> = {
  "Planlama":"Planlanan", "Planned":"Planlanan", "Planning":"Planlanan", "Active":"Aktif",
  "Bakım":"Bakımda", "Maintenance":"Bakımda", "Under maintenance":"Bakımda",
  "Devre Dışı":"Emekli / EOL", "Arşivlendi":"Emekli / EOL", "Arşiv":"Emekli / EOL",
  "Kullanımdan Kaldırma":"Emekli / EOL", "Retired":"Emekli / EOL", "EOL":"Emekli / EOL", "Retired / EOL":"Emekli / EOL",
};
export function assetLifecycle(data: Record<string,unknown>) {
  const normalize = (value:unknown) => lifecycleAliases[String(value||"").trim()] ?? String(value||"").trim();
  const status = normalize(data.status), stage = normalize(data.lifecycleStage);
  // Legacy forms often paired the default Active value with a more specific stage.
  return (!status || status === "Aktif") && assetStatuses.includes(stage) ? stage : status || stage;
}

export const assetCoreFields = ["title","assetType","businessUnit","owner","criticality","status"];
export const assetFieldGroups = [
  {tr:"Sınıflandırma & CIA Değerleme",en:"Classification & CIA ratings",fields:["dataClassification","confidentialityRating","integrityRating","availabilityRating","personalData","criticalService","regulatoryScope"]},
  {tr:"Altyapı & Yaşam Döngüsü",en:"Infrastructure & lifecycle",fields:["assetId","description","environment","location","version","ip","internetFacing","acquisitionDate","eolDate","retentionPeriod"]},
  {tr:"Güvenlik Kontrolleri Duruşu",en:"Security control posture",fields:["backupStatus","edrStatus","siemStatus","vulnScan","encryptionStatus","accessReviewStatus","patchStatus"]},
  {tr:"Bağlantılar & Gözden Geçirme",en:"Connections & review",fields:["technicalOwner","custodian","vendor","processLink","dependencies","lastReview","nextReview"]},
];
export const regulatoryTags=["KVKK","ISO/IEC 27001","SOC 2","PCI DSS","DORA","NIST CSF","BDDK"];
export type AssetTarget = "Risk Assessment" | "BIA";
export type AssetLinks = Record<AssetTarget, Set<string>>;
export function assetLinkedRecords(rows: ConnectedGrcRow[]) {
  const result=new Map<string,AssetLinks>();
  const relevant=rows.filter(r=>["Risk Assessment","BIA","Varlık Envanteri"].includes(r.module));
  const {links}=buildConnectedGrcGraph(relevant);
  for(const {source,target} of links){
    const asset=source.module==="Varlık Envanteri"?source:target;
    const other=source===asset?target:source;
    if(asset.module!=="Varlık Envanteri" || (other.module!=="BIA" && other.module!=="Risk Assessment"))continue;
    const entry=result.get(asset.id) ?? {"Risk Assessment":new Set<string>(),BIA:new Set<string>()};
    entry[other.module].add(other.id); result.set(asset.id,entry);
  }
  return result;
}
export function assetCoverage(value:unknown) {
  const v=String(value??"").trim().toLocaleLowerCase("tr");
  if(["kapsamda","aktif","active","covered","in scope","enabled","evet","yes","true"].includes(v))return "covered";
  if(["kapsam dışı","kapsam disi","out of scope","not covered","eksik","missing","inactive","disabled","hayır","no","false"].includes(v))return "gap";
  if(["kısmi","partial","partially covered"].includes(v))return "partial";
  if(["uygulanamaz","not applicable","n/a"].includes(v))return "na";
  return "unknown";
}
