import type {Applicability, Control, Matrix, Requirement} from './types';

export function implementationIndex(controls:Control[]) {
  return new Map(controls.map(control=>[control.id,control.implementation.trim().toLowerCase()]));
}
export const reasonLabels = {
  excluded:['Kapsam dışında','Outside scope'],
  unmapped:['Kontrol bağlı değil','No control linked'],
  implementation:['Uygulanmış kontrol yok','No implemented control'],
  partial:['Uygulama veya eşleştirme kısmi','Partial implementation or mapping'],
  evidence:['Uygulanan kontrolde güncel, onaylı kanıt eksik','Implemented control lacks current approved evidence'],
  decision:['Uygulanabilirlik kararı bekliyor','Applicability undecided'],
  covered:['Uygulanan kontrol ve güncel, onaylı kanıt var','Implemented control with current approved evidence'],
} as const;
export type RequirementState = keyof typeof reasonLabels;

export function requirementState(row:Requirement,pins:Matrix['pins'],implementation:ReadonlyMap<string,string>):RequirementState {
  if(row.applicability==='excluded')return 'excluded';
  if(!row.links.length)return 'unmapped';
  const implemented = row.links.filter(link=>['uygulanıyor','implemented'].includes(implementation.get(link.id)??''));
  const supporting = implemented.filter(link=>link.coverage==='supports');
  if(supporting.some(link=>pins[link.id]?.length))return row.applicability==='undecided'?'decision':'covered';
  if(supporting.length)return 'evidence';
  if(implemented.length || row.links.some(link=>['kısmi','partially implemented','partial'].includes(implementation.get(link.id)??'')))return 'partial';
  return 'implementation';
}
export function statusLabel(state:RequirementState,tr:boolean) {
  if(state==='covered')return tr?'Uyumlu':'Compliant';
  if(state==='excluded')return tr?'Kapsam dışı':'Out of scope';
  if(state==='implementation'||state==='unmapped')return tr?'Açık':'Open';
  return tr?'Kısmi':'Partial';
}
export function matchesRequirement(row:Requirement,query:string,tr:boolean) {
  const locale=tr?'tr':'en';
  return (row.ref+' '+row.title).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
}
export function applicabilityLabel(value:Applicability,tr:boolean){
  return {required:tr?'Uygulanabilir':'Applicable',undecided:tr?'Karar bekliyor':'Undecided',included:tr?'Uygulanabilir':'Applicable',excluded:tr?'Kapsam dışı':'Out of scope'}[value];
}
