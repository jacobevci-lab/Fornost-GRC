import type { SavedViewState, ViewSchema } from './saved-register-views';
export const REPORT_SECTIONS = ['metrics','note','priorities','quality','distribution','register'] as const;
export type ReportSection = typeof REPORT_SECTIONS[number];
export const DEFAULT_REPORT_SECTIONS: ReportSection[] = ['metrics','note','priorities','quality','register'];
export const REPORT_MODULES = ['Risk Assessment','BIA','Varlık Envanteri','Uyum','Tedarikçiler','Kontroller','Kanıtlar','Denetim Yönetimi','Bulgular ve CAPA'] as const;
export const reportViewSchema: ViewSchema = { filters:['module','unit','owner','status','template','classification'], columns:[...REPORT_SECTIONS] };
export function validateReportDefinition(state: SavedViewState) {
 const f=state.filters;
 if(state.query||state.sort||!state.columns.includes('metrics')||Object.keys(f).some(k=>!reportViewSchema.filters.includes(k))||state.columns.some(k=>!REPORT_SECTIONS.includes(k as ReportSection))||!['__all__',...REPORT_MODULES].includes(f.module)||!['management','detailed'].includes(f.template)||!['internal','confidential'].includes(f.classification)||['unit','owner','status'].some(k=>typeof f[k]!=='string'||!f[k]))throw new Error('schema');
 return state;
}
export const reportSectionLabels:Record<ReportSection,[string,string]>={metrics:['Yönetim göstergeleri','Management indicators'],note:['Yönetici notu','Management note'],priorities:['Yüksek / kritik kayıtlar','High / critical records'],quality:['Veri kalitesi','Data quality'],distribution:['Durum dağılımı','Status distribution'],register:['Kayıt eki','Record appendix']};
