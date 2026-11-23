const names:Record<string,[string,string]> = {
 security:['Bilgi Güvenliği','Information Security'],operations:['BT Operasyonları','IT Operations'],
 privacy:['Gizlilik ve KVKK','Privacy and Data Protection'],people:['İnsan Kaynakları','Human Resources'],
 continuity:['İş Sürekliliği','Business Continuity'],vendor:['Tedarikçi Yönetimi','Vendor Management'],
 ai:['Yapay Zeka Yönetişimi','AI Governance'],risk:['Risk Yönetimi','Risk Management'],
 compliance:['Uyum','Compliance'],technology:['Teknoloji','Technology'],
 internal:['Kurum İçi','Internal'],confidential:['Gizli','Confidential'],restricted:['Çok Gizli','Restricted'],public:['Herkese Açık','Public'],
 draft:['Taslak','Draft'],review:['İncelemede','In review'],submitted:['İncelemede','In review'],approved:['Onaylandı','Approved'],published:['Yayında','Published'],
 retired:['Arşivlendi','Archived'],archived:['Arşivlendi','Archived'],superseded:['Arşivlendi','Superseded'],cancelled:['İptal edildi','Cancelled'],
 rejected:['Reddedildi','Rejected'],expired:['Süresi doldu','Expired'],closed:['Kapalı','Closed'],open:['Açık','Open'],pending:['Bekliyor','Pending'],
 declined:['Reddedildi','Declined'],attested:['Beyan edildi','Attested'],
 'review-overdue':['İnceleme gecikti','Review overdue'],'review-due':['İnceleme yaklaşıyor','Review due'],
 'active-exception':['Aktif istisna','Active exception'],'attestation-pending':['Beyan bekleniyor','Attestation pending'],
};
export const currentCategories=['security','operations','privacy','people','continuity','vendor','ai'];
export function policyLabel(value:string,tr:boolean){return names[value]?.[tr?0:1]||value;}
export function audienceLabel(value:string,tr:boolean){
 return ['all employees','tüm çalışanlar'].includes(value.trim().toLocaleLowerCase('tr-TR'))?(tr?'Tüm Çalışanlar':'All Employees'):value;
}
export function mappingCounts(controls:number,risks:number,frameworks:number,tr:boolean){
 return tr?`${controls} Kontrol · ${risks} Risk · ${frameworks} Çerçeve`:
  [controls+' control'+(controls===1?'':'s'),risks+' risk'+(risks===1?'':'s'),frameworks+' framework'+(frameworks===1?'':'s')].join(' · ');
}
