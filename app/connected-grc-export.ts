import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcCoverageGap, type UnresolvedGrcReference } from "./connected-grc-model";
import type { ConnectedGapType } from "./connected-grc-gaps";
type ExportScope = { ready: number; total: number; loading: boolean; generatedAt: string };
const csv = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function connectedGrcExport(links: ConnectedGrcLink[], scope: ExportScope) {
  if (scope.loading) return null;
  const partial = scope.ready < scope.total;
  const status = partial ? "partial" : "loaded";
  const header = ["Source module", "Source code", "Source title", "Relationship", "Field", "Target module", "Target code", "Target title", "Matched reference", "Source coverage", "Loaded sources", "Expected sources", "Exported at"];
  const metadata = [status, scope.ready, scope.total, scope.generatedAt];
  const rows = links.map(link => [link.source.module, link.source.code || link.source.id, connectedTitle(link.source), link.relation, link.field, link.target.module, link.target.code || link.target.id, connectedTitle(link.target), link.matched, ...metadata]);
  // Even a zero-connection export must retain its source-coverage context.
  if (!rows.length) rows.push([...Array(9).fill(""), ...metadata]);
  return {
    filename: partial ? "fornost-connected-grc-partial.csv" : "fornost-connected-grc.csv",
    content: "\uFEFF" + [header, ...rows].map(row => row.map(csv).join(";")).join("\n"),
  };
}

// Export all filtered findings, independently of the UI's incremental render limits.
export function connectedGrcGapExport(gaps: ConnectedGrcCoverageGap[], unresolved: UnresolvedGrcReference[], scope: ExportScope, filters: {
  query: string; module: string; type: ConnectedGapType;
}) {
  if (scope.loading) return null;
  const partial = scope.ready < scope.total;
  const header = ['Issue type', 'Severity', 'Source module', 'Source ID', 'Source code', 'Source title', 'Rule', 'Relationship', 'Field', 'Reference', 'Candidate records (JSON)', 'Source coverage', 'Loaded sources', 'Expected sources', 'Exported at', 'Search filter', 'Module filter', 'Issue filter', 'Exported issues'];
  const metadata = [partial ? 'partial' : 'loaded', scope.ready, scope.total, scope.generatedAt, filters.query, filters.module, filters.type, gaps.length + unresolved.length];
  const rows: unknown[][] = gaps.map(gap => ['connection-gap', gap.severity, gap.row.module, gap.row.id, gap.row.code || '', connectedTitle(gap.row), gap.rule, gap.missingRelations.join(' | '), '', '', '', ...metadata]);
  rows.push(...unresolved.map(item => [item.reason, '', item.source.module, item.source.id, item.source.code || '', connectedTitle(item.source), '', item.relation, item.field, item.value, JSON.stringify(item.candidates.map(row => ({id:row.id, code:row.code || '', module:row.module, title:connectedTitle(row)}))), ...metadata]));
  // Zero results are a filtered view, never an assertion that the organization has no gaps.
  if (!rows.length) rows.push([...Array(11).fill(''), ...metadata]);
  return {
    filename: partial ? 'fornost-connected-grc-gaps-partial.csv' : 'fornost-connected-grc-gaps.csv',
    content: '\uFEFF' + [header, ...rows].map(row => row.map(csv).join(';')).join('\n'),
  };
}
