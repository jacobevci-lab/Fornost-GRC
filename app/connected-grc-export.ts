import { connectedTitle, type ConnectedGrcLink } from "./connected-grc-model";
const csv = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export function connectedGrcExport(links: ConnectedGrcLink[], scope: {
  ready: number; total: number; loading: boolean; generatedAt: string;
}) {
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
