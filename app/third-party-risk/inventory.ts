export const vendorCategories:Record<string,[string,string]>={
  SaaS:["SaaS","SaaS"],cloud:["Bulut Altyapı","Cloud infrastructure"],consulting:["Danışmanlık","Consulting"],
  hardware:["Donanım","Hardware"],financial:["Finansal Hizmet","Financial services"],other:["Diğer","Other"],
};
const states:Record<string,[string,string]>={
  unmanaged:["Onboarding Bekliyor","Awaiting onboarding"],onboarding:["Değerlendirmede","Under assessment"],
  reassessment:["Değerlendirmede","Under assessment"],"in-review":["Değerlendirmede","Under assessment"],
  approved:["Onaylı (Aktif)","Approved (active)"],conditional:["Koşullu Kabul","Conditionally accepted"],
  offboarding:["Çıkış Sürecinde","Offboarding in progress"],excluded:["Gerekçeli Kapsam Dışı","Excluded with reason"],offboarded:["Çıkış / Sonlandırıldı","Offboarded / terminated"],
};
export const inventoryLabel=(key:string,tr:boolean)=>states[key]?.[tr?0:1];
export function vendorCode(code:unknown,id:unknown){
  return [code,id].find((ref):ref is string=>typeof ref==="string" && /^VEN-\d{3,}$/i.test(ref))||"—";
}
export function vendorCriticality(value:unknown){
  const legacy:Record<string,string>={Kritik:"critical",Yüksek:"high",Orta:"medium",Düşük:"low"};
  return legacy[String(value)]||String(value||"unclassified");
}

export function validVendorEvidenceRefs(value:unknown):value is string[]{
  return Array.isArray(value) && value.length<=100 && value.every(item=>
    typeof item==="string" && Boolean(item.trim()) && item.length<=120 && !/[,;|\r\n]/.test(item));
}
