import type {Applicability, Control, Matrix, Requirement, Implementation} from './types';

export function implementationIndex(controls:Control[]) {
  return new Map(controls.map(control=>[control.id,control.implementation.trim().toLowerCase()]));
}
export const reasonLabels = {
  excluded:['Hariç tutuldu','Excluded'],
  planned:['Uygulama planlandı','Implementation planned'],
  'self-declared':['Öz-beyan henüz güncel, onaylı kanıt veya yayındaki politika ile desteklenmiyor','Self-declaration lacks current approved evidence or a published policy'],
  unmapped:['Doğrudan uygulama veya ortak kontrol değerlendirmesi bekliyor','Awaiting direct implementation or shared control assessment'],
  implementation:['Uygulanmış kontrol yok','No implemented control'],
  partial:['Uygulama veya eşleştirme kısmi','Partial implementation or mapping'],
  evidence:['Uygulanan kontrolde güncel, onaylı kanıt eksik','Implemented control lacks current approved evidence'],
  verification:['Bağımsız doğrulama bekliyor','Independent verification pending'],
  decision:['Uygulanabilirlik kararı bekliyor','Applicability undecided'],
  covered:['Güncel kaynaklarla bağımsız doğrulanmış uygulama','Independently verified implementation with current sources'],
} as const;
export type RequirementState = keyof typeof reasonLabels;

export function requirementState(row:Requirement,pins:Matrix['pins'],implementation:ReadonlyMap<string,string>):RequirementState {
  if(row.applicability==='excluded')return 'excluded';

  const implemented = row.links.filter(link=>['uygulanıyor','implemented'].includes(implementation.get(link.id)??''));
  const supporting = implemented.filter(link=>link.coverage==='supports');
  const direct=row.direct;
  if(direct?.implementation==='implemented' && direct.verified && direct.sources.some(s=>s.eligible))return row.applicability==='undecided'?'decision':'covered';
  if(supporting.some(link=>pins[link.id]?.some(pin=>pin.verified)))return row.applicability==='undecided'?'decision':'covered';
  if(direct?.implementation==='implemented')return direct.sources.some(s=>s.eligible)?'verification':'self-declared';
  if(supporting.some(link=>pins[link.id]?.length))return 'verification';
  if(supporting.length)return 'evidence';
  if(direct?.implementation==='partial' || implemented.length || row.links.some(link=>['kısmi','partially implemented','partial'].includes(implementation.get(link.id)??'')))return 'partial';
  if(direct?.implementation==='planned')return 'planned';
  return row.links.length?'implementation':'unmapped';
}
export function statusLabel(state:RequirementState,tr:boolean) {
  if(state==='covered')return tr?'Uyumlu':'Compliant';
  if(state==='excluded')return tr?'Hariç Tutuldu':'Excluded';
  if(state==='planned')return tr?'Planlandı':'Planned';
  if(state==='self-declared')return tr?'Öz-Beyan · Kanıt Bekliyor':'Self-declared · Awaiting evidence';
  if(state==='verification')return tr?'Doğrulama Bekliyor':'Awaiting verification';
  if(state==='implementation'||state==='unmapped')return tr?'Açık':'Open';
  return tr?'Kısmi':'Partial';
}
export function matchesRequirement(row:Requirement,query:string,tr:boolean) {
  const locale=tr?'tr':'en';
  return (row.ref+' '+row.title).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
}
export function applicabilityLabel(value:Applicability,tr:boolean){
  return {required:tr?'Uygulanabilir':'Applicable',undecided:tr?'Karar bekliyor':'Undecided',included:tr?'Uygulanabilir':'Applicable',excluded:tr?'Uygulanabilir Değil / Hariç':'Not applicable / Excluded'}[value];
}

export const implementationLabels:Record<Implementation,[string,string]>={open:['Uygulanmadı / Açık','Not implemented / Open'],planned:['Planlandı','Planned'],partial:['Kısmen Uygulanıyor','Partially implemented'],implemented:['Uygulanıyor','Implemented']};
