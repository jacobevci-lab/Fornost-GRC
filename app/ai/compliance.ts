import { cleanAiText,redactSensitiveText } from "./security";
export const AI_FRAMEWORKS=["ISO 42001","NIST AI RMF","EU AI Act"] as const;
export type AiFramework=typeof AI_FRAMEWORKS[number];
export type AiControlStatus="not-started"|"in-progress"|"implemented"|"not-applicable";
export const AI_CONTROL_CATALOG:Record<AiFramework,Array<{id:string;domain:string;title:string;requirement:string}>>={
 "ISO 42001":[
  {id:"ISO42001-4.1",domain:"Bağlam",title:"AI yönetim sistemi bağlamı",requirement:"Kuruluş bağlamı, kapsam ve ilgili taraf beklentileri tanımlanır."},
  {id:"ISO42001-5.2",domain:"Liderlik",title:"AI politikası",requirement:"Yönetim onaylı AI politikası ve sorumluluklar sürdürülür."},
  {id:"ISO42001-6.1",domain:"Planlama",title:"AI risk ve fırsatları",requirement:"AI riskleri, etkileri ve tedavi kararları kayıt altına alınır."},
  {id:"ISO42001-7.2",domain:"Destek",title:"Yetkinlik ve farkındalık",requirement:"AI rollerinin yetkinlik ve farkındalık gereksinimleri yönetilir."},
  {id:"ISO42001-8.4",domain:"Operasyon",title:"AI etki değerlendirmesi",requirement:"AI sisteminin bireyler ve toplum üzerindeki etkileri değerlendirilir."},
  {id:"ISO42001-9.1",domain:"Performans",title:"İzleme ve ölçüm",requirement:"AI kontrol etkinliği, performans ve sapmalar periyodik ölçülür."}],
 "NIST AI RMF":[
  {id:"AI-RMF-GV-1",domain:"Govern",title:"Politika ve hesap verebilirlik",requirement:"AI risk yönetimi politikaları, roller ve hesap verebilirlik belirlenir."},
  {id:"AI-RMF-MP-1",domain:"Map",title:"Amaç ve bağlam",requirement:"Kullanım amacı, etkilenen taraflar ve olası zararlar belgelenir."},
  {id:"AI-RMF-MS-1",domain:"Measure",title:"Geçerlilik ve güvenilirlik",requirement:"Model kalite, güvenlik, ayrımcılık ve dayanıklılık testleri ölçülür."},
  {id:"AI-RMF-MS-2",domain:"Measure",title:"Gizlilik ve güvenlik",requirement:"Gizlilik, veri koruma ve siber güvenlik riskleri değerlendirilir."},
  {id:"AI-RMF-MG-1",domain:"Manage",title:"Risk tedavisi",requirement:"Riskler önceliklendirilir, sahiplenilir ve izlenebilir biçimde tedavi edilir."},
  {id:"AI-RMF-MG-4",domain:"Manage",title:"Olay ve değişiklik yönetimi",requirement:"AI olayları, model değişiklikleri ve geri bildirimler yaşam döngüsünde yönetilir."}],
 "EU AI Act":[
  {id:"EUAI-ART9",domain:"High-risk controls",title:"Risk yönetim sistemi",requirement:"Yüksek riskli AI için sürekli ve belgeli risk yönetim sistemi işletilir."},
  {id:"EUAI-ART10",domain:"Data governance",title:"Veri yönetişimi",requirement:"Eğitim, doğrulama ve test verisi için kalite ve yönetişim kontrolleri uygulanır."},
  {id:"EUAI-ART11",domain:"Documentation",title:"Teknik dokümantasyon",requirement:"Sistem, amaç, sınırlar, performans ve kontroller teknik dosyada belgelenir."},
  {id:"EUAI-ART12",domain:"Traceability",title:"Kayıt tutma",requirement:"İzlenebilirlik sağlayan otomatik loglama ve saklama uygulanır."},
  {id:"EUAI-ART13",domain:"Transparency",title:"Şeffaflık",requirement:"Kullanıcıya yetenekler, sınırlar ve doğru kullanım talimatları sunulur."},
  {id:"EUAI-ART14",domain:"Oversight",title:"İnsan gözetimi",requirement:"İnsan gözetimi, durdurma ve karar override mekanizmaları sağlanır."},
  {id:"EUAI-ART15",domain:"Security",title:"Doğruluk ve siber güvenlik",requirement:"Doğruluk, sağlamlık ve siber güvenlik yaşam döngüsü boyunca korunur."}],
};
export function validateAssessment(input:Record<string,unknown>){const status=cleanAiText(input.status,30) as AiControlStatus,owner=redactSensitiveText(input.owner,320),dueDate=cleanAiText(input.dueDate,10),evidence=redactSensitiveText(input.evidence,1200),note=redactSensitiveText(input.note,1200);if(!["not-started","in-progress","implemented","not-applicable"].includes(status))throw new Error("Geçersiz kontrol durumu.");if(owner.length<3)throw new Error("Kontrol sorumlusu zorunludur.");if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw new Error("Geçerli hedef tarih gereklidir.");if(status==="implemented"&&evidence.length<5)throw new Error("Uygulanan kontrol için kanıt gereklidir.");if(status==="not-applicable"&&note.length<5)throw new Error("Kapsam dışı kararı için gerekçe gereklidir.");return{status,owner,dueDate,evidence,note};}
