import { connectedTitle, type ConnectedGrcLink, type ConnectedGrcCoverageGap, type UnresolvedGrcReference } from "./connected-grc-model";
import type { ConnectedGapType } from "./connected-grc-gaps";
import { assuranceChainReasonLabel, type ContinuousAssuranceChain } from "./continuous-assurance-chain";
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

// Export the full loaded assessment, not the 12-row follow-up preview.
export function connectedGrcAssuranceExport(chains: ContinuousAssuranceChain[], scope: ExportScope, lang: "tr" | "en") {
  if (scope.loading || !Number.isSafeInteger(scope.total) || scope.total < 1 || scope.ready !== scope.total) return null;
  const header = ["Rule ID", "Rule code", "Rule title", "Assurance result", "Assurance score", "Chain state", "Reason codes (JSON)", "Reasons (JSON)", "Open findings", "Overdue remediations", "Controls (JSON)", "Findings (JSON)", "Remediations (JSON)", "Risks (JSON)", "Freshness", "Health", "Source coverage", "Loaded sources", "Expected sources", "Exported rules", "Exported at", "Language"];
  const refs = (rows: ContinuousAssuranceChain["controls"]) => JSON.stringify(rows.map(row => ({id:row.id, code:row.code || "", module:row.module})));
  const metadata = ["loaded", scope.ready, scope.total, chains.length, scope.generatedAt, lang];
  const rows: unknown[][] = chains.map(chain => [chain.rule.id, chain.rule.code || "", connectedTitle(chain.rule), chain.assuranceState, chain.assuranceScore, chain.chainState, JSON.stringify(chain.escalationReasons), JSON.stringify(chain.escalationReasons.map(reason => assuranceChainReasonLabel(reason, lang))), chain.openFindings, chain.overdueRemediations, refs(chain.controls), refs(chain.findings), refs(chain.remediations), refs(chain.risks), chain.freshness, chain.health, ...metadata]);
  // No configured rules is not proof of effective controls.
  if (!rows.length) rows.push(["", "", "", "", "", "no-rules", ...Array(10).fill(""), ...metadata]);
  return {filename:"fornost-connected-grc-assurance.csv", content:"\uFEFF" + [header, ...rows].map(row => row.map(csv).join(";")).join("\n")};
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
