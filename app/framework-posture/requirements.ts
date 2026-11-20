import type {Applicability,Matrix, Requirement} from './types';

type Pins = Matrix['pins'];
export function hasApprovedEvidence(row:Requirement, pins:Pins) {
  return row.links.some(link=>pins[link.id]?.length);
}
export function summarizeCoverage(rows:Requirement[], pins:Pins) {
  const scoped=rows.filter(row=>row.applicability!=='excluded');
  return {scope:scoped.length,evidenced:scoped.filter(row=>hasApprovedEvidence(row,pins)).length};
}

export function requirementState(row:Requirement,pins:Pins):keyof typeof reasonLabels {
  if(row.applicability==='excluded')return 'excluded';
  if(!row.links.length)return 'unmapped';
  if(!row.links.some(link=>link.coverage==='supports'))return 'partial';
  if(!row.links.some(link=>link.coverage==='supports' && pins[link.id]?.length))return 'evidence';
  if(row.applicability==='undecided')return 'decision';
  return 'covered';
}
export const reasonLabels={
  excluded:['Kapsam dışında','Outside scope'],
  unmapped:['Kontrol bağlı değil','No control linked'],
  partial:['Eşleştirme kısmi','Only partial mappings'],
  evidence:['Destekleyen kontrol için onaylı kanıt eksik','Supporting control lacks current approved evidence'],
  decision:['Uygulanabilirlik kararı bekliyor','Applicability undecided'],
  covered:['Güncel, onaylı kanıt var','Current approved evidence available'],
};
export function matchesRequirement(row:Requirement,query:string,tr:boolean) {
  const locale=tr?'tr':'en';
  return (row.ref+' '+row.title).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
}

export function applicabilityLabel(value:Applicability,tr:boolean){
  return {required:tr?'Katalog kapsamında':'In catalog',undecided:tr?'Karar bekliyor':'Undecided',included:tr?'Uygulanabilir':'Applicable',excluded:tr?'Hariç':'Excluded'}[value];
}
