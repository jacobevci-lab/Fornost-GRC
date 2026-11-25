/** Translate typed values only. Narrative text and unknown states stay verbatim. */
const values: Array<[string, string, ...string[]]> = [
 ['AI sistemi','AI system','ai-system'],['Politika','Policy','policy'],['Olay','Incident','incident'],['Denetim','Audit','audit'],['Süreklilik planı','Continuity plan','continuity-plan'],['Düzenleyici kaynak','Regulatory source','regulatory-source'],['Regülasyon değişikliği','Regulatory change','regulatory-change'],['Risk iştahı','Risk appetite','risk-appetite'],['PBC talebi','PBC request','pbc-request'],['Denetim maddesi','Audit requirement','audit-requirement'],['Kanıt','Evidence','evidence'],
 ['Kritik','Critical'],['Yüksek','High'],['Orta','Medium'],['Düşük','Low'],
 ['Değerlendirmede','Onboarding'],['Yeniden değerlendirmede','Reassessment'],
 ['Devam Ediyor','In progress','in-progress','in_progress','İşlemde','Devam ediyor'],
 ['İptal Edildi','Cancelled','canceled','İptal edildi'],['Taslak','Draft'],
 ['İncelemede','In review','in-review','review','under-review','Under Review','Pending Review'],
 ['Onaylandı','Approved','Onaylı'],['Yayında','Published'],['Açık','Open'],
 ['Kapalı','Closed','Kapatıldı'],['Tamamlandı','Completed','done'],
 ['Doğrulamada','In verification','verification','pending-verification'],
 ['Üretimde','In production','production'],['Değerlendirme aşamasında','In assessment','assessment'],['Aksiyon Devam Ediyor','Treatment in Progress'],['Uygulama Hazırlığında','Implementation Preparation'],['İnceleme Takviminde','Review Scheduled'],['Bakımda','In Maintenance'],['Sonlandırıldı','Terminated'],['Uygulanmıyor','Not Implemented'],['Emekli / EOL','Retired / EOL'],['Devre Dışı','Disabled control'],['Kısmi','Partial implementation'],['Kapsamda','Covered'],['Kapsam Dışı','Out of Scope'],['Bilinmiyor','Unknown'],['Aktif','Active'],['Pasif','Inactive','disabled'],['Planlandı','Planned','Planlanan'],
 ['Başlanmadı','Not started','not-started'],['Bekliyor','Pending'],
 ['İncelemeye sunuldu','Submitted','submitted-for-review'],
 ['Reddedildi','Rejected'],['Kabul edildi','Accepted'],
 ['Teslim bekliyor','Awaiting submission','assigned'],
 ['Düzeltme istendi','Changes requested','changes_requested','changes-requested'],
 ['Koşullu','Conditional','conditional'],
 ['Çıkış sürecinde','Offboarding'],['İlişki kapatıldı','Offboarded'],
 ['Arşivlendi','Archived','retired'],['Önceki sürüm','Superseded'],
 ['Süresi doldu','Expired'],['Askıya alındı','Suspended','Askıda'],
 ['İlan edildi','Declared'],['Ön inceleme','Triage'],['Kontrol altında','Contained'],
 ['Tehdit giderildi','Eradicated'],['Hizmet geri yüklendi','Recovered'],
 ['Değerlendiriliyor','Under assessment','assessing'],['Belirlenmedi','Undetermined'],
 ['Uygulanabilir','Applicable'],['Uygulanamaz','Not applicable','not-applicable'],
 ['Etki analizi','Impact assessment','impact-assessment'],
 ['İyileştirmede','Remediation'],['Yürürlükte','Effective'],
 ['Uyumlu','Compliant'],['Kısmi uyumlu','Partially compliant','partial'],
 ['Uyumlu değil','Non-compliant','noncompliant'],['Uygulandı','Implemented','Uygulanıyor'],
 ['İyileştirme gerekli','Needs improvement'],['Test edilmedi','Not tested','untested'],
 ['Etkin','Effective control','effective-control'],['Etkin değil','Ineffective'],
 ['Kanıt Bekleniyor','Awaiting evidence','Kanıt bekliyor'],
 ['İnceleme bekliyor','Awaiting review'],['Geçerli','Valid'],
 ['Gecikmiş','Overdue'],['Güncel','Current'],['Güncelliğini yitirmiş','Stale'],
 ['Belirtilmedi','Unspecified','not specified'],['Atanmadı','Unassigned','not assigned'],
 ['Değerlendirilmedi','Not assessed','unassessed'],
 ['Asgari','Minimal'],['Sınırlı','Limited'],['Yasaklı','Prohibited'],
 ['Kurum İçi','Internal'],['Gizli','Confidential'],['Çok Gizli','Restricted'],['Herkese Açık','Public'],
 ['Evet','Yes','true'],['Hayır','No','false'],
];
const normalize=(value:string)=>value.normalize('NFC').trim().toLowerCase().replace(/i\u0307/g,'i');
const dictionary=new Map(values.flatMap(([tr,en,...aliases])=>[tr,en,...aliases].map(key=>[normalize(key),[tr,en]] as const)));
export function reportValueLabel(value:unknown,tr:boolean):string {
 const raw=value==null?'':String(value);
 return dictionary.get(normalize(raw))?.[tr?0:1]??raw;
}
const enumFields=new Set(['status','severity','criticality','riskLevel','riskTier','implementation','evidenceStatus','designEffectiveness','operatingEffectiveness','auditorResult','applicability','dataClassification','classification','recordType']);
export function reportFieldValue(key:string,value:unknown,tr:boolean):string {
 if(value==null)return '';
 if(enumFields.has(key))return reportValueLabel(value,tr);
 return typeof value==='object'?JSON.stringify(value):String(value);
}
export const reportModuleLabels:Record<string,[string,string]>={
 'Risk Assessment':['Risk Değerlendirmesi','Risk Assessment'],BIA:['İş Etki Analizi (BIA)','Business Impact Analysis (BIA)'],
 'Varlık Envanteri':['Varlık Envanteri','Asset Inventory'],Uyum:['Uyum Yönetimi','Compliance Management'],
 Tedarikçiler:['Tedarikçi Yönetimi','Vendor Management'],Kontroller:['Kontrol Kütüphanesi','Control Library'],Kanıtlar:['Kanıt Kütüphanesi','Evidence Library'],
 'Denetim Yönetimi':['Denetim Yönetimi','Audit Management'],'Bulgular ve CAPA':['Bulgular ve CAPA','Findings & CAPA'],
 'AI Yönetişimi':['AI Yönetişimi','AI Governance'],'Politika Merkezi':['Politika Merkezi','Policy Center'],
 'Güvenlik Olayları':['Güvenlik Olayları ve Kriz','Security Incidents & Crisis'],'İş Sürekliliği':['İş Sürekliliği','Business Continuity'],
 'Regülasyon Merkezi':['Regülasyon Merkezi','Regulatory Center'],'Risk İştahı ve KRI':['Risk İştahı ve KRI','Risk Appetite & KRI'],
};
export const reportFieldLabels:Record<string,[string,string]>={
 recordType:['Kayıt türü','Record type'],auditRef:['Denetim kodu','Audit code'],auditName:['Denetim adı','Audit name'],
 requirementRef:['Gereksinim kodu','Requirement code'],evidenceRefs:['Kanıt sürümleri','Evidence versions'],
 reviewer:['Bağımsız doğrulayıcı','Independent reviewer'],dueDate:['Teslim tarihi','Due date'],reviewDueDate:['İnceleme tarihi','Review due date'],
 periodStart:['Dönem başlangıcı','Period start'],periodEnd:['Dönem sonu','Period end'],version:['Sürüm','Version'],
 reviewDate:['Gözden geçirme tarihi','Review date'],modelName:['Model adı','Model name'],vendor:['Sağlayıcı','Provider'],
 purpose:['Amaç','Purpose'],riskTier:['Risk sınıfı','Risk tier'],dataClassification:['Veri sınıfı','Data classification'],
 effectiveDate:['Yürürlük tarihi','Effective date'],publishedDate:['Yayın tarihi','Publication date'],
 applicability:['Uygulanabilirlik','Applicability'],sourceRef:['Kaynak kodu','Source code'],
 rto:['Hedef kurtarma süresi','Recovery time objective'],rpo:['Hedef veri kaybı süresi','Recovery point objective'],
 detectedDate:['Tespit tarihi','Detected date'],externalRef:['Dış referans','External reference'],riskRef:['Risk kodu','Risk code'],biaRef:['BIA kodu','BIA code'],template:['Şablon','Template'],auditType:['Denetim türü','Audit type'],summary:['Özet','Summary'],authority:['Düzenleyici kurum','Authority'],url:['Kaynak adresi','Source URL'],statement:['Risk iştahı beyanı','Risk appetite statement'],
};
