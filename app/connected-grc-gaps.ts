import { connectedTitle, connectedRelationLabels, type ConnectedGrcCoverageGap, type UnresolvedGrcReference, type ConnectedGrcRow } from './connected-grc-model';

export type ConnectedGapType = 'all' | 'high' | 'medium' | 'missing' | 'ambiguous';

export function filterConnectedGrcGaps(gaps: ConnectedGrcCoverageGap[], unresolved: UnresolvedGrcReference[], options: {
  query: string; module: string; lang: 'tr' | 'en'; moduleLabel: (name: string) => string; type?: ConnectedGapType;
}) {
  const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase(options.lang === 'tr' ? 'tr-TR' : 'en-US');
  const needle = fold(options.query.trim());
  const matches = (row: ConnectedGrcRow, extra: string[]) => (options.module === 'all' || options.module === row.module)
    && (!needle || fold([row.id, row.code, connectedTitle(row), row.module, options.moduleLabel(row.module), ...extra].join(' ')).includes(needle));
  const relation = (name: string) => connectedRelationLabels[name]?.[options.lang] || name;
  return {
    gaps: gaps.filter(gap => (!options.type || options.type === 'all' || options.type === gap.severity) && matches(gap.row, gap.missingRelations.map(relation))),
    unresolved: unresolved.filter(item => (!options.type || options.type === 'all' || options.type === item.reason) && matches(item.source, [item.value, item.field, relation(item.relation), ...item.candidates.flatMap(row => [row.id, row.code || '', connectedTitle(row)])])),
  };
}
