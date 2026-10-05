import type {FrameworkRequirement} from './framework-catalogs';
// Reference-level original topic summaries; not the licensed normative text.
// 2022 clause structure: https://blog.ansi.org/anab/iso-iec-27001-2013-2022-comparison/
// Climate amendment: ISO/IAF joint communiqué, 2024-02-22, clauses 4.1 and 4.2.
export const iso27001Management:FrameworkRequirement[] = [
['4.1','Kuruluş bağlamı ve iklim değişikliğinin ilgililiği'],['4.2','Paydaş ihtiyaçları; ilgili iklim gereksinimleri'],['4.3','BGYS kapsamı'],['4.4','BGYS süreçleri'],
['5.1','Yönetimin liderliği'],['5.2','Güvenlik politikası'],['5.3','Rol ve yetkiler'],
['6.1.1','Risk ve fırsat planlaması'],['6.1.2','Güvenlik risklerinin değerlendirilmesi'],['6.1.3','Risk işleme ve uygulanabilirlik bildirgesi'],['6.2','Ölçülebilir güvenlik hedefleri'],['6.3','Değişikliklerin planlanması'],
['7.1','Gerekli kaynaklar'],['7.2','Personel yetkinliği'],['7.3','Personel farkındalığı'],['7.4','İletişim düzeni'],['7.5.1','Dokümantasyon kapsamı'],['7.5.2','Doküman oluşturma ve güncelleme'],['7.5.3','Doküman kontrolü'],
['8.1','Operasyonların kontrolü'],['8.2','Operasyonel risk değerlendirmesi'],['8.3','Risk işleme uygulaması'],
['9.1','Performans ölçümü'],['9.2.1','İç denetim değerlendirmesi'],['9.2.2','İç denetim programı'],['9.3.1','Yönetim gözden geçirmesi'],['9.3.2','Gözden geçirme girdileri'],['9.3.3','Gözden geçirme sonuçları'],
['10.1','Sürekli iyileştirme'],['10.2','Uygunsuzluk ve düzeltme'],
].map(([ref,title])=>({ref,title,category:'BGYS yönetim sistemi',owner:'Bilgi Güvenliği'}));
