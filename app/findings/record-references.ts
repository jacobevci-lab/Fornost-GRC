import { connectedTitle, type ConnectedGrcRow } from '../connected-grc-model';
import { foldSearch } from '../record-search-store';

export const findingReferenceModules = {
  riskRef: ['Risk Assessment'],
  controlRef: ['Kontroller', 'Uyum'],
};
export type FindingReferenceField = keyof typeof findingReferenceModules;
export type FindingTarget = {
  id: string;
  module: string;
  code: string;
  title: string;
  owner: string;
  searchText: string;
};

export function findingTargets(rows: ConnectedGrcRow[], field: FindingReferenceField): FindingTarget[] {
  return rows.filter(row => findingReferenceModules[field].includes(row.module)).map(row => {
    const title = connectedTitle(row);
    const code = row.code || row.id;
    const owner = String(row.data.owner || '');
    const searchText = foldSearch([code, title, owner, row.data.controlRef, row.id].join(' '));
    return { id: row.id, module: row.module, code, title, owner, searchText };
  });
}

export function matchingFindingTargets(targets: FindingTarget[], query: string) {
  const needle = foldSearch(query.trim());
  return targets.filter(target => target.searchText.includes(needle));
}

// Only an exact identity can open a record. Preserve ambiguous or free-text legacy references.
export function savedFindingTarget(targets: FindingTarget[], reference?: string) {
  const value = reference?.trim().toLowerCase();
  if (!value) return undefined;
  const exact = targets.filter(row => row.id.toLowerCase() === value || row.code.toLowerCase() === value);
  return exact.length === 1 ? exact[0] : undefined;
}
