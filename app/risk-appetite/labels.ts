const labels:Record<string,[string,string]>={
  cyber:["Siber Güvenlik","Cybersecurity"],operational:["Operasyonel","Operational"],compliance:["Uyum","Compliance"],financial:["Finansal","Financial"],"third-party":["Tedarikçi","Third party"],resilience:["İş Sürekliliği","Business continuity"],
  technology:["Teknoloji","Technology"],privacy:["Mahremiyet","Privacy"],strategic:["Stratejik","Strategic"],people:["İnsan kaynakları","People"],
  upper:["Üst Sınır (Değer arttıkça risk artar)","Upper limit (risk rises as the value increases)"],lower:["Alt Sınır (Değer düştükçe risk artar)","Lower limit (risk rises as the value decreases)"],
  draft:["Taslak","Draft"],review:["İncelemede","In review"],approved:["Onaylı / Aktif","Approved / active"],rejected:["Reddedildi","Rejected"],retired:["Yürürlükten kaldırıldı","Retired"],cancelled:["İptal edildi","Cancelled"],open:["Açık","Open"],"in-progress":["İşlemde","In progress"],verification:["Doğrulamada","In verification"],closed:["Kapalı","Closed"],verified:["Doğrulandı","Verified"],overdue:["Gecikmiş","Overdue"],
  green:["İştah İçi","Within appetite"],amber:["Uyarı Bandı","Warning band"],red:["İhlal","Breach"],inside:["İştah İçi","Within appetite"],outside:["İştah Dışı","Outside appetite"],warning:["Uyarı Bandı","Warning band"],breached:["İhlal","Breach"],unmeasured:["Ölçülmedi","Unmeasured"],
  "measurement-due":["Ölçüm zamanı","Measurement due"],"measurement-overdue":["Gecikmiş ölçüm","Measurement overdue"],critical:["Kritik","Critical"],high:["Yüksek","High"],
  manual:["Manuel ölçüm","Manual measurement"],system:["Sistem çıktısı","System output"],report:["Rapor","Report"]
};
const categoryKeys:Record<string,string>={
  "Siber Güvenlik":"cyber","Operasyonel":"operational","Uyum":"compliance","Finansal":"financial",
  "Tedarikçi":"third-party","Üçüncü Taraf ve Tedarik Zinciri":"third-party","İş Sürekliliği":"resilience","İş Sürekliliği ve Kriz Yönetimi":"resilience",
  "Stratejik":"strategic","İnsan Kaynakları":"people","Bilgi Teknolojileri":"technology"
};
export function kriLabel(value:string|undefined,tr:boolean){
  if(!value)return "—";
  return labels[categoryKeys[value]||value]?.[tr?0:1]||value;
}
export const standardCategories=["cyber","operational","compliance","financial","third-party","resilience"];
export const sourceTypes=["manual","system","report"];
